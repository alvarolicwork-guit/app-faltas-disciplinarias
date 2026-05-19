import { type ReactNode } from "react";

/* ─── Centralized SVG icon library (no external deps) ─── */

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function wrap(
  children: ReactNode,
  { size = 20, className = "", strokeWidth = 1.8 }: IconProps,
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  /* ── Navigation ── */
  dashboard: (p: IconProps = {}) =>
    wrap(
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="4" rx="1" />
        <rect x="3" y="14" width="7" height="4" rx="1" />
        <rect x="14" y="11" width="7" height="7" rx="1" />
      </>,
      p,
    ),

  registro: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </>,
      p,
    ),

  historial: (p: IconProps = {}) =>
    wrap(
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>,
      p,
    ),

  usuarios: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </>,
      p,
    ),

  importar: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </>,
      p,
    ),

  reportes: (p: IconProps = {}) =>
    wrap(
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </>,
      p,
    ),

  /* ── Actions ── */
  search: (p: IconProps = {}) =>
    wrap(
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>,
      p,
    ),

  plus: (p: IconProps = {}) =>
    wrap(
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>,
      p,
    ),

  check: (p: IconProps = {}) =>
    wrap(<polyline points="20 6 9 17 4 12" />, p),

  x: (p: IconProps = {}) =>
    wrap(
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>,
      p,
    ),

  edit: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </>,
      p,
    ),

  trash: (p: IconProps = {}) =>
    wrap(
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      </>,
      p,
    ),

  download: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>,
      p,
    ),

  filter: (p: IconProps = {}) =>
    wrap(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />, p),

  /* ── Status ── */
  alertTriangle: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>,
      p,
    ),

  alertCircle: (p: IconProps = {}) =>
    wrap(
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>,
      p,
    ),

  checkCircle: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </>,
      p,
    ),

  info: (p: IconProps = {}) =>
    wrap(
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </>,
      p,
    ),

  shield: (p: IconProps = {}) =>
    wrap(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, p),

  /* ── UI ── */
  chevronDown: (p: IconProps = {}) =>
    wrap(<polyline points="6 9 12 15 18 9" />, p),

  chevronRight: (p: IconProps = {}) =>
    wrap(<polyline points="9 18 15 12 9 6" />, p),

  chevronLeft: (p: IconProps = {}) =>
    wrap(<polyline points="15 18 9 12 15 6" />, p),

  menu: (p: IconProps = {}) =>
    wrap(
      <>
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </>,
      p,
    ),

  logout: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </>,
      p,
    ),

  user: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>,
      p,
    ),

  building: (p: IconProps = {}) =>
    wrap(
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
      </>,
      p,
    ),

  calendar: (p: IconProps = {}) =>
    wrap(
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>,
      p,
    ),

  fileText: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </>,
      p,
    ),

  trendingUp: (p: IconProps = {}) =>
    wrap(
      <>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </>,
      p,
    ),

  trendingDown: (p: IconProps = {}) =>
    wrap(
      <>
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </>,
      p,
    ),

  loader: (p: IconProps = {}) =>
    wrap(
      <>
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
      </>,
      p,
    ),

  eye: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>,
      p,
    ),

  moreVertical: (p: IconProps = {}) =>
    wrap(
      <>
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
      </>,
      p,
    ),

  arrowUp: (p: IconProps = {}) =>
    wrap(
      <>
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </>,
      p,
    ),

  arrowDown: (p: IconProps = {}) =>
    wrap(
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
      </>,
      p,
    ),

  upload: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </>,
      p,
    ),

  clipboard: (p: IconProps = {}) =>
    wrap(
      <>
        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      </>,
      p,
    ),
};
