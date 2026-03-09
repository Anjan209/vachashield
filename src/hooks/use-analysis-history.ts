import { useState, useCallback, useEffect } from "react";

export type HistoryEntry = {
  id: string;
  fileName: string;
  fileSize: number;
  date: string;
  synthetic_probability: number;
  human_probability: number;
  alert: boolean;
  confidence?: string;
  reasoning?: string;
  key_indicators?: string[];
};

const STORAGE_KEY = "vacha-shield-history";

export function useAnalysisHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const addEntry = useCallback((entry: Omit<HistoryEntry, "id" | "date">) => {
    setHistory((prev) => {
      const updated = [
        { ...entry, id: crypto.randomUUID(), date: new Date().toISOString() },
        ...prev,
      ].slice(0, 50); // keep last 50
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  return { history, addEntry, clearHistory };
}
