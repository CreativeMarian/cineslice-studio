import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useUIStore, type ToastItem } from '../../stores/useUIStore';
import { cn } from '../../utils';

function ToastCard({ toast }: { toast: ToastItem }) {
  const { hideToast } = useUIStore();

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-[var(--success)] flex-shrink-0" />,
    error: <XCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-[var(--warning)] flex-shrink-0" />,
    info: <Info className="w-5 h-5 text-[var(--info)] flex-shrink-0" />,
  };

  const borderColor = toast.severity === 'critical'
    ? 'border-[var(--danger)]/50'
    : toast.type === 'error'
    ? 'border-[var(--danger)]/40'
    : toast.type === 'warning'
    ? 'border-[var(--warning)]/40'
    : toast.type === 'success'
    ? 'border-[var(--success)]/40'
    : 'border-[var(--info)]/40';

  const bgColor = toast.severity === 'critical'
    ? 'bg-[var(--danger)]/10'
    : 'bg-[var(--bg)]';

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-[var(--radius-control)] shadow-[var(--shadow-float)] border',
        'min-w-[280px] max-w-md animate-slide-up',
        borderColor,
        bgColor
      )}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm text-[var(--ink-1)] leading-relaxed break-words">
        {toast.message}
      </p>
      <button
        onClick={() => hideToast(toast.id)}
        className="text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors p-0.5 flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function Toast() {
  const { toasts } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-h-[80vh] overflow-y-auto pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
    </div>
  );
}
