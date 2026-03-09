// Web Worker for heavy audio feature extraction (runs off main thread)

const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const std = (arr: number[]) => {
  const m = mean(arr);
  return arr.length > 0 ? Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) : 0;
};

interface WorkerInput {
  rawData: Float32Array;
  sampleRate: number;
  duration: number;
  channels: number;
  fileSize: number;
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { rawData, sampleRate, duration, channels, fileSize } = e.data;
  const fileSizeMB = fileSize / (1024 * 1024);

  const segments = 80;
  const segLen = Math.max(256, Math.floor(rawData.length / segments));

  // RMS envelope
  const rmsVals: number[] = [];
  for (let i = 0; i < segments; i++) {
    let sum = 0;
    const start = i * segLen;
    const end = Math.min(start + segLen, rawData.length);
    for (let j = start; j < end; j++) sum += rawData[j] * rawData[j];
    rmsVals.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  const rmsMean = rmsVals.reduce((a, b) => a + b, 0) / rmsVals.length;
  const rmsStd = Math.sqrt(rmsVals.reduce((s, v) => s + (v - rmsMean) ** 2, 0) / rmsVals.length);
  const rmsCV = rmsMean > 0 ? rmsStd / rmsMean : 0;

  // Silence ratio
  const silenceThreshold = rmsMean * 0.12;
  const silent = rmsVals.filter((v) => v < silenceThreshold).length;
  const silenceRatio = silent / rmsVals.length;

  // ZCR
  const zcrVals: number[] = [];
  for (let i = 0; i < segments; i++) {
    const start = i * segLen;
    const end = Math.min(start + segLen, rawData.length);
    let crossings = 0;
    for (let j = start + 1; j < end; j++) {
      if ((rawData[j] >= 0) !== (rawData[j - 1] >= 0)) crossings++;
    }
    zcrVals.push(crossings / Math.max(1, end - start));
  }
  const zcrMean = zcrVals.reduce((a, b) => a + b, 0) / zcrVals.length;
  const zcrStd = Math.sqrt(zcrVals.reduce((s, v) => s + (v - zcrMean) ** 2, 0) / zcrVals.length);

  // Dynamic range
  const absSamples = new Float32Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) absSamples[i] = Math.abs(rawData[i]);
  const sorted = Array.from(absSamples).sort((a, b) => a - b);
  const p = (q: number): number => sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
  const dynSpread = p(0.95) - p(0.05);

  // Bitrate
  const bitrateKbps = duration > 0 ? (fileSize * 8) / duration / 1000 : 0;

  // --- ADVANCED FEATURES ---
  const fftSize = 2048;
  const halfFFT = fftSize / 2;
  const numFFTFrames = Math.min(segments, Math.floor(rawData.length / fftSize));

  const spectralCentroids: number[] = [];
  const spectralFlatnessVals: number[] = [];
  const spectralBandwidths: number[] = [];
  const spectralRolloffs: number[] = [];
  const spectralSkewVals: number[] = [];
  const spectralKurtosisVals: number[] = [];
  const spectralCrestVals: number[] = [];

