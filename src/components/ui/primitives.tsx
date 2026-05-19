import { type ReactNode } from "react";

type BadgeVariant = "default" | "success" | "danger" | "warning" | "info" | "gold";

const styles: Record<BadgeVariant, string> = {
  default: "bg-[var(--navy-100)] text-[var(--navy-700)]",
  success: "bg-[var(--success-100)] text-[var(--success-600)]",
  danger: "bg-[var(--danger-100)] text-[var(--danger-600)]",
  warning: "bg-[var(--warning-100)] text-[var(--warning-600)]",
  info: "bg-[var(--info-100)] text-[var(--info-600)]",
  gold: "bg-[var(--gold-100)] text-[var(--gold-600)]",
};

export function Badge({
  children,
  variant = "default",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full ${styles[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full animate-pulse-dot ${variant === "success" ? "bg-[var(--success-500)]" : variant === "danger" ? "bg-[var(--danger-500)]" : variant === "warning" ? "bg-[var(--warning-500)]" : "bg-current"}`} />}
      {children}
    </span>
  );
}

/* ─── Skeleton ─── */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-shimmer rounded-lg ${className}`} />;
}

/* ─── Card ─── */
export function Card({
  children,
  className = "",
  hover = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      className={`
        bg-white rounded-2xl border border-[var(--border)] shadow-sm
        ${hover ? "transition-all duration-200 hover:shadow-md hover:border-[var(--navy-300)] hover:-translate-y-0.5 cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </Component>
  );
}

/* ─── EmptyState ─── */
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
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in">
      {icon && <div className="mb-4 text-[var(--navy-300)]">{icon}</div>}
      <h3 className="text-base font-semibold text-[var(--navy-700)]">{title}</h3>
      {description && <p className="mt-1 text-sm text-[var(--navy-400)] max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ─── Spinner ─── */
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg className="animate-spin text-[var(--gold-500)]" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
