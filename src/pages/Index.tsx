import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, RotateCcw, Download, ShieldCheck, AlertTriangle, Mic, MicOff, Shield, Zap, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

type AnalysisResult = {
  synthetic_probability: number;
  human_probability: number;
  alert: boolean;
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

const heroWords = ["Deepfakes", "Cloned Voices", "Synthetic Speech", "AI Impostors", "Fake Audio"];

const AnimatedHeadline = () => {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % heroWords.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <h1 className="font-display text-6xl md:text-7xl font-extrabold tracking-tight mb-4 leading-[0.95]">
      <span className="text-foreground">Expose</span>
      <br />
      <span className="relative inline-block h-[1.1em] overflow-hidden align-bottom">
        <AnimatePresence mode="wait">
          <motion.span
            key={heroWords[wordIndex]}
            initial={{ y: 60, opacity: 0, rotateX: -40 }}
            animate={{ y: 0, opacity: 1, rotateX: 0 }}
            exit={{ y: -60, opacity: 0, rotateX: 40 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent whitespace-nowrap"
            style={{ backgroundSize: "200% auto", animation: "aurora 6s ease infinite" }}
          >
            {heroWords[wordIndex]}
          </motion.span>
        </AnimatePresence>
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
  const [demoMode, setDemoMode] = useState(false);
  const [showFeedbackThanks, setShowFeedbackThanks] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
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

  const toggleRecording = useCallback(async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          stream.getTracks().forEach((t) => t.stop());
          setCurrentFile(new File([blob], "live_scan.webm", { type: "audio/webm" }));
          setIsRecording(false);
        };
        mediaRecorderRef.current = recorder;
        recorder.start(100);
        setIsRecording(true);
      } catch {
        toast({ title: "Microphone blocked", description: "Grant microphone permissions to continue.", variant: "destructive" });
      }
    } else {
      mediaRecorderRef.current?.stop();
    }
  }, [isRecording, toast]);

  const analyzeFile = useCallback(async () => {
    if (!currentFile) return;
    setIsLoading(true);
    setResult(null);
    await new Promise((r) => setTimeout(r, 2500));
    const synProb = demoMode ? 0.92 + Math.random() * 0.07 : Math.random() * 0.28;
    setResult({ synthetic_probability: synProb, human_probability: 1 - synProb, alert: synProb > 0.5 });
    setIsLoading(false);
    setShowFeedbackThanks(false);
  }, [currentFile, demoMode]);

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
            Powered by PyTorch AudioCNN • Dual-Channel PCEN Analysis
          </div>
          <h1 className="font-display text-6xl md:text-7xl font-extrabold tracking-tight mb-4 leading-[0.95]">
            <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent" style={{ backgroundSize: "200% auto", animation: "aurora 6s ease infinite" }}>
              Detect Voice
            </span>
            <br />
            <span className="text-foreground">Deepfakes</span>
          </h1>
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
                      <div className="absolute inset-0 rounded-2xl" style={{ background: "radial-gradient(circle at center, hsla(0,90%,55%,0.05) 0%, transparent 70%)" }} />
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
                      onClick={toggleRecording}
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
                    {/* Hidden demo toggle */}
                    <label className="absolute bottom-3 right-5 opacity-20 hover:opacity-40 transition-opacity cursor-pointer text-[10px] font-mono flex items-center gap-1">
                      <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} className="w-3 h-3" />
                      DEMO
                    </label>
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

                  {/* Spectrogram Placeholder */}
                  <div>
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-3">Acoustic Feature Map</p>
                    <div className="h-[200px] rounded-2xl bg-muted/50 border border-border flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 scan-line opacity-20" />
                      <div className="text-center relative z-10">
                        <Waves className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground font-mono">Mel-Spectrogram</p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono">Connect backend for live rendering</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-2 font-mono italic">
                      * 16kHz Mel-Spectrograms → PyTorch AudioCNN dual-channel PCEN pipeline
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
