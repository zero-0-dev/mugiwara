import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Toaster, toast as sonnerToast } from "sonner";

interface ToastContextValue {
  toast: (message: string, type?: "success" | "error" | "info") => void;
  error: (message: string) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function useDocumentTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.dataset.mode === "light" ? "light" : "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    const update = () =>
      setTheme(root.dataset.mode === "light" ? "light" : "dark");
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-mode"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useDocumentTheme();

  const addToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "info") => {
      if (type === "success") sonnerToast.success(message);
      else if (type === "error") sonnerToast.error(message);
      else sonnerToast(message);
    },
    [],
  );

  const toast = useCallback(
    (message: string, type?: "success" | "error" | "info") =>
      addToast(message, type),
    [addToast],
  );
  const error = useCallback(
    (message: string) => addToast(message, "error"),
    [addToast],
  );
  const success = useCallback(
    (message: string) => addToast(message, "success"),
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ toast, error, success }}>
      {children}
      <Toaster
        theme={theme}
        position="bottom-right"
        closeButton
        richColors
        offset={{ bottom: 24, right: 24 }}
        toastOptions={{
          classNames: {
            toast:
              "!rounded-xl !border !border-border !bg-popover !text-popover-foreground !shadow-2xl",
            description: "!text-muted-foreground",
            actionButton: "!bg-primary !text-primary-foreground",
            cancelButton: "!bg-secondary !text-secondary-foreground",
          },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
