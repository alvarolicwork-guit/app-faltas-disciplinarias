"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
};

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--gold-500)] text-[var(--navy-900)] hover:bg-[var(--gold-400)] active:bg-[var(--gold-600)] shadow-sm hover:shadow-md font-semibold",
  secondary:
    "bg-[var(--navy-800)] text-white hover:bg-[var(--navy-700)] active:bg-[var(--navy-900)] shadow-sm font-semibold",
  danger:
    "bg-[var(--danger-500)] text-white hover:bg-[var(--danger-600)] active:bg-red-700 shadow-sm font-semibold",
  ghost:
    "bg-transparent text-[var(--navy-600)] hover:bg-[var(--navy-100)] hover:text-[var(--navy-900)]",
  outline:
    "bg-transparent border border-[var(--border)] text-[var(--navy-700)] hover:bg-[var(--navy-50)] hover:border-[var(--navy-300)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3 text-base gap-2.5 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  children,
  disabled,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center
        transition-all duration-[var(--duration-fast)] ease-out
        disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
        cursor-pointer select-none
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...rest}
    >
      {loading ? (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children && <span>{children}</span>}
      {iconRight && !loading && <span className="flex-shrink-0">{iconRight}</span>}
    </button>
  );
}
