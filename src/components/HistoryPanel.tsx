import { motion, AnimatePresence } from "framer-motion";
import { Clock, Trash2, ShieldCheck, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { HistoryEntry } from "@/hooks/use-analysis-history";

type Props = {
  history: HistoryEntry[];
  onClear: () => void;
  open: boolean;
  onClose: () => void;
};

export const HistoryPanel = ({ history, onClear, open, onClose }: Props) => {
  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="history-panel"
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        className="fixed top-0 right-0 z-50 h-full w-full max-w-md glass border-l border-border/50 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">Scan History</h2>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                {history.length} result{history.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs font-mono text-destructive hover:text-destructive" onClick={onClear}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> CLEAR
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {history.length === 0 && (
              <div className="text-center py-16">
                <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground font-mono">No scans yet</p>
              </div>
            )}
            {history.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`rounded-2xl border p-4 ${
                  entry.alert
                    ? "border-destructive/30 bg-destructive/[0.03]"
                    : "border-safe/30 bg-safe/[0.03]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {entry.alert ? (
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-safe shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium truncate">{entry.fileName}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {(entry.fileSize / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-mono text-sm font-bold ${entry.alert ? "text-destructive" : "text-safe"}`}>
                      {entry.alert
                        ? `${(entry.synthetic_probability * 100).toFixed(0)}% AI`
                        : `${(entry.human_probability * 100).toFixed(0)}% Human`}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {new Date(entry.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                {entry.confidence && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase text-muted-foreground">Confidence:</span>
                    <span className={`text-[10px] font-mono font-bold uppercase ${
                      entry.confidence === "high" ? "text-safe" : entry.confidence === "medium" ? "text-warning" : "text-destructive"
                    }`}>{entry.confidence}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </motion.div>

      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />
    </AnimatePresence>
  );
};
