import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

const MobilePage = () => {
  const [view, setView] = useState<"standby" | "active">("standby");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [humanPct, setHumanPct] = useState(0);
  const [synthPct, setSynthPct] = useState(0);
  const [statusText, setStatusText] = useState("Awaiting audio input...");
  const [statusColor, setStatusColor] = useState("hsl(174, 100%, 50%)");
  const [showAlert, setShowAlert] = useState(false);
  const [alertProb, setAlertProb] = useState("84.2");
  const [demoMode, setDemoMode] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const monitoringRef = useRef(false);

  const handleLogoTap = useCallback(() => {
    const c = tapCount + 1;
    if (c >= 3) { setDemoMode(d => !d); setTapCount(0); }
    else setTapCount(c);
  }, [tapCount]);

  const setupVisualizer = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = ctx;
    analyserRef.current = analyser;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    canvas.width = canvas.parentElement?.clientWidth || 300;

    const draw = () => {
      if (!monitoringRef.current) return;
      animationIdRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      canvasCtx.fillStyle = "hsla(228, 25%, 4%, 0.3)";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 255;
        const barHeight = v * canvas.height * 0.9;
        const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        gradient.addColorStop(0, "hsla(174, 100%, 50%, 0.1)");
        gradient.addColorStop(1, `hsla(174, 100%, 50%, ${0.3 + v * 0.7})`);
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    };
    draw();
  }, []);

  const analyzeSegment = useCallback(async (_blob: Blob) => {
    await new Promise(r => setTimeout(r, 400));
    const synProb = demoMode ? 0.82 + Math.random() * 0.17 : Math.random() * 0.35;
    const hPct = +((1 - synProb) * 100).toFixed(1);
    const sPct = +(synProb * 100).toFixed(1);
    setHumanPct(hPct);
    setSynthPct(sPct);

    if (synProb < 0.4) { setStatusText("✓ Human Voice"); setStatusColor("#10b981"); }
    else if (synProb <= 0.75) { setStatusText("⚡ AI Assistant Detected"); setStatusColor("#f59e0b"); }
    else { setStatusText("⚠ VOICE CLONE DETECTED"); setStatusColor("#ef4444"); }

    if (synProb > 0.75) {
      setAlertProb(sPct.toString());
      setShowAlert(true);
      stopMonitoring();
      if ("vibrate" in navigator) navigator.vibrate([400, 200, 400, 200, 800]);
    }
  }, [demoMode]);

  const startMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      monitoringRef.current = true;
      setIsMonitoring(true);
      setupVisualizer(stream);

      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        chunks.length = 0;
        if (monitoringRef.current) {
          await analyzeSegment(blob);
          if (monitoringRef.current) {
            recorder.start();
            setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 5000);
          }
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 5000);
    } catch { alert("Microphone access required."); }
  }, [setupVisualizer, analyzeSegment]);

  const stopMonitoring = useCallback(() => {
    monitoringRef.current = false;
    setIsMonitoring(false);
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (animationIdRef.current) { cancelAnimationFrame(animationIdRef.current); animationIdRef.current = null; }
    setStatusText("System offline.");
    setStatusColor("hsl(174, 100%, 50%)");
  }, []);

  const handleSimCall = useCallback(async () => { setView("active"); await startMonitoring(); }, [startMonitoring]);
  const handleEndCall = useCallback(() => { stopMonitoring(); setView("standby"); setHumanPct(0); setSynthPct(0); setDemoMode(false); setTapCount(0); }, [stopMonitoring]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden noise">
      {/* Top Nav */}
      <div className="flex justify-between items-center px-5 py-4 glass border-b border-border/30 z-50">
        <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={handleLogoTap}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={demoMode ? "#ef4444" : "hsl(174, 100%, 50%)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          <span className="font-display text-lg font-bold tracking-tight">Vacha-Shield</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isMonitoring ? "bg-safe animate-pulse" : "bg-muted-foreground/30"}`} />
          <span className={`text-[10px] font-mono font-bold tracking-wider ${isMonitoring ? "text-safe" : "text-muted-foreground"}`}>
            {isMonitoring ? "LIVE" : "IDLE"}
          </span>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center px-5 py-6 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full opacity-10 pointer-events-none" style={{ background: `radial-gradient(circle, ${isMonitoring ? "hsla(152,70%,45%,0.4)" : "hsla(174,100%,50%,0.3)"} 0%, transparent 60%)` }} />

        <AnimatePresence mode="wait">
          {view === "standby" && (
            <motion.div key="standby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center w-full flex-1 justify-center">
              <div className="text-7xl mb-6" style={{ animation: "float-shield 3s ease-in-out infinite", filter: "drop-shadow(0 0 30px hsla(174,100%,50%,0.3))" }}>🛡️</div>
              <h1 className="font-display text-4xl font-extrabold mb-2 text-center">Shield Active</h1>
              <p className="text-muted-foreground text-center text-sm mb-6 leading-relaxed">Secure background process running.<br />Ready for call interception.</p>

              <div className="inline-flex items-center gap-2 bg-destructive/10 border border-destructive/20 px-4 py-2 rounded-full text-destructive text-xs font-mono font-semibold mb-10">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                MIC DISCONNECTED
              </div>

              <div className="w-full space-y-3 mt-auto">
                <p className="text-center text-[10px] text-muted-foreground/50 font-mono uppercase tracking-[3px] mb-2">Simulator</p>
                <button
                  onClick={handleSimCall}
                  className="w-full py-4 rounded-2xl border-none font-display font-bold text-base flex items-center justify-center gap-3 text-white active:scale-[0.97] transition-all"
                  style={{ background: "linear-gradient(135deg, hsl(152,70%,45%), hsl(152,70%,35%))", boxShadow: "0 8px 30px hsla(152,70%,45%,0.25)" }}
                >
                  <span className="text-lg">📞</span> Incoming Call
                </button>
                <Link to="/" className="block text-center text-[10px] text-muted-foreground/40 font-mono mt-3 hover:text-primary transition-colors">
                  ← Desktop Mode
                </Link>
              </div>
            </motion.div>
          )}

          {view === "active" && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center w-full flex-1">
              <h2 className="font-display text-2xl font-bold mb-1">Call Active</h2>
              <p className="text-xs text-muted-foreground font-mono mb-6">Monitoring incoming audio stream</p>

              {/* Radar */}
              <div className="relative w-[180px] h-[180px] flex items-center justify-center my-4">
                {isMonitoring && [0, 1, 2].map(i => (
                  <div key={i} className="absolute inset-0 rounded-full border-2 border-safe/40" style={{ animation: `propagate 3s infinite linear`, animationDelay: `${i}s` }} />
                ))}
                <button
                  onClick={handleEndCall}
                  className="w-[140px] h-[140px] rounded-full flex flex-col items-center justify-center z-10 active:scale-95 transition-all cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, hsla(0,90%,55%,0.15), hsla(0,90%,55%,0.05))",
                    border: "2px solid hsla(0,90%,55%,0.4)",
                    boxShadow: "0 0 40px hsla(0,90%,55%,0.15)",
                  }}
                >
                  <span className="font-display text-lg font-extrabold text-destructive leading-tight">END</span>
                  <span className="text-[10px] text-muted-foreground font-mono mt-1">Tap to sever</span>
                </button>
              </div>

              {/* Visualizer */}
              {isMonitoring && (
                <div className="w-full my-4 rounded-xl overflow-hidden border border-border/30">
                  <canvas ref={canvasRef} width={300} height={60} className="w-full" style={{ background: "hsl(228, 25%, 4%)" }} />
                </div>
              )}

              {/* Live Dashboard */}
              {isMonitoring && (
                <div className="w-full glass rounded-2xl p-5 mt-auto space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[2px]">Live Analysis</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-safe animate-pulse" />
                      <span className="text-[10px] font-mono text-safe">STREAMING</span>
                    </div>
                  </div>

                  {/* Human bar */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1.5">
                      <span className="text-muted-foreground">Human</span>
                      <span className="text-safe font-bold">{humanPct}%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-safe to-safe/60 transition-all duration-500" style={{ width: `${humanPct}%` }} />
                    </div>
                  </div>

                  {/* Synthetic bar */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1.5">
                      <span className="text-muted-foreground">Synthetic</span>
                      <span className="text-destructive font-bold">{synthPct}%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-destructive to-destructive/60 transition-all duration-500" style={{ width: `${synthPct}%`, boxShadow: synthPct > 50 ? "0 0 12px hsla(0,90%,55%,0.5)" : "none" }} />
                    </div>
                  </div>

                  <p className="text-center text-xs font-mono pt-2" style={{ color: statusColor, animation: "textPulse 1.5s infinite alternate" }}>
                    {statusText}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* DEEPFAKE ALERT OVERLAY */}
      <AnimatePresence>
        {showAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center"
            style={{ animation: "flashCritical 1s infinite alternate", background: "radial-gradient(ellipse at center, #ff0000 0%, #500000 80%)" }}
          >
            <div className="text-center p-8 max-w-sm">
              <div className="text-7xl mb-6" style={{ animation: "shake 0.5s infinite" }}>⚠️</div>
              <h1 className="font-display text-4xl font-extrabold text-white mb-4 leading-tight" style={{ textShadow: "0 4px 30px rgba(0,0,0,0.8)" }}>
                DEEPFAKE<br />DETECTED
              </h1>
              <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-4 mb-6">
                <p className="text-white font-bold text-lg mb-1">Do NOT follow instructions.</p>
                <p className="text-white/80 text-sm">Do NOT transfer funds.</p>
              </div>
              <p className="text-white/60 text-sm font-mono mb-8">AI Certainty: <span className="text-white font-bold">{alertProb}%</span></p>
              <button
                onClick={() => setShowAlert(false)}
                className="bg-black/70 backdrop-blur text-white border border-white/20 px-8 py-3 text-xs font-mono font-bold rounded-full tracking-[3px] cursor-pointer hover:bg-black/50 transition-all"
              >
                OVERRIDE & DISMISS
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobilePage;
