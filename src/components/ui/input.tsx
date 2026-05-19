"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, className = "", id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--navy-700)]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--navy-400)]">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full rounded-xl border bg-white px-4 py-2.5 text-sm
              text-[var(--navy-900)] placeholder:text-[var(--navy-400)]
              transition-all duration-[var(--duration-fast)]
              focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/30 focus:border-[var(--gold-500)]
              ${icon ? "pl-10" : ""}
              ${
                error
                  ? "border-[var(--danger-500)] focus:ring-[var(--danger-500)]/30 focus:border-[var(--danger-500)]"
                  : "border-[var(--border)] hover:border-[var(--navy-300)]"
              }
              ${className}
            `}
            {...rest}
          />
        </div>
        {error && <p className="text-xs text-[var(--danger-600)]">{error}</p>}
        {hint && !error && <p className="text-xs text-[var(--navy-400)]">{hint}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";

/* ─── Textarea variant ─── */
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--navy-700)]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`
            w-full rounded-xl border bg-white px-4 py-2.5 text-sm
            text-[var(--navy-900)] placeholder:text-[var(--navy-400)]
            transition-all duration-[var(--duration-fast)]
            focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/30 focus:border-[var(--gold-500)]
            resize-none
            ${error ? "border-[var(--danger-500)]" : "border-[var(--border)] hover:border-[var(--navy-300)]"}
            ${className}
          `}
          {...rest}
        />
        {error && <p className="text-xs text-[var(--danger-600)]">{error}</p>}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
