"use client";
import { useSyncExternalStore } from "react";

/** Subscribe to a CSS media query. Server render assumes `fallback` (desktop by default). */
export function useMedia(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

export const useIsDesktop = () => useMedia("(min-width: 1024px)", true);
export const useIsMobile = () => useMedia("(max-width: 767px)", false);
export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)", false);
export const useCoarsePointer = () => useMedia("(pointer: coarse)", false);

/** "⌘" on Apple platforms, "Ctrl" elsewhere (resolved on the client to avoid hydration mismatch). */
export function useModKey(): string {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}
