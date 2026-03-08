import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MobilePage = () => {
  const [view, setView] = useState<"standby" | "active">("standby");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [humanPct, setHumanPct] = useState(0);
  const [synthPct, setSynthPct] = useState(0);
  const [statusText, setStatusText] = useState("Listening for speech segments...");
  const [statusColor, setStatusColor] = useState("hsl(185, 100%, 50%)");
  const [showAlert, setShowAlert] = useState(false);
  const [alertProb, setAlertProb] = useState("84.2");
  const [demoMode, setDemoMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const monitoringRef = useRef(false);

  const handleLogoTap = useCallback(() => {
    const newCount = clickCount + 1;
    if (newCount >= 3) {
      setDemoMode((d) => !d);
      setClickCount(0);
    } else {
      setClickCount(newCount);
    }
  }, [clickCount]);

  const setupVisualizer = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
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
      analyser.getByteTimeDomainData(dataArray);
      canvasCtx.fillStyle = "hsl(220, 40%, 5%)";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = "#00f2fe";
      canvasCtx.beginPath();
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
        x += sliceWidth;
      }
      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };
    draw();
  }, []);

  const analyzeSegment = useCallback(
    async (blob: Blob) => {
      // Simulate analysis
      await new Promise((r) => setTimeout(r, 500));
      const synProb = demoMode ? 0.85 + Math.random() * 0.14 : Math.random() * 0.35;
      const humProb = 1 - synProb;
      const hPct = +(humProb * 100).toFixed(1);
      const sPct = +(synProb * 100).toFixed(1);

      setHumanPct(hPct);
      setSynthPct(sPct);

      if (synProb < 0.4) {
        setStatusText("Human Voice Detected");
        setStatusColor("#10b981");
      } else if (synProb <= 0.75) {
        setStatusText("AI Assistant Detected");
        setStatusColor("#fbbf24");
      } else {
        setStatusText("⚠ POSSIBLE AI VOICE CLONE");
        setStatusColor("#ff4d4d");
      }

      if (synProb > 0.75) {
        setAlertProb(sPct.toString());
        setShowAlert(true);
        stopMonitoring();
        if ("vibrate" in navigator) navigator.vibrate([400, 200, 400, 200, 800, 400]);
      }
    },
    [demoMode]
  );

  const startMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      monitoringRef.current = true;
      setIsMonitoring(true);

      setupVisualizer(stream);

      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        chunks.length = 0;
        if (monitoringRef.current) {
          await analyzeSegment(blob);
          if (monitoringRef.current) {
            recorder.start();
            setTimeout(() => {
              if (recorder.state === "recording") recorder.stop();
            }, 5000);
          }
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 5000);
    } catch {
      alert("Vacha-Shield requires microphone access.");
    }
  }, [setupVisualizer, analyzeSegment]);

  const stopMonitoring = useCallback(() => {
    monitoringRef.current = false;
    setIsMonitoring(false);
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (animationIdRef.current) { cancelAnimationFrame(animationIdRef.current); animationIdRef.current = null; }
    setStatusText("System offline.");
  }, []);

  const handleSimCall = useCallback(async () => {
    setView("active");
    await startMonitoring();
  }, [startMonitoring]);

  const handleEndCall = useCallback(() => {
    stopMonitoring();
    setView("standby");
    setHumanPct(0);
    setSynthPct(0);
    setDemoMode(false);
    setClickCount(0);
  }, [stopMonitoring]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-body">
      {/* Top Nav */}
      <div className="flex justify-between items-center px-5 py-5 bg-background/85 backdrop-blur-xl border-b border-border z-50">
        <div className="flex items-center gap-2 cursor-pointer select-none" onClick={handleLogoTap}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={demoMode ? "#ff4d4d" : "#00f2fe"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          <h2 className="font-heading text-xl font-extrabold">Vacha-Shield</h2>
        </div>
        <div className={`text-xs font-bold px-3 py-1 rounded-full transition-all ${isMonitoring ? "bg-safe/20 text-safe shadow-[0_0_10px_hsla(160,72%,40%,0.3)]" : "bg-muted text-muted-foreground"}`}>
          {isMonitoring ? "MONITORING" : "OFFLINE"}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center px-6 py-8 relative">
        <AnimatePresence mode="wait">
          {/* Standby View */}
          {view === "standby" && (
            <motion.div key="standby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center w-full">
              <div className="text-center mb-8 mt-4">
                <div className="text-6xl mb-4" style={{ animation: "float-shield 3s ease-in-out infinite", filter: "drop-shadow(0 0 15px hsla(185,100%,50%,0.4))" }}>
                  🛡️
                </div>
                <h1 className="font-heading text-4xl font-extrabold mb-2 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                  Shield Active
                </h1>
                <p className="text-muted-foreground">
                  Running securely in background.<br />Waiting for OS Call Intent...
                </p>
              </div>

              <div className="inline-flex items-center gap-2 bg-destructive/10 border border-destructive/30 px-4 py-2 rounded-full mb-8 text-destructive text-sm font-semibold">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                Microphone Hardware Disconnected
              </div>

              <div className="w-full mt-8 flex flex-col gap-4">
                <p className="text-center text-muted-foreground text-xs uppercase tracking-[2px] border-b border-border pb-2">
                  HACKATHON SIMULATOR
                </p>
                <button
                  onClick={handleSimCall}
                  className="w-full py-4 rounded-xl border-none font-semibold text-lg flex items-center justify-center gap-3 text-white active:scale-95 transition-transform"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 4px 15px rgba(16,185,129,0.3)" }}
                >
                  <span className="text-xl">📞</span> Simulate Incoming Call
                </button>
              </div>
            </motion.div>
          )}

          {/* Active View */}
          {view === "active" && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center w-full h-full">
              <div className="text-center mb-4">
                <h1 className="font-heading text-3xl font-extrabold mb-1 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                  Call Monitoring
                </h1>
                <p className="text-muted-foreground text-sm">Secure Incoming Call</p>
              </div>

              {/* Radar */}
              <div className="relative w-[200px] h-[200px] flex items-center justify-center my-8">
                {isMonitoring && (
                  <>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="absolute inset-0 rounded-full border-2 border-safe/50"
                        style={{ animation: `propagate 3s infinite linear`, animationDelay: `${i}s` }}
                      />
                    ))}
                  </>
                )}
                <button
                  onClick={handleEndCall}
                  className="w-40 h-40 rounded-full border-2 border-safe/50 flex flex-col items-center justify-center z-10 transition-all active:scale-95 cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, hsla(160,72%,40%,0.15), hsla(185,100%,50%,0.15))",
                    boxShadow: "0 0 40px hsla(160,72%,40%,0.4)",
                  }}
                >
                  <span className="font-heading text-xl font-extrabold text-destructive leading-tight">
                    END<br />CALL
                  </span>
                  <span className="text-xs text-safe/80 mt-1">Tap to disconnect</span>
                </button>
              </div>

              {/* Audio Visualizer */}
              {isMonitoring && (
                <div className="w-full mb-6">
                  <canvas ref={canvasRef} width={300} height={80} className="w-full rounded-lg" />
                </div>
              )}

              {/* Live Dashboard */}
              {isMonitoring && (
                <div className="w-full bg-muted/30 border border-border rounded-2xl p-5 mt-auto">
                  <h3 className="font-heading text-xs uppercase tracking-[2px] text-muted-foreground mb-4">LIVE FEED</h3>

                  <div className="mb-4">
                    <div className="flex justify-between text-sm font-medium mb-1">
                      <span>Authentic Human</span>
                      <span className="text-safe font-bold">{humanPct}%</span>
                    </div>
                    <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-safe transition-all duration-500" style={{ width: `${humanPct}%` }} />
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-sm font-medium mb-1">
                      <span>Synthetic Audio</span>
                      <span className="text-destructive font-bold">{synthPct}%</span>
                    </div>
                    <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-destructive transition-all duration-500" style={{ width: `${synthPct}%`, boxShadow: synthPct > 50 ? "0 0 10px hsl(0,100%,63%)" : "none" }} />
                    </div>
                  </div>

                  <p className="text-center text-sm font-mono mt-3" style={{ color: statusColor, animation: "textPulse 1.5s infinite alternate" }}>
                    {statusText}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Fullscreen Deepfake Alert Overlay */}
      <AnimatePresence>
        {showAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center"
            style={{ animation: "flashCritical 1s infinite alternate", background: "radial-gradient(circle at center, #ff0000 0%, #aa0000 100%)" }}
          >
            <div className="text-center p-8">
              <div className="text-7xl mb-4" style={{ animation: "shake 0.5s infinite" }}>⚠️</div>
              <h1 className="font-heading text-4xl font-extrabold text-white mb-4 leading-tight" style={{ textShadow: "0 5px 20px rgba(0,0,0,0.8)" }}>
                DEEPFAKE DETECTED
              </h1>
              <p className="text-white text-lg font-semibold mb-6 bg-black/40 p-4 rounded-xl">
                Do NOT follow instructions.<br />Do NOT send funds.
              </p>
              <p className="text-white/80 text-base mb-12">AI Certainty: <span className="font-bold">{alertProb}%</span></p>
              <button
                onClick={() => setShowAlert(false)}
                className="bg-black/80 text-white border-2 border-white/20 px-8 py-3 text-sm font-bold rounded-full tracking-[2px] cursor-pointer hover:bg-black/60 transition-colors"
              >
                OVERRIDE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobilePage;
