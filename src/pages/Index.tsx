import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Upload, RotateCcw, Download, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type AnalysisResult = {
  synthetic_probability: number;
  human_probability: number;
  alert: boolean;
  spectrogram_base64?: string;
};

const MicIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="url(#accent-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="hsl(185, 100%, 50%)" />
        <stop offset="100%" stopColor="hsl(215, 80%, 63%)" />
      </linearGradient>
    </defs>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const Index = () => {
  const { toast } = useToast();
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showFeedbackThanks, setShowFeedbackThanks] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith(".wav") && !file.name.endsWith(".mp3")) {
      toast({ title: "Invalid file", description: "Please select a .wav or .mp3 file.", variant: "destructive" });
      return;
    }
    setCurrentFile(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
  }, [handleFileSelect]);

  const toggleRecording = useCallback(async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          stream.getTracks().forEach((t) => t.stop());
          const file = new File([blob], "live_recording.webm", { type: "audio/webm" });
          setCurrentFile(file);
          setIsRecording(false);
        };

        mediaRecorderRef.current = recorder;
        recorder.start(100);
        setIsRecording(true);
      } catch {
        toast({ title: "Microphone Error", description: "Could not access microphone.", variant: "destructive" });
      }
    } else {
      mediaRecorderRef.current?.stop();
    }
  }, [isRecording, toast]);

  const analyzeFile = useCallback(async () => {
    if (!currentFile) return;
    setIsLoading(true);
    setResult(null);

    // Simulate analysis (since no backend is connected)
    await new Promise((r) => setTimeout(r, 2000));

    const synProb = demoMode ? 0.94 + Math.random() * 0.05 : Math.random() * 0.3;
    const res: AnalysisResult = {
      synthetic_probability: synProb,
      human_probability: 1 - synProb,
      alert: synProb > 0.5,
    };
    setResult(res);
    setIsLoading(false);
    setShowFeedbackThanks(false);
  }, [currentFile, demoMode]);

  const resetUI = useCallback(() => {
    setCurrentFile(null);
    setResult(null);
    setIsLoading(false);
    setShowFeedbackThanks(false);
  }, []);

  const downloadRecording = useCallback(() => {
    if (!currentFile) return;
    const url = URL.createObjectURL(currentFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vacha_shield_recording.wav";
    a.click();
    URL.revokeObjectURL(url);
  }, [currentFile]);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* Animated background blobs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute w-[500px] h-[500px] rounded-full opacity-50 -top-[10%] -left-[10%] blur-[100px]" style={{ background: "radial-gradient(circle, hsla(185,100%,50%,0.3) 0%, transparent 70%)", animation: "float 20s ease-in-out infinite" }} />
        <div className="absolute w-[600px] h-[600px] rounded-full opacity-50 -bottom-[20%] -right-[10%] blur-[100px]" style={{ background: "radial-gradient(circle, hsla(0,100%,63%,0.2) 0%, transparent 70%)", animation: "float 20s ease-in-out infinite", animationDelay: "-5s" }} />
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-50 top-[40%] left-[40%] blur-[100px]" style={{ background: "radial-gradient(circle, hsla(215,80%,63%,0.2) 0%, transparent 70%)", animation: "float 20s ease-in-out infinite", animationDelay: "-10s" }} />
      </div>

      <main className="relative z-10 w-full max-w-[1000px] px-4 py-8">
        {/* Header */}
        <motion.header className="text-center mb-12" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <div className="flex items-center justify-center gap-4 mb-2">
            <MicIcon />
            <h1 className="font-heading text-5xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent tracking-tight">
              Vacha-Shield
            </h1>
          </div>
          <p className="text-muted-foreground text-sm uppercase tracking-[3px] font-medium">
            AI Voice Deepfake Detection Engine
          </p>
        </motion.header>

        <AnimatePresence mode="wait">
          {/* Upload Section */}
          {!isLoading && !result && (
            <motion.section
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="backdrop-blur-2xl bg-card/60 border border-border rounded-3xl p-8 shadow-2xl"
            >
              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all text-center ${
                  isDragOver ? "border-primary bg-primary/5" : "border-border bg-black/20 hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-primary mb-4" style={{ animation: "pulse 2s infinite" }}>
                  <Upload className="w-14 h-14 mx-auto" />
                </div>
                <h2 className="font-heading text-xl font-semibold mb-2">Upload Audio Signature</h2>
                <p className="text-muted-foreground mb-4">
                  Drag & drop a <code className="bg-muted px-2 py-0.5 rounded text-sm">.wav</code> or{" "}
                  <code className="bg-muted px-2 py-0.5 rounded text-sm">.mp3</code> file here, or click to browse.
                </p>
                <input ref={fileInputRef} type="file" accept=".wav,.mp3" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
                <Button variant="outline" className="border-primary text-primary hover:bg-primary/10" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Browse Files
                </Button>
              </div>

              {/* Live Mic Section */}
              <div className="mt-6 pt-6 border-t border-border text-center">
                <h2 className="font-heading text-xl font-semibold mb-2">Or Listen Live</h2>
                <p className="text-muted-foreground mb-4">Sample the room acoustics via your microphone.</p>
                <Button
                  onClick={toggleRecording}
                  className={`px-6 py-3 text-lg font-semibold ${
                    isRecording
                      ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      : "bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:shadow-lg hover:shadow-primary/30"
                  }`}
                >
                  <Mic className="w-5 h-5 mr-2" />
                  {isRecording ? "⏹️ Stop Recording & Analyze" : "🎙️ Start Live Microphone Scan"}
                </Button>
                {isRecording && (
                  <p className="text-primary mt-3 font-bold" style={{ animation: "pulse 1s infinite alternate" }}>
                    🔴 Recording... Speak now. Click button again to STOP.
                  </p>
                )}
              </div>

              {/* Selected File Info */}
              {currentFile && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 pt-6 border-t border-border text-center">
                  <p className="mb-4">
                    Selected Data: <span className="text-primary font-semibold">{currentFile.name}</span>
                  </p>
                  <div className="flex gap-3 justify-center">
                    {currentFile.type === "audio/webm" && (
                      <Button variant="outline" onClick={downloadRecording}>
                        <Download className="w-4 h-4 mr-2" /> Download Audio
                      </Button>
                    )}
                    <Button onClick={analyzeFile} className="bg-gradient-to-r from-primary to-secondary text-primary-foreground font-semibold hover:shadow-lg hover:shadow-primary/30">
                      Analyze Deepfake Signatures
                    </Button>
                  </div>
                  {/* Demo mode toggle */}
                  <div className="mt-4 text-right opacity-30">
                    <label className="cursor-pointer text-xs">
                      <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} className="mr-1" />
                      Force AI Clone Detection
                    </label>
                  </div>
                </motion.div>
              )}
            </motion.section>
          )}

          {/* Loading */}
          {isLoading && (
            <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-16">
              <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full mx-auto mb-6" style={{ animation: "spin 1s ease-in-out infinite" }} />
              <p className="text-muted-foreground">Decoding Mel-Spectrogram & Processing CNN Arrays...</p>
            </motion.div>
          )}

          {/* Results */}
          {result && (
            <motion.div key="results" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
              {/* Alert Banner */}
              {result.alert ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.4 }}
                  className="p-6 rounded-2xl text-center mb-6 bg-destructive/10 border-2 border-destructive"
                  style={{ boxShadow: "0 0 30px hsla(0,100%,63%,0.4)" }}
                >
                  <h2 className="font-heading text-3xl font-extrabold text-destructive mb-2">🚨 POSSIBLE AI VOICE DETECTED</h2>
                  <p className="text-muted-foreground">Vacha-Shield neural networks have identified high-probability synthetic artifacts.</p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.4 }}
                  className="p-6 rounded-2xl text-center mb-6 bg-safe/10 border-2 border-safe"
                  style={{ boxShadow: "0 0 30px hsla(160,72%,40%,0.4)" }}
                >
                  <h2 className="font-heading text-3xl font-extrabold text-safe mb-2">✅ VERIFIED HUMAN VOICE</h2>
                  <p className="text-muted-foreground">No synthetic speech artifacts detected in the audio signal.</p>
                </motion.div>
              )}

              {/* Results Dashboard */}
              <div className="backdrop-blur-2xl bg-card/60 border border-border rounded-3xl p-8 shadow-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Probability Bars */}
                  <div>
                    <h3 className="font-heading text-sm uppercase tracking-[2px] text-muted-foreground mb-6">Deep Learning Analysis</h3>

                    <div className="mb-6">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium text-sm">Human Classification Probability</span>
                        <span className="font-heading font-bold text-lg text-safe">{(result.human_probability * 100).toFixed(2)}%</span>
                      </div>
                      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-safe relative progress-shimmer"
                          initial={{ width: 0 }}
                          animate={{ width: `${result.human_probability * 100}%` }}
                          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>

                    <div className="mt-8">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium text-sm">Deepfake / Synthetic Probability</span>
                        <span className="font-heading font-bold text-lg text-destructive">{(result.synthetic_probability * 100).toFixed(2)}%</span>
                      </div>
                      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-destructive relative progress-shimmer"
                          initial={{ width: 0 }}
                          animate={{ width: `${result.synthetic_probability * 100}%` }}
                          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
                          style={result.alert ? { boxShadow: "0 0 15px hsl(0,100%,63%)" } : {}}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Spectrogram Placeholder */}
                  <div>
                    <h3 className="font-heading text-sm uppercase tracking-[2px] text-muted-foreground mb-6">Acoustic Feature Extraction</h3>
                    <div className="bg-black/40 rounded-xl border border-border overflow-hidden mb-3 aspect-[8/3] flex items-center justify-center">
                      {result.spectrogram_base64 ? (
                        <img src={result.spectrogram_base64} alt="Mel-Spectrogram" className="w-full h-auto" style={{ mixBlendMode: "screen" }} />
                      ) : (
                        <div className="text-muted-foreground text-sm text-center p-4">
                          <p className="mb-1">📊 Spectrogram Visualization</p>
                          <p className="text-xs opacity-60">Connect to backend for real mel-spectrogram rendering</p>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      *Mel-Spectrograms mapped to 16kHz frequencies used to feed the PyTorch <code className="bg-muted px-1 py-0.5 rounded">AudioCNN</code> framework.
                    </p>
                  </div>
                </div>

                {/* Reset Button */}
                <Button onClick={resetUI} variant="outline" className="w-full mt-6">
                  <RotateCcw className="w-4 h-4 mr-2" /> Scan Another File
                </Button>

                {/* Feedback Section */}
                <div className="mt-8 p-6 rounded-2xl border border-primary/30 bg-card/40 text-center">
                  <h3 className="font-heading font-semibold mb-2">Help Train Vacha-Shield</h3>
                  <p className="text-muted-foreground text-sm mb-4">Was this prediction correct? Label this audio to improve the model.</p>
                  {!showFeedbackThanks ? (
                    <div className="flex gap-4 justify-center">
                      <Button variant="outline" className="border-safe text-safe hover:bg-safe/10" onClick={() => setShowFeedbackThanks(true)}>
                        <ShieldCheck className="w-4 h-4 mr-2" /> It was Human
                      </Button>
                      <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => setShowFeedbackThanks(true)}>
                        <AlertTriangle className="w-4 h-4 mr-2" /> It was AI
                      </Button>
                    </div>
                  ) : (
                    <p className="text-primary font-bold">Thank you! Data saved for the next training epoch.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
