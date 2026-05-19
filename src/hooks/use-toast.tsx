"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

/* ─── Types ─── */
export type ToastType = "success" | "error" | "warning" | "info";

export type Toast = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

/* ─── Provider ─── */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `toast-${++toastCounter}`;
      const duration = toast.duration ?? 5000;
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => removeToast(id), duration);
    },
    [removeToast],
  );

  const success = useCallback(
    (title: string, description?: string) =>
      addToast({ type: "success", title, description }),
    [addToast],
  );

  const error = useCallback(
    (title: string, description?: string) =>
      addToast({ type: "error", title, description, duration: 8000 }),
    [addToast],
  );

  const warning = useCallback(
    (title: string, description?: string) =>
      addToast({ type: "warning", title, description }),
    [addToast],
  );

  const info = useCallback(
    (title: string, description?: string) =>
      addToast({ type: "info", title, description }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

/* ─── Hook ─── */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/* ─── Toast Container ─── */
function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-6 left-1/2 z-[9999] flex w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 flex-col gap-3 pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

/* ─── Icons ─── */
const icons: Record<ToastType, ReactNode> = {
  success: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--success-100)" />
      <path d="M6 10l3 3 5-6" stroke="var(--success-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--danger-100)" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="var(--danger-600)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--warning-100)" />
      <path d="M10 6v5M10 13.5v.5" stroke="var(--warning-600)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--info-100)" />
      <path d="M10 9v5M10 6.5v.5" stroke="var(--info-600)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

const bgColors: Record<ToastType, string> = {
  success: "bg-[var(--success-50)] border-[var(--success-500)]",
  error: "bg-[var(--danger-50)] border-[var(--danger-500)]",
  warning: "bg-[var(--warning-50)] border-[var(--warning-500)]",
  info: "bg-[var(--info-50)] border-[var(--info-500)]",
};

/* ─── Toast Item ─── */
function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const isError = toast.type === "error";

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border-l-4 shadow-lg ${bgColors[toast.type]} ${isError ? "px-5 py-4 shadow-xl" : "px-4 py-3"}`}
      style={{ animation: "toast-slide-in 0.35s var(--ease-out) both" }}
    >
      <span className="flex-shrink-0 mt-0.5">{icons[toast.type]}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-[var(--navy-900)] ${isError ? "text-base font-bold" : "text-sm font-semibold"}`}>
          {toast.title}
        </p>
        {toast.description && (
          <p className={`mt-0.5 text-[var(--navy-600)] ${isError ? "text-sm leading-relaxed" : "text-xs"}`}>
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 p-1 rounded-md hover:bg-black/5 transition-colors"
        aria-label="Cerrar"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l8 8M11 3l-8 8" stroke="var(--navy-400)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
