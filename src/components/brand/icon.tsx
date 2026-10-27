import type { ReactNode } from "react";

/**
 * Iconos de la marca (Manual FRSKO v3.7, cap. 13): lienzo de 40 × 40, trazo de 2, extremos y uniones
 * redondos, sin relleno salvo UNA burbuja menta por icono. El trazo toma el color del texto
 * (teal sobre claro, crema sobre profundo) y la burbuja siempre es `--primary`.
 * No mezclar con otras familias de iconos ni usar emojis como iconos.
 */
const GLYPHS = {
  // Del manual
  neuro: (
    <>
      <circle cx="12" cy="14" r="6" />
      <circle cx="28" cy="12" r="5" />
      <circle cx="22" cy="28" r="7" />
      <path d="M17 17l2 5M26 17l-2 4" />
      <Bubble cx={33} cy={30} r={3.5} />
    </>
  ),
  results: (
    <>
      <path d="M7 33V20M17 33V12M27 33V24" />
      <path d="M4 33h32" />
      <Bubble cx={33} cy={9} r={4} />
    </>
  ),
  search: (
    <>
      <circle cx="17" cy="17" r="10" />
      <path d="M25 25l9 9" />
      <Bubble cx={17} cy={17} r={3.5} />
    </>
  ),
  target: (
    <>
      <circle cx="20" cy="20" r="15" />
      <circle cx="20" cy="20" r="8" />
      <Bubble cx={20} cy={20} r={3.5} />
    </>
  ),
  agenda: (
    <>
      <rect x="5" y="8" width="30" height="27" rx="5" />
      <path d="M5 16h30M13 4v8M27 4v8" />
      <Bubble cx={27} cy={26} r={3.5} />
    </>
  ),
  chat: (
    <>
      <path d="M7 9h26a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H18l-8 6v-6H7a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z" />
      <Bubble cx={20} cy={18} r={3.5} />
    </>
  ),
  bolt: (
    <>
      <path d="M22 4L9 23h9l-2 13 13-19h-9z" />
      <Bubble cx={32} cy={8} r={4} />
    </>
  ),
  // Nuevos, con la misma construcción
  folder: (
    <>
      <path d="M5 12a2 2 0 0 1 2-2h8l4 4h14a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <Bubble cx={31} cy={27} r={3.5} />
    </>
  ),
  eye: (
    <>
      <path d="M3 20s6-11 17-11 17 11 17 11-6 11-17 11S3 20 3 20z" />
      <circle cx="20" cy="20" r="6" />
      <Bubble cx={20} cy={20} r={2.8} />
    </>
  ),
  survey: (
    <>
      <path d="M10 6h20a2 2 0 0 1 2 2v26a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M14 16h12M14 23h12M14 30h5" />
      <Bubble cx={33} cy={31} r={3.5} />
    </>
  ),
  link: (
    <>
      <path d="M17 23a7 7 0 0 0 10 0l5-5a7 7 0 0 0-10-10l-2 2" />
      <path d="M23 17a7 7 0 0 0-10 0l-5 5a7 7 0 0 0 10 10l2-2" />
      <Bubble cx={34} cy={34} r={3.5} />
    </>
  ),
  table: (
    <>
      <rect x="4" y="8" width="32" height="24" rx="3" />
      <path d="M4 16h32M14 16v16" />
      <Bubble cx={26} cy={24} r={3} />
    </>
  ),
  settings: (
    <>
      <path d="M6 12h13M29 12h5M6 28h5M21 28h13" />
      <circle cx="24" cy="12" r="3.5" />
      <Bubble cx={16} cy={28} r={3.5} />
    </>
  ),
  plus: (
    <>
      <path d="M20 9v22M9 20h22" />
      <Bubble cx={32} cy={8} r={3.5} />
    </>
  ),
  download: (
    <>
      <path d="M20 6v19M12 17l8 8 8-8M7 33h26" />
      <Bubble cx={33} cy={9} r={3.5} />
    </>
  ),
  copy: (
    <>
      <rect x="13" y="13" width="22" height="22" rx="3" />
      <path d="M27 13V8a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v17a2 2 0 0 0 2 2h5" />
      <Bubble cx={24} cy={24} r={3} />
    </>
  ),
  trash: (
    <>
      <path d="M7 11h26M15 11V7h10v4M10 11l1.5 22h17L30 11" />
      <Bubble cx={20} cy={23} r={3} />
    </>
  ),
  user: (
    <>
      <circle cx="18" cy="14" r="6" />
      <path d="M6 35c0-7 5-11 12-11s12 4 12 11" />
      <Bubble cx={33} cy={10} r={3.5} />
    </>
  ),
  check: (
    <>
      <circle cx="20" cy="20" r="15" />
      <path d="M13 20.5l5 5 9-10" />
      <Bubble cx={34} cy={7} r={3.5} />
    </>
  ),
  alert: (
    <>
      <path d="M20 5L4 34h32z" />
      <path d="M20 15v9" />
      <Bubble cx={20} cy={29} r={2.4} />
    </>
  ),
  clock: (
    <>
      <circle cx="20" cy="20" r="14" />
      <path d="M20 12v9l6 3" />
      <Bubble cx={34} cy={7} r={3.5} />
    </>
  ),
  device: (
    <>
      <rect x="10" y="4" width="20" height="32" rx="4" />
      <Bubble cx={20} cy={30} r={2.6} />
    </>
  ),
  ban: (
    <>
      <circle cx="20" cy="20" r="14" />
      <path d="M10 10l20 20" />
      <Bubble cx={34} cy={7} r={3.5} />
    </>
  ),
  inbox: (
    <>
      <path d="M5 22l5-14h20l5 14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <path d="M5 22h9l2 4h8l2-4h9" />
      <Bubble cx={20} cy={14} r={3.2} />
    </>
  ),
  lock: (
    <>
      <rect x="8" y="18" width="24" height="17" rx="3" />
      <path d="M13 18v-5a7 7 0 0 1 14 0v5" />
      <Bubble cx={20} cy={26} r={3} />
    </>
  ),
  refresh: (
    <>
      <path d="M33 15A14 14 0 0 0 8 14M7 5v9h9M7 25a14 14 0 0 0 25 1M33 35v-9h-9" />
      <Bubble cx={20} cy={20} r={3} />
    </>
  ),
  arrow: (
    <>
      <path d="M7 20h24M23 12l8 8-8 8" />
      <Bubble cx={33} cy={8} r={3.2} />
    </>
  ),
  layers: (
    <>
      <path d="M20 5L4 13l16 8 16-8z" />
      <path d="M4 21l16 8 16-8M4 29l16 8 16-8" />
      <Bubble cx={20} cy={13} r={3} />
    </>
  ),
  flag: (
    <>
      <path d="M9 36V6M9 8h20l-4 7 4 7H9" />
      <Bubble cx={17} cy={15} r={3} />
    </>
  ),
  image: (
    <>
      <rect x="4" y="7" width="32" height="26" rx="4" />
      <path d="M4 28l9-9 8 8 5-5 10 9" />
      <Bubble cx={27} cy={15} r={3.2} />
    </>
  ),
  radio: (
    <>
      <circle cx="20" cy="20" r="14" />
      <Bubble cx={20} cy={20} r={5.5} />
    </>
  ),
  checks: (
    <>
      <rect x="6" y="6" width="28" height="28" rx="6" />
      <path d="M13 20.5l5 5 9-10" />
      <Bubble cx={33} cy={7} r={3.5} />
    </>
  ),
  scale: (
    <>
      <path d="M5 20h30M8 13v14M32 13v14" />
      <Bubble cx={20} cy={20} r={4.2} />
    </>
  ),
  gauge: (
    <>
      <path d="M6 30a14 14 0 0 1 28 0" />
      <path d="M20 30l7-9" />
      <Bubble cx={20} cy={30} r={3.2} />
    </>
  ),
  hash: (
    <>
      <path d="M15 6l-3 24M28 6l-3 24M6 14h26M5 24h26" />
      <Bubble cx={33} cy={34} r={3.2} />
    </>
  ),
  lines: (
    <>
      <path d="M6 11h28M6 19h28M6 27h15" />
      <Bubble cx={31} cy={30} r={3.4} />
    </>
  ),
  coin: (
    <>
      <circle cx="20" cy="20" r="15" />
      <path d="M24.5 14.5h-6a3.5 3.5 0 0 0 0 7h3a3.5 3.5 0 0 1 0 7h-6.5M20 10v4.5M20 28.5V32" />
      <Bubble cx={34} cy={7} r={3.4} />
    </>
  ),
  chevron: (
    <>
      <path d="M9 15l11 11 11-11" />
      <Bubble cx={33} cy={8} r={3.2} />
    </>
  ),
  close: (
    <>
      <path d="M11 11l18 18M29 11L11 29" />
      <Bubble cx={33} cy={33} r={3.2} />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof GLYPHS;

function Bubble({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="var(--primary)" stroke="none" />;
}

/** Icono de marca. Decorativo por defecto (`aria-hidden`); pasa `title` si es la única etiqueta del control. */
export function Icon({ name, className = "size-6", title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {GLYPHS[name]}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];
