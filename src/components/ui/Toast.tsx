import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm">
        {toasts.map((toast) => {
          const icons = {
            success: <CheckCircle size={20} className="text-emerald-600" />,
            error: <AlertCircle size={20} className="text-rose-600" />,
            info: <Info size={20} className="text-blue-600" />,
          };
          const borders = {
            success: "border-emerald-200",
            error: "border-rose-200",
            info: "border-blue-200",
          };
          return (
            <div
              key={toast.id}
              className={`flex items-start gap-3 bg-white rounded-lg shadow-lg border ${borders[toast.type]} px-4 py-3 animate-in slide-in-from-right-5 duration-300`}
            >
              <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
              <p className="text-sm text-slate-700 flex-1">{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
