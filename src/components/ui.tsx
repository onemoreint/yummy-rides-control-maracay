import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, type LucideIcon } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { REVIEW_LABEL, STATUS_LABEL } from '../lib/format';
import type { AffiliationStatus, ReviewStatus } from '../lib/types';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ------------------------------ Botones ------------------------------ */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary:
    'bg-yummy-500 text-white hover:bg-yummy-400 shadow-glow focus-visible:ring-yummy-300 disabled:bg-yummy-800 disabled:shadow-none',
  secondary: 'bg-ink-700 text-white ring-1 ring-ink-500 hover:bg-ink-600 focus-visible:ring-yummy-400',
  ghost: 'text-yummy-200 hover:bg-ink-700 focus-visible:ring-yummy-400',
  danger: 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-300',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: LucideIcon; size?: 'sm' | 'md' }
>(function Button({ variant = 'primary', loading, icon: Icon, size = 'md', className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
});

/* ------------------------------ Tarjetas ------------------------------ */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border border-ink-600 bg-ink-800/80 p-4 shadow-lg shadow-black/20 sm:p-5', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-white sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------ Formularios ------------------------------ */
const inputBase =
  'w-full rounded-xl border bg-ink-900 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 disabled:opacity-60';
const inputOk = 'border-ink-500 focus:border-yummy-400 focus:ring-yummy-500/40';
const inputErr = 'border-red-500 focus:ring-red-500/40';

export function Field({
  label,
  error,
  hint,
  required,
  children,
  htmlFor,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-200">
        {label} {required && <span className="text-yummy-300">*</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid} className={cx(inputBase, invalid ? inputErr : inputOk, className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ invalid, className, children, ...rest }, ref) {
    return (
      <select ref={ref} aria-invalid={invalid} className={cx(inputBase, invalid ? inputErr : inputOk, className)} {...rest}>
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className, ...rest }, ref) {
    return (
      <textarea ref={ref} aria-invalid={invalid} rows={3} className={cx(inputBase, invalid ? inputErr : inputOk, className)} {...rest} />
    );
  },
);

/* ------------------------------ Insignias ------------------------------ */
const statusStyle: Record<AffiliationStatus, string> = {
  activo: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  pendiente: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  suspendido: 'bg-red-500/15 text-red-300 ring-red-500/30',
  retirado: 'bg-gray-500/20 text-gray-300 ring-gray-500/30',
};
export function StatusBadge({ status, draft }: { status: AffiliationStatus; draft?: boolean }) {
  if (draft) return <Badge className="bg-sky-500/15 text-sky-300 ring-sky-500/30">Borrador</Badge>;
  return <Badge className={statusStyle[status]}>{STATUS_LABEL[status]}</Badge>;
}

const reviewStyle: Record<ReviewStatus, string> = {
  aprobado: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  pendiente: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  observado: 'bg-red-500/15 text-red-300 ring-red-500/30',
};
export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <Badge className={reviewStyle[status]}>{REVIEW_LABEL[status]}</Badge>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', className)}>
      {children}
    </span>
  );
}

/* ------------------------------ Estados ------------------------------ */
export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-gray-400" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-yummy-400" /> {label}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-500 px-6 py-12 text-center">
      <div className="mb-3 rounded-2xl bg-yummy-900/60 p-3 ring-1 ring-yummy-700">
        <Icon className="h-7 w-7 text-yummy-300" />
      </div>
      <p className="font-semibold text-white">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-gray-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------ */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'max-h-[92vh] w-full animate-fadein overflow-y-auto rounded-t-2xl border border-ink-600 bg-ink-800 p-5 sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-ink-700 hover:text-white" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------ Confirmación ------------------------------ */
interface ConfirmOpts {
  title: string;
  message: ReactNode;
  confirmText?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

/* ------------------------------ Avisos ------------------------------ */
type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}
const ToastCtx = createContext<(kind: ToastKind, text: string) => void>(() => {});

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);

  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })), []);
  const close = (v: boolean) => {
    confirm?.resolve(v);
    setConfirm(null);
  };

  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={ask}>
        {children}
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end">
          {toasts.map((t) => {
            const I = icons[t.kind];
            return (
              <div
                key={t.id}
                role="status"
                className={cx(
                  'pointer-events-auto flex w-full max-w-sm animate-fadein items-start gap-3 rounded-xl border p-3 text-sm shadow-xl',
                  t.kind === 'success' && 'border-emerald-500/40 bg-emerald-950 text-emerald-100',
                  t.kind === 'error' && 'border-red-500/40 bg-red-950 text-red-100',
                  t.kind === 'info' && 'border-yummy-500/40 bg-yummy-950 text-yummy-100',
                )}
              >
                <I className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t.text}</span>
              </div>
            );
          })}
        </div>
        <Modal open={!!confirm} onClose={() => close(false)} title={confirm?.title ?? ''}>
          <div className="text-sm text-gray-300">{confirm?.message}</div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button variant={confirm?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {confirm?.confirmText ?? 'Confirmar'}
            </Button>
          </div>
        </Modal>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
export const useConfirm = () => useContext(ConfirmCtx);

/* ------------------------------ Tabs ------------------------------ */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-ink-600 px-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
            value === t.id ? 'border-yummy-400 text-white' : 'border-transparent text-gray-400 hover:text-gray-200',
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-ink-600 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-100">{children || '—'}</dd>
    </div>
  );
}
