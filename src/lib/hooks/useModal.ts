"use client";
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog behaviour (WAI-ARIA APG dialog pattern), shared by every blocking overlay:
 *   focus moves into the dialog on open (an `initial` element, else its first control),
 *   Tab and Shift+Tab stay inside, Escape closes,
 *   everything behind the overlay is `inert` (not reachable by keyboard or screen reader),
 *   and focus returns to whatever opened it.
 * `overlay` is the outermost element of the modal (the scrim); `dialog` is the element with role="dialog".
 * Desktop docks and the mobile sheet are not modal and don't use this.
 */
export function useModal(open: boolean, overlay: RefObject<HTMLElement | null>, dialog: RefObject<HTMLElement | null>, onClose: () => void, initial?: RefObject<HTMLElement | null>) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const inerted: HTMLElement[] = [];
    let raf = 0;
    const setup = () => {
      const top = overlay.current;
      const box = dialog.current;
      if (!top || !box) return void (raf = requestAnimationFrame(setup));
      // Make every sibling on the path from the overlay up to <body> inert.
      for (let node: HTMLElement | null = top; node && node !== document.body; node = node.parentElement) {
        for (const sib of Array.from(node.parentElement?.children ?? []) as HTMLElement[]) {
          if (sib !== node && !sib.inert && sib.tagName !== "SCRIPT") {
            sib.inert = true;
            inerted.push(sib);
          }
        }
      }
      const first = initial?.current ?? box.querySelector<HTMLElement>(FOCUSABLE) ?? box;
      if (!box.contains(document.activeElement)) first.focus({ preventScroll: true });
    };
    setup();
    const onKey = (e: KeyboardEvent) => {
      const box = dialog.current;
      if (!box) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      } else if (e.key === "Tab") {
        const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (!items.length) return e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && (i <= 0 || !box.contains(document.activeElement))) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && (i === items.length - 1 || !box.contains(document.activeElement))) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      for (const el of inerted) el.inert = false;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, overlay, dialog, initial]);
}
