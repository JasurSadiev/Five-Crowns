import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/formatting';

/* --------------------------------- Button -------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-felt-500 text-white hover:bg-felt-400 active:bg-felt-600 shadow-[0_8px_20px_-10px_rgba(21,121,90,0.9)]',
  gold: 'bg-gold-sheen text-felt-950 hover:brightness-105 active:brightness-95 font-semibold shadow-[0_8px_22px_-10px_rgba(233,181,52,0.9)]',
  secondary: 'glass text-ink hover:bg-ink/5 dark:hover:bg-white/10',
  ghost: 'text-ink-muted hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-13 px-6 text-base rounded-xl gap-2.5 py-3.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, fullWidth, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium tap-highlight-none',
        'transition-all duration-150 active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/* ---------------------------------- Panel -------------------------------- */

export function Panel({
  className,
  children,
  ...props
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div className={cn('panel p-5', className)} {...props}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-4', className)}>
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------- Input -------------------------------- */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leading, trailing, className, id, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            {leading}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            'h-11 w-full rounded-xl border bg-surface-raised/60 px-3.5 text-sm text-ink',
            'placeholder:text-ink-faint transition focus:border-gold-400',
            'border-line hover:border-ink-faint/60',
            leading && 'pl-10',
            trailing && 'pr-10',
            error && 'border-rose-500 focus:border-rose-500',
            className,
          )}
          {...props}
        />
        {trailing ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">{trailing}</span>
        ) : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-sm text-rose-500">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, className, id, children, ...props },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'h-11 w-full rounded-xl border border-line bg-surface-raised/60 px-3 text-sm text-ink',
          'transition focus:border-gold-400',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {hint ? <p className="mt-1.5 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
});

/* --------------------------------- Switch -------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start justify-between gap-4 py-2.5',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="block text-xs text-ink-muted">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-felt-500' : 'bg-ink/20',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  );
}

/* --------------------------------- Avatar -------------------------------- */

const PRESENCE_DOT: Record<string, string> = {
  online: 'bg-emerald-400',
  away: 'bg-amber-400',
  offline: 'bg-slate-500',
  disconnected: 'bg-rose-500',
};

export function Avatar({
  name,
  src,
  size = 40,
  presence,
  className,
  ring,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: number;
  presence?: 'online' | 'away' | 'offline' | 'disconnected' | null;
  className?: string;
  ring?: boolean;
}): JSX.Element {
  const dimension = { width: size, height: size };
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={dimension}>
      {src ? (
        <img
          src={src}
          alt=""
          style={dimension}
          className={cn('rounded-full object-cover', ring && 'ring-2 ring-gold-400')}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          style={{ ...dimension, fontSize: Math.max(10, size * 0.38) }}
          className={cn(
            'grid place-items-center rounded-full bg-gradient-to-br from-felt-500 to-felt-700 font-semibold text-white',
            ring && 'ring-2 ring-gold-400',
          )}
        >
          {initials(name)}
        </span>
      )}
      {presence ? (
        <span
          title={presence}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface',
            PRESENCE_DOT[presence] ?? PRESENCE_DOT.offline,
          )}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
        />
      ) : null}
    </span>
  );
}

/* --------------------------------- Badge --------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'gold' | 'green' | 'red' | 'blue';
  className?: string;
}): JSX.Element {
  const tones = {
    neutral: 'bg-ink/10 text-ink-muted',
    gold: 'bg-gold-400/15 text-gold-300 ring-1 ring-gold-400/30',
    green: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
    red: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
    blue: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>('button, input')?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[90] grid place-items-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={cn(
              'relative w-full rounded-2xl border border-line bg-surface-raised p-6 shadow-glass',
              widths[size],
            )}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-faint transition hover:bg-ink/10 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 id={titleId} className="font-display text-xl font-semibold text-ink">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
            {children ? <div className="mt-4">{children}</div> : null}
            {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/* -------------------------- Loading & empty states ------------------------ */

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function LoadingState({ label = 'Loading...' }: { label?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-ink-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-gold-400" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-ink-faint">{icon}</div> : null}
      <p className="font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------- Tabs --------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}): JSX.Element {
  return (
    <div
      role="tablist"
      className={cn('inline-flex flex-wrap gap-1 rounded-xl bg-ink/5 p-1 dark:bg-white/5', className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
            value === tab.id ? 'text-ink' : 'text-ink-muted hover:text-ink',
          )}
        >
          {value === tab.id ? (
            <motion.span
              layoutId={`tab-${tabs.map((t) => t.id).join('-')}`}
              className="absolute inset-0 rounded-lg bg-surface-raised shadow-sm"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          ) : null}
          <span className="relative flex items-center gap-1.5">
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 ? (
              <span className="rounded-full bg-gold-400/20 px-1.5 text-[11px] font-semibold text-gold-300">
                {tab.count}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Stat ---------------------------------- */

export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'gold' | 'green' | 'default';
}): JSX.Element {
  return (
    <div className="panel flex items-center gap-3 p-4">
      {icon ? (
        <span
          className={cn(
            'grid h-10 w-10 place-items-center rounded-xl',
            tone === 'gold' && 'bg-gold-400/15 text-gold-300',
            tone === 'green' && 'bg-emerald-500/15 text-emerald-300',
            (!tone || tone === 'default') && 'bg-ink/10 text-ink-muted',
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-xs uppercase tracking-wide text-ink-faint">{label}</p>
        <p className="font-display text-xl font-semibold text-ink">{value}</p>
        {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

export function ScreenLoader({ label }: { label: string }): JSX.Element {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-[3px] border-gold-400/25 border-t-gold-400" />
        <p className="text-sm text-ink-muted">{label}</p>
      </div>
    </div>
  );
}
