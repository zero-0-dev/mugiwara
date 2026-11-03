import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { AlertCircle, Check, X } from "lucide-react";

interface ToastItem {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastItem["type"]) => void;
  error: (message: string) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    const timer = setTimeout(() => removeToast(id), 4000);
    timers.current.set(id, timer);
  }, [removeToast]);

  const toast = useCallback((message: string, type?: ToastItem["type"]) => addToast(message, type), [addToast]);
  const error = useCallback((message: string) => addToast(message, "error"), [addToast]);
  const success = useCallback((message: string) => addToast(message, "success"), [addToast]);

  return (
    <ToastContext.Provider value={{ toast, error, success }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">
              {t.type === "success" ? <Check size={16} /> : t.type === "error" ? <AlertCircle size={16} /> : null}
            </span>
            <span className="toast-message">{t.message}</span>
            <button className="toast-close" onClick={() => removeToast(t.id)}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
