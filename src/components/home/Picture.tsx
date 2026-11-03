/* eslint-disable @next/next/no-img-element -- pre-sized WebP sets (scripts: see public/images/home), so no runtime optimiser is needed. */
import type { CSSProperties } from "react";

/** Responsive illustration sets in /public/images/home, generated once from the source paintings. */
export const ART = {
  hero: { base: "hero", widths: [828, 1280, 1672], w: 1672, h: 941 },
  heroPortrait: { base: "hero-portrait", widths: [750, 1120], w: 1120, h: 1400 },
  setting: { base: "setting", widths: [768, 1200], w: 1200, h: 800 },
  cosmicWide: { base: "cosmic-wide", widths: [1280, 1911], w: 1911, h: 819 },
  cosmic: { base: "cosmic", widths: [828, 1280], w: 1280, h: 720 },
  ch01: { base: "ch01", widths: [640, 960], w: 960, h: 720 },
  ch02: { base: "ch02", widths: [640, 960], w: 960, h: 720 },
  ch18: { base: "ch18", widths: [640, 960], w: 960, h: 720 },
  lamp: { base: "lamp", widths: [560, 900], w: 900, h: 900 },
  dusk: { base: "dusk", widths: [800, 1200], w: 1200, h: 630 },
  fightOrFlight: { base: "fight-or-flight", widths: [720, 1080], w: 1080, h: 607 },
} as const;

export type ArtKey = keyof typeof ART;
type Art = (typeof ART)[ArtKey];

const url = (a: Art, w: number) => `/images/home/${a.base}-${w}.webp`;
export const srcSet = (a: Art) => a.widths.map((w) => `${url(a, w)} ${w}w`).join(", ");

interface Props {
  art: ArtKey;
  alt: string;
  /** CSS sizes hint, e.g. "(min-width: 1024px) 50vw, 100vw". */
  sizes: string;
  className?: string;
  style?: CSSProperties;
  /** Above-the-fold images load eagerly with high priority; everything else is lazy. */
  priority?: boolean;
  /** Art direction: a different set below a media query (e.g. a portrait crop on phones). */
  alternate?: { media: string; art: ArtKey };
}

export function Picture({ art, alt, sizes, className, style, priority, alternate }: Props) {
  const a = ART[art];
  const img = (
    <img
      src={url(a, a.widths[a.widths.length - 1])}
      srcSet={srcSet(a)}
      sizes={sizes}
      width={a.w}
      height={a.h}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      className={className}
      style={style}
      draggable={false}
    />
  );
  if (!alternate) return img;
  return (
    <picture>
      <source media={alternate.media} srcSet={srcSet(ART[alternate.art])} sizes={sizes} />
      {img}
    </picture>
  );
}
