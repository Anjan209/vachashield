import FFT from "fft.js";

export type SpectralStats = {
  spectralCentroidMean: number; // 0..1 (normalized by Nyquist)
  spectralCentroidStd: number; // 0..1
  spectralFlatnessMean: number; // 0..1
  spectralRolloffMean: number; // 0..1 (normalized by Nyquist, 85% energy)
  spectralFluxMean: number; // arbitrary scale, normalized per-bin
};

function mean(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function std(arr: number[], m: number) {
  if (!arr.length) return 0;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

function hannWindow(n: number) {
  const w = new Float32Array(n);
  const denom = n - 1;
  for (let i = 0; i < n; i++) {
    w[i] = denom > 0 ? 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom)) : 1;
  }
  return w;
}

function downsampleTo(signal: Float32Array, inSampleRate: number, outSampleRate: number) {
  if (!signal.length) return signal;
  if (Math.abs(inSampleRate - outSampleRate) < 1) return signal;

  const ratio = inSampleRate / outSampleRate;
  const outLen = Math.max(1, Math.floor(signal.length / ratio));
  const out = new Float32Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(signal.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = signal[i0] * (1 - t) + signal[i1] * t;
  }

  return out;
}

export function computeSpectralStats(
  signal: Float32Array,
  sampleRate: number,
  opts?: {
    targetSampleRate?: number;
    maxSeconds?: number;
    frameSize?: number;
    hopSize?: number;
    rolloffEnergy?: number;
  }
): SpectralStats {
  const targetSampleRate = opts?.targetSampleRate ?? 16000;
  const maxSeconds = opts?.maxSeconds ?? 20;
  const frameSize = opts?.frameSize ?? 2048;
  const hopSize = opts?.hopSize ?? 1024;
  const rolloffEnergy = opts?.rolloffEnergy ?? 0.85;

  const maxSamples = Math.min(signal.length, Math.max(1, Math.floor(sampleRate * maxSeconds)));
  const clipped = signal.subarray(0, maxSamples);
  const x = downsampleTo(clipped, sampleRate, targetSampleRate);

  if (x.length < frameSize) {
    return {
      spectralCentroidMean: 0,
      spectralCentroidStd: 0,
      spectralFlatnessMean: 0,
      spectralRolloffMean: 0,
      spectralFluxMean: 0,
    };
  }

  const fft = new FFT(frameSize);
  const window = hannWindow(frameSize);

  const input = new Float64Array(frameSize);
  const spectrum = fft.createComplexArray();

  const mags = new Float64Array(frameSize / 2 + 1);
  let prevMags: Float64Array | null = null;

  const centroidVals: number[] = [];
  const flatnessVals: number[] = [];
  const rolloffVals: number[] = [];
  const fluxVals: number[] = [];

  const nyquist = targetSampleRate / 2;
  const eps = 1e-12;

  for (let start = 0; start + frameSize <= x.length; start += hopSize) {
    for (let i = 0; i < frameSize; i++) input[i] = x[start + i] * window[i];

    // Real FFT
    fft.realTransform(spectrum, input as unknown as number[]);
    fft.completeSpectrum(spectrum);

    // Magnitudes (0..N/2)
    for (let k = 0; k < mags.length; k++) {
      const re = spectrum[2 * k] ?? 0;
      const im = spectrum[2 * k + 1] ?? 0;
      mags[k] = Math.sqrt(re * re + im * im);
    }

    // Centroid
    let sumMag = 0;
    let sumFreqMag = 0;
    for (let k = 0; k < mags.length; k++) {
      const mag = mags[k];
      const freq = (k * targetSampleRate) / frameSize;
      sumMag += mag;
      sumFreqMag += freq * mag;
    }
    const centroidHz = sumMag > 0 ? sumFreqMag / sumMag : 0;
    const centroidNorm = nyquist > 0 ? centroidHz / nyquist : 0;
    centroidVals.push(isFinite(centroidNorm) ? centroidNorm : 0);

    // Flatness
    let logSum = 0;
    let arithSum = 0;
    for (let k = 0; k < mags.length; k++) {
      const m = mags[k] + eps;
      logSum += Math.log(m);
      arithSum += m;
    }
    const geoMean = Math.exp(logSum / mags.length);
    const arithMean = arithSum / mags.length;
    const flatness = arithMean > 0 ? geoMean / arithMean : 0;
    flatnessVals.push(isFinite(flatness) ? flatness : 0);

    // Rolloff (energy)
    let totalEnergy = 0;
    for (let k = 0; k < mags.length; k++) totalEnergy += mags[k] * mags[k];
    const targetEnergy = totalEnergy * rolloffEnergy;
    let cum = 0;
    let rolloffHz = 0;
    for (let k = 0; k < mags.length; k++) {
      cum += mags[k] * mags[k];
      if (cum >= targetEnergy) {
        rolloffHz = (k * targetSampleRate) / frameSize;
        break;
      }
    }
    const rolloffNorm = nyquist > 0 ? rolloffHz / nyquist : 0;
    rolloffVals.push(isFinite(rolloffNorm) ? rolloffNorm : 0);

    // Flux
    if (prevMags) {
      let flux = 0;
      for (let k = 0; k < mags.length; k++) {
        const d = mags[k] - prevMags[k];
        flux += d * d;
      }
      fluxVals.push(flux / mags.length);
    }
    prevMags = mags.slice() as unknown as Float64Array;
  }

  const centroidMean = mean(centroidVals);
  const centroidStd = std(centroidVals, centroidMean);

  const flatnessMean = mean(flatnessVals);
  const rolloffMean = mean(rolloffVals);
  const fluxMean = mean(fluxVals);

  return {
    spectralCentroidMean: centroidMean,
    spectralCentroidStd: centroidStd,
    spectralFlatnessMean: flatnessMean,
    spectralRolloffMean: rolloffMean,
    spectralFluxMean: fluxMean,
  };
}
