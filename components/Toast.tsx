import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  message: string;
  duration?: number;
}

// Simple event-based toast system
type ToastListener = (toast: ToastMessage) => void;
const listeners: ToastListener[] = [];

export const showToast = (type: ToastMessage['type'], message: string, duration = 3000) => {
  const toast: ToastMessage = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    type,
    message,
    duration,
  };
  listeners.forEach(fn => fn(toast));
};

const ToastIcon: React.FC<{ type: ToastMessage['type'] }> = ({ type }) => {
  switch (type) {
    case 'success': return <CheckCircle2 size={16} className="text-emerald-500" />;
    case 'warning': return <AlertTriangle size={16} className="text-amber-500" />;
    case 'error': return <AlertTriangle size={16} className="text-red-500" />;
    case 'info': return <Info size={16} className="text-blue-500" />;
  }
};

const borderColors: Record<string, string> = {
  success: 'border-emerald-200',
  warning: 'border-amber-200',
  error: 'border-red-200',
  info: 'border-blue-200',
};

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: ToastMessage) => {
    setToasts(prev => [...prev, toast]);
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, toast.duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    listeners.push(addToast);
    return () => {
      const idx = listeners.indexOf(addToast);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`bg-white/95 backdrop-blur shadow-lg border ${borderColors[toast.type]} rounded-xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-right-2 duration-200`}
        >
          <ToastIcon type={toast.type} />
          <span className="text-sm text-slate-700 flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-slate-600 p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
