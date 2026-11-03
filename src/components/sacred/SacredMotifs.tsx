// The GitaViśva brand mark: an 18-petalled lotus (one petal per adhyāya) within the Sudarshana chakra. Inherits currentColor.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const polar = (r: number, deg: number, cx = 100, cy = 100) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};
const f = (n: number) => n.toFixed(2);

function petal(rIn: number, rOut: number, deg: number, width: number) {
  const [x0, y0] = polar(rIn, deg);
  const [x1, y1] = polar(rOut, deg);
  const [c1x, c1y] = polar((rIn + rOut) / 1.9, deg - width);
  const [c2x, c2y] = polar((rIn + rOut) / 1.9, deg + width);
  return `M${f(x0)} ${f(y0)} Q${f(c1x)} ${f(c1y)} ${f(x1)} ${f(y1)} Q${f(c2x)} ${f(c2y)} ${f(x0)} ${f(y0)}Z`;
}

/** 18-petalled lotus mandala — one petal for each adhyāya. */
export function LotusMandala({ size = 200, petals = 18, ...rest }: P & { petals?: number }) {
  const outer = Array.from({ length: petals }, (_, i) => petal(46, 92, (360 / petals) * i, 360 / petals / 1.7));
  const inner = Array.from({ length: 8 }, (_, i) => petal(18, 44, 45 * i + 22.5, 18));
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={0.6} {...rest}>
      <circle cx="100" cy="100" r="97" strokeWidth={0.5} />
      <circle cx="100" cy="100" r="94" strokeWidth={0.3} strokeDasharray="1 3" />
      {outer.map((d, i) => (
        <path key={`o${i}`} d={d} />
      ))}
      <circle cx="100" cy="100" r="46" strokeWidth={0.5} />
      {inner.map((d, i) => (
        <path key={`i${i}`} d={d} />
      ))}
      <circle cx="100" cy="100" r="17" />
      <circle cx="100" cy="100" r="3" fill="currentColor" />
    </svg>
  );
}

/** Sudarshana Chakra — serrated rim, 24 spokes, concentric hubs. */
export function SudarshanaChakra({ size = 200, ...rest }: P) {
  const teeth = Array.from({ length: 72 }, (_, i) => {
    const d = (360 / 72) * i;
    const [ax, ay] = polar(92, d - 2.2);
    const [bx, by] = polar(99, d);
    const [cx, cy] = polar(92, d + 2.2);
    return `M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}`;
  });
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const d = 15 * i;
    const [ax, ay] = polar(24, d);
    const [bx, by] = polar(84, d);
    return `M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}`;
  });
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={0.6} {...rest}>
      {teeth.map((d, i) => (
        <path key={i} d={d} strokeLinejoin="round" />
      ))}
      <circle cx="100" cy="100" r="91" />
      <circle cx="100" cy="100" r="85" strokeWidth={0.4} />
      {spokes.map((d, i) => (
        <path key={`s${i}`} d={d} strokeWidth={i % 2 ? 0.35 : 0.7} />
      ))}
      <circle cx="100" cy="100" r="24" />
      <circle cx="100" cy="100" r="14" strokeDasharray="2 2" />
      <circle cx="100" cy="100" r="5" fill="currentColor" />
    </svg>
  );
}

/** Static brand mark. The wheel is not animated: motion in the chrome is reserved for state changes. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center text-accent" style={{ width: size, height: size }} aria-hidden>
      <SudarshanaChakra size={size} className="absolute inset-0" strokeWidth={size < 40 ? 1.6 : 0.8} />
      <LotusMandala size={size * 0.62} petals={18} strokeWidth={size < 40 ? 1.4 : 0.7} />
    </span>
  );
}
