"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = "", id, ...rest }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-[var(--navy-700)]">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`
              w-full appearance-none rounded-xl border bg-white px-4 py-2.5 pr-10 text-sm
              text-[var(--navy-900)] transition-all duration-150
              focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/30 focus:border-[var(--gold-500)]
              cursor-pointer
              ${error ? "border-[var(--danger-500)]" : "border-[var(--border)] hover:border-[var(--navy-300)]"}
              ${className}
            `}
            {...rest}
          >
            {placeholder && <option value="" disabled>{placeholder}</option>}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--navy-400)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
        {error && <p className="text-xs text-[var(--danger-600)]">{error}</p>}
      </div>
    );
  },
);

Select.displayName = "Select";
