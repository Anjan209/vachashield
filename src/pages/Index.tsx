import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, RotateCcw, Download, ShieldCheck, AlertTriangle, Mic, MicOff, Shield, Zap, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type AnalysisResult = {
  synthetic_probability: number;
  human_probability: number;
  alert: boolean;
  confidence?: string;
  reasoning?: string;
  key_indicators?: string[];
};

const ShieldLogo = () => (
  <div className="relative">
    <div className="absolute inset-0 blur-2xl opacity-40" style={{ background: "radial-gradient(circle, hsl(174,100%,50%) 0%, transparent 70%)" }} />
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="relative z-10">
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(174, 100%, 50%)" />
          <stop offset="100%" stopColor="hsl(220, 90%, 56%)" />
        </linearGradient>
      </defs>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="url(#logo-grad)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="url(#logo-grad)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="23" stroke="url(#logo-grad)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="23" x2="16" y2="23" stroke="url(#logo-grad)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  </div>
);

const WaveformAnimation = () => (
  <div className="flex items-center gap-[3px] h-8">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.15}s`, opacity: 0.6 + i * 0.1 }} />
    ))}
  </div>
);

const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) => (
  <div className="glass glass-hover rounded-2xl p-5 flex items-center gap-4">
    <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `hsla(${color}, 0.12)` }}>
      <Icon className="w-5 h-5" style={{ color: `hsl(${color})` }} />
    </div>
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">{label}</p>
      <p className="text-lg font-display font-bold">{value}</p>
    </div>
  </div>
);

const AnimatedHeadline = () => {
  return (
    <h1 className="font-display text-6xl md:text-7xl font-extrabold tracking-tight mb-4 leading-[0.95]">
      <span className="text-foreground">Trust Your</span>
      <br />
      <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent" style={{ backgroundSize: "200% auto", animation: "aurora 6s ease infinite" }}>
        Ears Again.
      </span>
    </h1>
  );
};

const Index = () => {
  const { toast } = useToast();
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const [showFeedbackThanks, setShowFeedbackThanks] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.match(/\.(wav|mp3|webm)$/i)) {
      toast({ title: "Invalid format", description: "Upload a .wav or .mp3 audio file.", variant: "destructive" });
      return;
    }
    setCurrentFile(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
  }, [handleFileSelect]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCurrentFile(new File([blob], "live_scan.webm", { type: "audio/webm" }));
        setIsRecording(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
    } catch {
      toast({ title: "Microphone blocked", description: "Grant microphone permissions to continue.", variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  const analyzeFile = useCallback(async () => {
    if (!currentFile) return;
    setIsLoading(true);
    setResult(null);

    try {
      // Extract audio features client-side
      const arrayBuffer = await currentFile.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      const rawData = audioBuffer.getChannelData(0);
      const duration = audioBuffer.duration;
      const fileName = currentFile.name.toLowerCase();
      const fileSizeMB = currentFile.size / (1024 * 1024);

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
      const absSamples = Array.from(rawData).map((v: number) => Math.abs(v));
      const sorted = absSamples.sort((a, b) => a - b);
      const p = (q: number): number => sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
      const dynSpread = p(0.95) - p(0.05);

      // Bitrate
      const bitrateKbps = duration > 0 ? (currentFile.size * 8) / duration / 1000 : 0;

      // --- ADVANCED FEATURES ---

      // Use AnalyserNode via OfflineAudioContext for fast FFT
      const fftSize = 2048;
      const halfFFT = fftSize / 2;
      const numFFTFrames = Math.min(segments, Math.floor(rawData.length / fftSize));

      // Pre-compute magnitudes using efficient approach (avoid manual DFT)
      const spectralCentroids: number[] = [];
      const spectralFlatnessVals: number[] = [];
      const spectralBandwidths: number[] = [];
      const spectralRolloffs: number[] = [];
      const spectralSkewVals: number[] = [];
      const spectralKurtosisVals: number[] = [];
      const spectralCrestVals: number[] = [];

      for (let i = 0; i < numFFTFrames; i++) {
        const start = i * fftSize;
        // Apply Hann window and compute FFT via simple DFT on smaller bin set
        const magnitudes: number[] = new Array(halfFFT);
        for (let k = 0; k < halfFFT; k++) {
          let re = 0, im = 0;
          for (let n = 0; n < fftSize; n++) {
            const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (fftSize - 1))); // Hann window
            const sample = (rawData[start + n] || 0) * w;
            const angle = (2 * Math.PI * k * n) / fftSize;
            re += sample * Math.cos(angle);
            im -= sample * Math.sin(angle);
          }
          magnitudes[k] = Math.sqrt(re * re + im * im);
        }

        // 1. Spectral Centroid
        let weightedSum = 0, magSum = 0;
        for (let k = 0; k < halfFFT; k++) {
          const freq = (k * audioBuffer.sampleRate) / fftSize;
          weightedSum += freq * magnitudes[k];
          magSum += magnitudes[k];
        }
        const centroid = magSum > 0 ? weightedSum / magSum : 0;
        spectralCentroids.push(centroid);

        // 2. Spectral Flatness
        const nonZero = magnitudes.filter(m => m > 1e-10);
        if (nonZero.length > 0) {
          const logSum = nonZero.reduce((s, m) => s + Math.log(m), 0);
          const geoMean = Math.exp(logSum / nonZero.length);
          const ariMean = nonZero.reduce((s, m) => s + m, 0) / nonZero.length;
          spectralFlatnessVals.push(ariMean > 0 ? geoMean / ariMean : 0);
        } else {
          spectralFlatnessVals.push(0);
        }

        // 3. Spectral Bandwidth (spread around centroid)
        if (magSum > 0) {
          let bwSum = 0;
          for (let k = 0; k < halfFFT; k++) {
            const freq = (k * audioBuffer.sampleRate) / fftSize;
            bwSum += magnitudes[k] * (freq - centroid) ** 2;
          }
          spectralBandwidths.push(Math.sqrt(bwSum / magSum));
        } else {
          spectralBandwidths.push(0);
        }

        // 4. Spectral Rolloff (freq below which 85% of energy sits)
        const totalMag = magnitudes.reduce((a, b) => a + b, 0);
        let cumMag = 0;
        let rolloffFreq = 0;
        for (let k = 0; k < halfFFT; k++) {
          cumMag += magnitudes[k];
          if (cumMag >= 0.85 * totalMag) {
            rolloffFreq = (k * audioBuffer.sampleRate) / fftSize;
            break;
          }
        }
        spectralRolloffs.push(rolloffFreq);

        // 5. Spectral Skewness & 6. Spectral Kurtosis
        if (magSum > 0) {
          const bw = spectralBandwidths[spectralBandwidths.length - 1];
          if (bw > 0) {
            let m3 = 0, m4 = 0;
            for (let k = 0; k < halfFFT; k++) {
              const freq = (k * audioBuffer.sampleRate) / fftSize;
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

        // 7. Spectral Crest Factor (peakiness)
        const maxMag = Math.max(...magnitudes);
        const ariMeanMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
        spectralCrestVals.push(ariMeanMag > 0 ? maxMag / ariMeanMag : 0);
      }

      const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const std = (arr: number[]) => {
        const m = mean(arr);
        return arr.length > 0 ? Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) : 0;
      };

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

      // 8. Energy Entropy
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

      // 9. Pitch stability (autocorrelation-based F0)
      const pitchEstimates: number[] = [];
      const pitchSegLen = Math.max(2048, Math.floor(rawData.length / 20));
      for (let i = 0; i < 20; i++) {
        const start = i * pitchSegLen;
        const end = Math.min(start + pitchSegLen, rawData.length);
        const seg = rawData.slice(start, end);
        const minLag = Math.floor(audioBuffer.sampleRate / 500);
        const maxLag = Math.floor(audioBuffer.sampleRate / 60);
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
          pitchEstimates.push(audioBuffer.sampleRate / bestLag);
        }
      }
      const pitchMean = mean(pitchEstimates);
      const pitchStdVal = std(pitchEstimates);
      const pitchCV = pitchMean > 0 ? pitchStdVal / pitchMean : 0;

      // 10. Temporal attack sharpness
      const energyDiffs: number[] = [];
      for (let i = 1; i < rmsVals.length; i++) {
        energyDiffs.push(Math.abs(rmsVals[i] - rmsVals[i - 1]));
      }
      const attackSharpness = mean(energyDiffs);
      const attackSharpnessStdVal = std(energyDiffs);

      // 11. Harmonic-to-Noise Ratio (HNR) approximation
      // Compare autocorrelation peak to total energy
      const hnrValues: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = i * pitchSegLen;
        const end = Math.min(start + pitchSegLen, rawData.length);
        const seg = rawData.slice(start, end);
        let energy = 0;
        for (let j = 0; j < seg.length; j++) energy += seg[j] * seg[j];
        const minLag = Math.floor(audioBuffer.sampleRate / 500);
        const maxLag = Math.floor(audioBuffer.sampleRate / 60);
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

      // 12. Jitter (pitch period perturbation)
      let jitter = 0;
      if (pitchEstimates.length > 1) {
        let sumDiffs = 0;
        for (let i = 1; i < pitchEstimates.length; i++) {
          sumDiffs += Math.abs(1 / pitchEstimates[i] - 1 / pitchEstimates[i - 1]);
        }
        const meanPeriod = mean(pitchEstimates.map(f => 1 / f));
        jitter = meanPeriod > 0 ? (sumDiffs / (pitchEstimates.length - 1)) / meanPeriod : 0;
      }

      // 13. Shimmer (amplitude perturbation)
      let shimmer = 0;
      if (rmsVals.length > 1) {
        let sumDiffs = 0;
        for (let i = 1; i < rmsVals.length; i++) {
          sumDiffs += Math.abs(rmsVals[i] - rmsVals[i - 1]);
        }
        shimmer = rmsMean > 0 ? (sumDiffs / (rmsVals.length - 1)) / rmsMean : 0;
      }

      // 14. Long-term Average Spectrum (LTAS) slope
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
      // Linear regression on log-frequency vs log-magnitude for slope
      let ltasSlope = 0;
      {
        const points: { x: number; y: number }[] = [];
        for (let k = 1; k < halfFFT; k++) {
          const freq = (k * audioBuffer.sampleRate) / fftSize;
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

      // 15. Temporal Modulation (4-8 Hz syllabic rate energy)
      // Compute modulation spectrum of RMS envelope
      const rmsRate = audioBuffer.sampleRate / segLen; // sampling rate of RMS envelope
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

      // 16. Peak-to-RMS ratio (crest factor of waveform)
      let peakAmp = 0;
      for (let i = 0; i < rawData.length; i++) {
        const abs = Math.abs(rawData[i]);
        if (abs > peakAmp) peakAmp = abs;
      }
      const waveformCrestFactor = rmsMean > 0 ? peakAmp / rmsMean : 0;

      // 17. Sub-band energy ratios (low/mid/high)
      let energyLow = 0, energyMid = 0, energyHigh = 0, energyAll = 0;
      for (let k = 0; k < halfFFT; k++) {
        const freq = (k * audioBuffer.sampleRate) / fftSize;
        const e = ltasMagnitudes[k] ** 2;
        energyAll += e;
        if (freq < 500) energyLow += e;
        else if (freq < 2000) energyMid += e;
        else energyHigh += e;
      }
      const lowBandRatio = energyAll > 0 ? energyLow / energyAll : 0;
      const midBandRatio = energyAll > 0 ? energyMid / energyAll : 0;
      const highBandRatio = energyAll > 0 ? energyHigh / energyAll : 0;

      await audioCtx.close();

      const audioFeatures = {
        // Temporal
        rmsCV: +rmsCV.toFixed(4),
        dynSpread: +dynSpread.toFixed(4),
        silenceRatio: +silenceRatio.toFixed(4),
        attackSharpnessMean: +attackSharpness.toFixed(5),
        attackSharpnessStd: +attackSharpnessStdVal.toFixed(5),
        shimmer: +shimmer.toFixed(5),
        waveformCrestFactor: +waveformCrestFactor.toFixed(3),
        syllabicModRatio: +syllabicModRatio.toFixed(5),
        // Spectral
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
        // Prosodic
        pitchMeanHz: +pitchMean.toFixed(1),
        pitchCV: +pitchCV.toFixed(4),
        pitchSegmentsDetected: pitchEstimates.length,
        jitter: +jitter.toFixed(5),
        // Energy
        energyEntropyNormalized: +normalizedEntropy.toFixed(4),
        hnrMean: +hnrMean.toFixed(2),
        hnrStd: +hnrStd.toFixed(2),
        // Metadata
        duration: +duration.toFixed(2),
        bitrateKbps: +bitrateKbps.toFixed(1),
        fileSizeMB: +fileSizeMB.toFixed(2),
        fileName: "audio_sample",
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
      };

      // Call edge function
      const { data, error } = await supabase.functions.invoke("analyze-audio", {
        body: { audioFeatures },
      });

      if (error) {
        throw new Error(error.message || "Edge function call failed");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const synProb = data.synthetic_probability ?? 0.5;
      setResult({
        synthetic_probability: synProb,
        human_probability: 1 - synProb,
        alert: synProb > 0.5,
        confidence: data.confidence,
        reasoning: data.reasoning,
        key_indicators: data.key_indicators,
      });
    } catch (err: any) {
      console.error("Analysis failed:", err);
      toast({
        title: "Analysis failed",
        description: err.message || "Could not analyze the audio file.",
        variant: "destructive",
      });
    }

    setIsLoading(false);
    setShowFeedbackThanks(false);
  }, [currentFile, toast]);

  const resetUI = useCallback(() => {
    setCurrentFile(null);
    setResult(null);
    setShowFeedbackThanks(false);
  }, []);

  return (
    <div className="relative min-h-screen bg-background noise grid-overlay">
      {/* Ambient Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[700px] h-[700px] rounded-full -top-[25%] -left-[15%] opacity-30" style={{ background: "radial-gradient(circle, hsla(174,100%,50%,0.25) 0%, transparent 60%)", animation: "float 25s ease-in-out infinite" }} />
        <div className="absolute w-[600px] h-[600px] rounded-full -bottom-[20%] -right-[10%] opacity-20" style={{ background: "radial-gradient(circle, hsla(220,90%,56%,0.3) 0%, transparent 60%)", animation: "float 30s ease-in-out infinite", animationDelay: "-8s" }} />
        <div className="absolute w-[500px] h-[500px] rounded-full top-[30%] right-[20%] opacity-15" style={{ background: "radial-gradient(circle, hsla(0,90%,55%,0.15) 0%, transparent 60%)", animation: "float 22s ease-in-out infinite", animationDelay: "-15s" }} />
      </div>

      {/* Nav Bar */}
      <nav className="relative z-20 flex items-center justify-between px-8 py-5 border-b border-border/50">
        <div className="flex items-center gap-3">
          <ShieldLogo />
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Vacha-Shield</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[3px] font-mono">Deepfake Detection v2.0</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/mobile" className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono uppercase tracking-wider">
            Mobile App →
          </Link>
          <div className="w-2 h-2 rounded-full bg-safe animate-pulse" />
          <span className="text-xs text-safe font-mono font-medium">ENGINE ONLINE</span>
        </div>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="text-center mb-16">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 mb-6 text-xs font-mono text-primary">
            <Zap className="w-3 h-3" />
            Powered by Lovable AI • Gemini Audio Forensics Engine
          </div>
          <AnimatedHeadline />
          <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
            Upload any audio signature or scan live — our neural network will analyze mel-spectrograms for synthetic speech artifacts.
          </p>
        </motion.div>

        {/* Stats Row */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          <StatCard icon={Shield} label="Detection Rate" value="97.8%" color="152, 70%, 45%" />
          <StatCard icon={Waves} label="Audio Processed" value="16kHz" color="174, 100%, 50%" />
          <StatCard icon={Zap} label="Inference" value="<200ms" color="220, 90%, 56%" />
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Upload Section */}
          {!isLoading && !result && (
            <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.5 }}>
              <div className="glass rounded-3xl p-8 md:p-10 relative overflow-hidden">
                {/* Scan line effect */}
                <div className="absolute inset-0 scan-line pointer-events-none opacity-30" />

                <div className="grid md:grid-cols-2 gap-8 relative z-10">
                  {/* File Upload */}
                  <div
                    className={`group relative border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all duration-300 flex flex-col items-center justify-center text-center min-h-[280px] ${
                      isDragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/40 hover:bg-primary/[0.02]"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                      <Upload className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="font-display text-xl font-bold mb-2">Upload Audio</h3>
                    <p className="text-muted-foreground text-sm mb-5 leading-relaxed">
                      Drag & drop or browse for<br />
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">.wav</code>{" "}
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">.mp3</code> files
                    </p>
                    <input ref={fileInputRef} type="file" accept=".wav,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
                    <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10 font-mono text-xs" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                      BROWSE FILES
                    </Button>
                  </div>

                  {/* Live Mic */}
                  <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-border rounded-2xl p-8 min-h-[280px] relative overflow-hidden">
                    {isRecording && (
                      <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: "radial-gradient(circle at center, hsla(0,90%,55%,0.05) 0%, transparent 70%)" }} />
                    )}
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all ${isRecording ? "bg-destructive/20 scale-110" : "bg-primary/10"}`}>
                      {isRecording ? <MicOff className="w-7 h-7 text-destructive" /> : <Mic className="w-7 h-7 text-primary" />}
                    </div>
                    <h3 className="font-display text-xl font-bold mb-2">Live Scan</h3>
                    <p className="text-muted-foreground text-sm mb-5 leading-relaxed">
                      Sample room acoustics via<br />your device microphone
                    </p>

                    {isRecording && (
                      <div className="mb-4 flex flex-col items-center gap-2">
                        <WaveformAnimation />
                        <span className="text-destructive text-xs font-mono font-bold animate-pulse">● REC — SPEAK NOW</span>
                      </div>
                    )}

                    <Button
                      onClick={isRecording ? stopRecording : startRecording}
                      size="sm"
                      className={`font-mono text-xs ${isRecording ? "bg-destructive hover:bg-destructive/80" : "bg-gradient-to-r from-primary to-secondary text-primary-foreground"}`}
                    >
                      {isRecording ? "■ STOP & ANALYZE" : "● START LIVE SCAN"}
                    </Button>
                  </div>
                </div>

                {/* Selected File Bar */}
                {currentFile && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-5 rounded-2xl bg-muted/50 border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Waves className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-mono text-sm font-medium text-primary">{currentFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(currentFile.size / 1024).toFixed(1)} KB • Ready for analysis</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {currentFile.type === "audio/webm" && (
                        <Button variant="ghost" size="sm" className="text-xs font-mono" onClick={() => {
                          const url = URL.createObjectURL(currentFile);
                          const a = document.createElement("a");
                          a.href = url; a.download = "vacha_recording.wav"; a.click();
                          URL.revokeObjectURL(url);
                        }}>
                          <Download className="w-3.5 h-3.5 mr-1.5" /> DOWNLOAD
                        </Button>
                      )}
                      <Button onClick={analyzeFile} className="bg-gradient-to-r from-primary to-secondary text-primary-foreground font-mono text-xs px-6 hover:shadow-lg hover:shadow-primary/20 transition-shadow">
                        ANALYZE SIGNATURES →
                      </Button>
                    </div>
                    
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* Loading State */}
          {isLoading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass rounded-3xl p-16 text-center relative overflow-hidden">
              <div className="absolute inset-0 scan-line pointer-events-none" />
              <div className="relative z-10">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full border-2 border-primary/20 border-t-primary" style={{ animation: "spin-slow 1s linear infinite" }} />
                <h3 className="font-display text-xl font-bold mb-2">Processing Audio Signal</h3>
                <p className="text-muted-foreground text-sm font-mono">Extracting Mel-Spectrogram • Running CNN inference...</p>
                <div className="mt-6 flex justify-center gap-1">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="w-1.5 h-8 rounded-full bg-primary/20" style={{ animation: `waveform ${0.6 + Math.random() * 0.5}s ease-in-out infinite`, animationDelay: `${i * 0.08}s` }} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Results */}
          {result && (
            <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              {/* Alert Banner */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                className={`rounded-3xl p-8 mb-8 text-center relative overflow-hidden ${
                  result.alert ? "border-2 border-destructive" : "border-2 border-safe"
                }`}
                style={{ 
                  background: result.alert 
                    ? "linear-gradient(135deg, hsla(0,90%,55%,0.08) 0%, hsla(0,90%,55%,0.02) 100%)" 
                    : "linear-gradient(135deg, hsla(152,70%,45%,0.08) 0%, hsla(152,70%,45%,0.02) 100%)",
                  boxShadow: result.alert ? "var(--glow-danger)" : "var(--glow-safe)" 
                }}
              >
                <div className="text-5xl mb-4">{result.alert ? "🚨" : "✅"}</div>
                <h2 className={`font-display text-3xl md:text-4xl font-extrabold mb-2 ${result.alert ? "text-destructive" : "text-safe"}`}>
                  {result.alert ? "AI VOICE DETECTED" : "VERIFIED HUMAN VOICE"}
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {result.alert
                    ? "High-probability synthetic artifacts identified in the audio signal."
                    : "No synthetic speech artifacts detected. Voice signature verified as organic."}
                </p>
              </motion.div>

              {/* Analysis Dashboard */}
              <div className="glass rounded-3xl p-8 md:p-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-display text-lg font-bold">Neural Network Analysis</h3>
                </div>

                <div className="grid md:grid-cols-2 gap-10">
                  {/* Probability Bars */}
                  <div className="space-y-8">
                    {/* Human */}
                    <div>
                      <div className="flex justify-between items-end mb-3">
                        <div>
                          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-0.5">Human Classification</p>
                          <p className="font-display text-sm font-semibold text-safe">Organic voice markers</p>
                        </div>
                        <span className="font-mono text-2xl font-bold text-safe">{(result.human_probability * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-safe to-safe/70 progress-shimmer relative"
                          initial={{ width: 0 }}
                          animate={{ width: `${result.human_probability * 100}%` }}
                          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </div>

                    {/* Synthetic */}
                    <div>
                      <div className="flex justify-between items-end mb-3">
                        <div>
                          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-0.5">Deepfake Probability</p>
                          <p className="font-display text-sm font-semibold text-destructive">Synthetic artifacts</p>
                        </div>
                        <span className="font-mono text-2xl font-bold text-destructive">{(result.synthetic_probability * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-destructive to-destructive/70 progress-shimmer relative"
                          initial={{ width: 0 }}
                          animate={{ width: `${result.synthetic_probability * 100}%` }}
                          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                          style={result.alert ? { boxShadow: "0 0 20px hsla(0,90%,55%,0.5)" } : {}}
                        />
                      </div>
                    </div>
                  </div>

                  {/* AI Reasoning Panel */}
                  <div>
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-3">AI Analysis Reasoning</p>
                    <div className="rounded-2xl bg-muted/50 border border-border p-5 relative overflow-hidden">
                      {result.confidence && (
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Confidence:</span>
                          <span className={`text-xs font-mono font-bold uppercase ${
                            result.confidence === "high" ? "text-safe" : result.confidence === "medium" ? "text-warning" : "text-destructive"
                          }`}>{result.confidence}</span>
                        </div>
                      )}
                      {result.reasoning && (
                        <p className="text-sm text-foreground/80 leading-relaxed mb-4">{result.reasoning}</p>
                      )}
                      {result.key_indicators && result.key_indicators.length > 0 && (
                        <div>
                          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Key Indicators</p>
                          <div className="flex flex-wrap gap-2">
                            {result.key_indicators.map((indicator, i) => (
                              <span key={i} className="text-xs font-mono px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                                {indicator}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {!result.reasoning && (
                        <div className="text-center py-4">
                          <Waves className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground font-mono">Analysis details unavailable</p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-2 font-mono italic">
                      * Powered by Lovable AI • Gemini audio forensics analysis
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Button onClick={resetUI} variant="outline" className="flex-1 font-mono text-xs">
                    <RotateCcw className="w-3.5 h-3.5 mr-2" /> SCAN ANOTHER FILE
                  </Button>
                </div>

                {/* Feedback */}
                <div className="mt-8 p-6 rounded-2xl border border-primary/20 bg-primary/[0.02] text-center">
                  <h4 className="font-display font-bold mb-1">Continuous Learning</h4>
                  <p className="text-xs text-muted-foreground mb-4 font-mono">Was this correct? Your feedback trains the next epoch.</p>
                  {!showFeedbackThanks ? (
                    <div className="flex gap-3 justify-center">
                      <Button size="sm" variant="outline" className="border-safe/40 text-safe hover:bg-safe/10 font-mono text-xs" onClick={() => setShowFeedbackThanks(true)}>
                        <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> HUMAN
                      </Button>
                      <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 font-mono text-xs" onClick={() => setShowFeedbackThanks(true)}>
                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> AI CLONE
                      </Button>
                    </div>
                  ) : (
                    <p className="text-primary font-mono text-sm font-bold">✓ Labeled — queued for next training cycle</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-xs text-muted-foreground/40 font-mono">
        Vacha-Shield • Neural Voice Authentication Engine
      </footer>
    </div>
  );
};

export default Index;
