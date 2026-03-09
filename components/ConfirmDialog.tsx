import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.9)]">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 ${
              variant === 'danger' ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'
            }`}>
              <AlertTriangle size={20} className={variant === 'danger' ? 'text-red-500' : 'text-amber-500'} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
              <p className="text-slate-500 text-sm mt-1">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-slate-600 border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition active:translate-y-[1px]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-bold text-white rounded-xl border-2 transition shadow-[2px_2px_0px_0px] active:translate-y-[1px] active:shadow-none ${
              variant === 'danger'
                ? 'bg-red-500 hover:bg-red-600 border-red-700 shadow-red-700/80'
                : 'bg-amber-500 hover:bg-amber-600 border-amber-700 shadow-amber-700/80'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