  for (let i = 0; i < numFFTFrames; i++) {
    const start = i * fftSize;
    const magnitudes: number[] = new Array(halfFFT);
    for (let k = 0; k < halfFFT; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < fftSize; n++) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (fftSize - 1)));
        const sample = (rawData[start + n] || 0) * w;
        const angle = (2 * Math.PI * k * n) / fftSize;
        re += sample * Math.cos(angle);
        im -= sample * Math.sin(angle);
      }
      magnitudes[k] = Math.sqrt(re * re + im * im);
    }

    // Spectral Centroid
    let weightedSum = 0, magSum = 0;
    for (let k = 0; k < halfFFT; k++) {
      const freq = (k * sampleRate) / fftSize;
      weightedSum += freq * magnitudes[k];
      magSum += magnitudes[k];
    }
    const centroid = magSum > 0 ? weightedSum / magSum : 0;
    spectralCentroids.push(centroid);

    // Spectral Flatness
    const nonZero = magnitudes.filter(m => m > 1e-10);
    if (nonZero.length > 0) {
      const logSum = nonZero.reduce((s, m) => s + Math.log(m), 0);
      const geoMean = Math.exp(logSum / nonZero.length);
      const ariMean = nonZero.reduce((s, m) => s + m, 0) / nonZero.length;
      spectralFlatnessVals.push(ariMean > 0 ? geoMean / ariMean : 0);
    } else {
      spectralFlatnessVals.push(0);
    }

    // Spectral Bandwidth
    if (magSum > 0) {
      let bwSum = 0;
      for (let k = 0; k < halfFFT; k++) {
        const freq = (k * sampleRate) / fftSize;
        bwSum += magnitudes[k] * (freq - centroid) ** 2;
      }
      spectralBandwidths.push(Math.sqrt(bwSum / magSum));
    } else {
      spectralBandwidths.push(0);
    }

    // Spectral Rolloff
    const totalMag = magnitudes.reduce((a, b) => a + b, 0);
    let cumMag = 0;
    let rolloffFreq = 0;
    for (let k = 0; k < halfFFT; k++) {
      cumMag += magnitudes[k];
      if (cumMag >= 0.85 * totalMag) {
        rolloffFreq = (k * sampleRate) / fftSize;
        break;
      }
    }
    spectralRolloffs.push(rolloffFreq);

    // Spectral Skewness & Kurtosis
    if (magSum > 0) {
      const bw = spectralBandwidths[spectralBandwidths.length - 1];
      if (bw > 0) {
        let m3 = 0, m4 = 0;
        for (let k = 0; k < halfFFT; k++) {
          const freq = (k * sampleRate) / fftSize;
          const d = (freq - centroid) / bw;
          m3 += magnitudes[k] * d ** 3;
          m4 += magnitudes[k] * d ** 4;
        }
        spectralSkewVals.push(m3 / magSum);
        spectralKurtosisVals.push(m4 / magSum);
      } else {
        spectralSkewVals.push(0);
        spectralKurtosisVals.push(0);
      }
    } else {
      spectralSkewVals.push(0);
      spectralKurtosisVals.push(0);
    }

    // Spectral Crest Factor
    const maxMag = Math.max(...magnitudes);
    const ariMeanMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    spectralCrestVals.push(ariMeanMag > 0 ? maxMag / ariMeanMag : 0);
  }

  const scMean = mean(spectralCentroids);
  const scStd = std(spectralCentroids);
  const sfMean = mean(spectralFlatnessVals);
  const sbMean = mean(spectralBandwidths);
  const sbStd = std(spectralBandwidths);
  const srMean = mean(spectralRolloffs);
  const srStd = std(spectralRolloffs);
  const skewMean = mean(spectralSkewVals);
  const kurtosisMean = mean(spectralKurtosisVals);
  const crestMean = mean(spectralCrestVals);
  const crestStd = std(spectralCrestVals);

  // Energy Entropy
  const totalEnergy = rmsVals.reduce((s, v) => s + v * v, 0);
  let energyEntropy = 0;
  if (totalEnergy > 0) {
    for (const rms of rmsVals) {
      const prob = (rms * rms) / totalEnergy;
      if (prob > 0) energyEntropy -= prob * Math.log2(prob);
    }
  }
  const maxEntropy = Math.log2(rmsVals.length);
  const normalizedEntropy = maxEntropy > 0 ? energyEntropy / maxEntropy : 0;

  // Pitch stability (autocorrelation-based F0)
  const pitchEstimates: number[] = [];
  const pitchSegLen = Math.max(2048, Math.floor(rawData.length / 20));
  for (let i = 0; i < 20; i++) {
    const start = i * pitchSegLen;
    const end = Math.min(start + pitchSegLen, rawData.length);
    const seg = rawData.slice(start, end);
    const minLag = Math.floor(sampleRate / 500);
    const maxLag = Math.floor(sampleRate / 60);
    let bestLag = minLag, bestCorr = -1;
    for (let lag = minLag; lag < Math.min(maxLag, seg.length / 2); lag++) {
      let corr = 0, norm1 = 0, norm2 = 0;
      for (let j = 0; j < seg.length - lag; j++) {
        corr += seg[j] * seg[j + lag];
        norm1 += seg[j] * seg[j];
        norm2 += seg[j + lag] * seg[j + lag];
      }
      const normalized = norm1 > 0 && norm2 > 0 ? corr / Math.sqrt(norm1 * norm2) : 0;
      if (normalized > bestCorr) { bestCorr = normalized; bestLag = lag; }
    }
    if (bestCorr > 0.3) {
      pitchEstimates.push(sampleRate / bestLag);
    }
  }
  const pitchMean = mean(pitchEstimates);
  const pitchStdVal = std(pitchEstimates);
  const pitchCV = pitchMean > 0 ? pitchStdVal / pitchMean : 0;

  // Attack sharpness
  const energyDiffs: number[] = [];
  for (let i = 1; i < rmsVals.length; i++) {
    energyDiffs.push(Math.abs(rmsVals[i] - rmsVals[i - 1]));
  }
  const attackSharpness = mean(energyDiffs);
  const attackSharpnessStdVal = std(energyDiffs);

  // HNR
  const hnrValues: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = i * pitchSegLen;
    const end = Math.min(start + pitchSegLen, rawData.length);
    const seg = rawData.slice(start, end);
    let energy = 0;
    for (let j = 0; j < seg.length; j++) energy += seg[j] * seg[j];
    const minLag = Math.floor(sampleRate / 500);
    const maxLag = Math.floor(sampleRate / 60);
    let bestCorr = 0;
    for (let lag = minLag; lag < Math.min(maxLag, seg.length / 2); lag++) {
      let corr = 0;
      for (let j = 0; j < seg.length - lag; j++) corr += seg[j] * seg[j + lag];
      if (corr > bestCorr) bestCorr = corr;
    }
    if (energy > 0 && bestCorr > 0) {
      const r = bestCorr / energy;
      if (r < 1) hnrValues.push(10 * Math.log10(r / (1 - r)));
    }
  }
  const hnrMean = mean(hnrValues);
  const hnrStd = std(hnrValues);

  // Jitter
  let jitter = 0;
  if (pitchEstimates.length > 1) {
    let sumDiffs = 0;
    for (let i = 1; i < pitchEstimates.length; i++) {
      sumDiffs += Math.abs(1 / pitchEstimates[i] - 1 / pitchEstimates[i - 1]);
    }
    const meanPeriod = mean(pitchEstimates.map(f => 1 / f));
    jitter = meanPeriod > 0 ? (sumDiffs / (pitchEstimates.length - 1)) / meanPeriod : 0;
  }

  // Shimmer
  let shimmer = 0;
  if (rmsVals.length > 1) {
    let sumDiffs = 0;
    for (let i = 1; i < rmsVals.length; i++) {
      sumDiffs += Math.abs(rmsVals[i] - rmsVals[i - 1]);
    }
    shimmer = rmsMean > 0 ? (sumDiffs / (rmsVals.length - 1)) / rmsMean : 0;
  }

  // LTAS slope
  const ltasMagnitudes = new Array(halfFFT).fill(0);
  for (let i = 0; i < numFFTFrames; i++) {
    const start = i * fftSize;
    for (let k = 0; k < halfFFT; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < fftSize; n++) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (fftSize - 1)));
        const sample = (rawData[start + n] || 0) * w;
        const angle = (2 * Math.PI * k * n) / fftSize;
        re += sample * Math.cos(angle);
        im -= sample * Math.sin(angle);
      }
      ltasMagnitudes[k] += Math.sqrt(re * re + im * im);
    }
  }
  let ltasSlope = 0;
  {
    const points: { x: number; y: number }[] = [];
    for (let k = 1; k < halfFFT; k++) {
      const freq = (k * sampleRate) / fftSize;
      if (freq > 50 && freq < 8000 && ltasMagnitudes[k] > 0) {
        points.push({ x: Math.log10(freq), y: Math.log10(ltasMagnitudes[k] / numFFTFrames) });
      }
    }
    if (points.length > 2) {
      const mx = mean(points.map(p => p.x));
      const my = mean(points.map(p => p.y));
      let num = 0, den = 0;
      for (const pt of points) {
        num += (pt.x - mx) * (pt.y - my);
        den += (pt.x - mx) ** 2;
      }
      ltasSlope = den > 0 ? num / den : 0;
    }
  }

  // Syllabic modulation
  const rmsRate = sampleRate / segLen;
  let modEnergy4to8 = 0, modEnergyTotal = 0;
  for (let k = 0; k < Math.floor(rmsVals.length / 2); k++) {
    let re = 0, im = 0;
    for (let n = 0; n < rmsVals.length; n++) {
      const angle = (2 * Math.PI * k * n) / rmsVals.length;
      re += rmsVals[n] * Math.cos(angle);
      im -= rmsVals[n] * Math.sin(angle);
    }
    const mag = Math.sqrt(re * re + im * im);
    const modFreq = (k * rmsRate) / rmsVals.length;
    modEnergyTotal += mag * mag;
    if (modFreq >= 4 && modFreq <= 8) modEnergy4to8 += mag * mag;
  }
  const syllabicModRatio = modEnergyTotal > 0 ? modEnergy4to8 / modEnergyTotal : 0;

  // Waveform crest factor
  let peakAmp = 0;
  for (let i = 0; i < rawData.length; i++) {
    const abs = Math.abs(rawData[i]);
    if (abs > peakAmp) peakAmp = abs;
  }
  const waveformCrestFactor = rmsMean > 0 ? peakAmp / rmsMean : 0;

  // Sub-band energy ratios
  let energyLow = 0, energyMid = 0, energyHigh = 0, energyAll = 0;
  for (let k = 0; k < halfFFT; k++) {
    const freq = (k * sampleRate) / fftSize;
    const e2 = ltasMagnitudes[k] ** 2;
    energyAll += e2;
    if (freq < 500) energyLow += e2;
    else if (freq < 2000) energyMid += e2;
    else energyHigh += e2;
  }
  const lowBandRatio = energyAll > 0 ? energyLow / energyAll : 0;
  const midBandRatio = energyAll > 0 ? energyMid / energyAll : 0;
  const highBandRatio = energyAll > 0 ? energyHigh / energyAll : 0;

  const audioFeatures = {
    rmsCV: +rmsCV.toFixed(4),
    dynSpread: +dynSpread.toFixed(4),
    silenceRatio: +silenceRatio.toFixed(4),
    attackSharpnessMean: +attackSharpness.toFixed(5),
    attackSharpnessStd: +attackSharpnessStdVal.toFixed(5),
    shimmer: +shimmer.toFixed(5),
    waveformCrestFactor: +waveformCrestFactor.toFixed(3),
    syllabicModRatio: +syllabicModRatio.toFixed(5),
    zcrMean: +zcrMean.toFixed(4),
    zcrStd: +zcrStd.toFixed(5),
    spectralCentroidMean: +scMean.toFixed(2),
    spectralCentroidStd: +scStd.toFixed(2),
    spectralFlatnessMean: +sfMean.toFixed(5),
    spectralBandwidthMean: +sbMean.toFixed(2),
    spectralBandwidthStd: +sbStd.toFixed(2),
    spectralRolloffMean: +srMean.toFixed(2),
    spectralRolloffStd: +srStd.toFixed(2),
    spectralSkewMean: +skewMean.toFixed(4),
    spectralKurtosisMean: +kurtosisMean.toFixed(4),
    spectralCrestMean: +crestMean.toFixed(4),
    spectralCrestStd: +crestStd.toFixed(4),
    ltasSlope: +ltasSlope.toFixed(4),
    lowBandRatio: +lowBandRatio.toFixed(4),
    midBandRatio: +midBandRatio.toFixed(4),
    highBandRatio: +highBandRatio.toFixed(4),
    pitchMeanHz: +pitchMean.toFixed(1),
    pitchCV: +pitchCV.toFixed(4),
    pitchSegmentsDetected: pitchEstimates.length,
    jitter: +jitter.toFixed(5),
    energyEntropyNormalized: +normalizedEntropy.toFixed(4),
    hnrMean: +hnrMean.toFixed(2),
    hnrStd: +hnrStd.toFixed(2),
    duration: +duration.toFixed(2),
    bitrateKbps: +bitrateKbps.toFixed(1),
    fileSizeMB: +fileSizeMB.toFixed(2),
    fileName: "audio_sample",
    sampleRate,
    channels,
  };

  self.postMessage(audioFeatures);
};
