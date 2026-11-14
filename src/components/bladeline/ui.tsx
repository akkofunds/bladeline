import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'xl' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-display font-semibold leading-none tracking-[0.06em] text-foreground',
        size === 'sm' && 'text-2xl',
        size === 'md' && 'text-4xl',
        size === 'xl' && 'text-7xl sm:text-9xl',
        className,
      )}
    >
      <BladeMark className={cn(size === 'xl' ? 'h-[0.8em]' : 'h-[0.75em]')} />
      <span>
        BLADE<span className="text-primary">LINE</span>
      </span>
    </span>
  )
}

/** A slanted katana stroke used as the brand mark. */
export function BladeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('aspect-square', className)} aria-hidden>
      <path d="M6 34 L30 6 L34 8 L11 36 Z" fill="currentColor" className="text-foreground" />
      <path d="M4 36 L10 30 L13 33 L7 39 Z" fill="var(--primary)" />
      <path d="M8 27 L15 34" stroke="var(--primary)" strokeWidth="3" />
    </svg>
  )
}

type Variant = 'primary' | 'ghost' | 'outline' | 'dark'

export function AngledButton({
  variant = 'primary',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'clip-btn relative inline-flex min-h-11 items-center justify-center gap-2 px-6 font-display text-2xl uppercase leading-none tracking-[0.08em] transition-[background-color,color,transform] duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] motion-reduce:transition-none [&_svg]:size-5 [&_svg]:shrink-0',
        variant === 'primary' && 'bg-primary pt-1 text-primary-foreground hover:bg-[oklch(0.7_0.22_20)]',
        variant === 'dark' && 'bg-[oklch(0.12_0.02_255/0.9)] pt-1 text-foreground hover:bg-[oklch(0.2_0.03_255)]',
        variant === 'outline' &&
          'bg-transparent pt-1 text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-white/10',
        variant === 'ghost' && 'bg-white/5 pt-1 text-foreground hover:bg-white/15',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('clip-panel border border-border bg-card backdrop-blur-md', className)}>{children}</div>
  )
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground', className)}>
      {children}
    </p>
  )
}

export function ControlsGrid({ controls }: { controls: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-left text-sm sm:grid-cols-3">
      {controls.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="font-semibold text-accent">{k}</dt>
          <dd className="text-white/75">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Overlay({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <div
      className={cn(
        'safe-pad absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-[oklch(0.1_0.02_255/0.72)] text-center backdrop-blur-sm',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
