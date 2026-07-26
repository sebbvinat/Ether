/**
 * §15 — íconos de las herramientas de dibujo.
 *
 * Antes eran glifos unicode ("╱", "▢", "φ"). Cada fuente los dibuja distinto,
 * no se alinean entre sí y varios ni siquiera existen en todos los sistemas.
 * Estos son paths propios: mismo grid de 28×28, mismo grosor de trazo y
 * `currentColor`, así que los estados hover/activo que ya existen siguen
 * funcionando sin tocar nada.
 */

type IconProps = {
  /** Lado del ícono en px. */
  size?: number;
  className?: string;
};

function Svg({
  size = 18,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function CursorIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 5v18M5 14h18" />
    </Svg>
  );
}

export function TrendlineIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 21L21 7" />
      <circle cx="7" cy="21" r="2" />
      <circle cx="21" cy="7" r="2" />
    </Svg>
  );
}

export function HLineIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 14h20" />
      <circle cx="14" cy="14" r="2.2" />
    </Svg>
  );
}

export function VLineIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 4v20" />
      <circle cx="14" cy="14" r="2.2" />
    </Svg>
  );
}

export function RayIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="7" cy="21" r="2" />
      <path d="M8.6 19.4L24 4" />
    </Svg>
  );
}

export function RectIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="8" width="18" height="12" rx="1" />
      <circle cx="5" cy="8" r="1.6" />
      <circle cx="23" cy="20" r="1.6" />
    </Svg>
  );
}

export function EllipseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="14" cy="14" rx="10" ry="6.5" />
    </Svg>
  );
}

export function FibIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 6h18M5 11h11M5 16h14M5 21h18" />
    </Svg>
  );
}

export function LongIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 21V9M9 13l5-5 5 5" />
      <path d="M5 24h18" opacity=".5" />
    </Svg>
  );
}

export function ShortIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 7v12M9 15l5 5 5-5" />
      <path d="M5 4h18" opacity=".5" />
    </Svg>
  );
}

export function EraserIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M17 5l6 6-9.5 9.5H9L4.5 16z" />
      <path d="M9 21h13" />
    </Svg>
  );
}

export function TextIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 7h14M14 7v14" />
    </Svg>
  );
}

export function BrushIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 23c3 0 3-3 5-5L21 7l-2-2L8 16c-2 2-3 4-3 7z" />
    </Svg>
  );
}

export function MeasureIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect
        x="3"
        y="12"
        width="22"
        height="7"
        rx="1"
        transform="rotate(-25 14 15)"
      />
      <path d="M9 16l1.5 2M13 13l1.5 2M17 10l1.5 2" />
    </Svg>
  );
}

export function MagnetIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4v9a5 5 0 0010 0V4" />
      <path d="M9 4h4M15 4h4M9 9h4M15 9h4" opacity=".6" />
    </Svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 8h18M11 8V5h6v3M8 8l1 15h10l1-15M12 12v7M16 12v7" />
    </Svg>
  );
}
