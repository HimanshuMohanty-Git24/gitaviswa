"use client";
import { useEffect } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useGita } from "@/lib/store/useGitaStore";
import { useIsDesktop, useIsMobile } from "@/lib/hooks/useMedia";
import { VerseExplorer } from "@/components/reader/VerseExplorer";
import { NodeInspector } from "@/components/graph/NodeInspector";
import { GraphRagChatbot } from "@/components/chat/GraphRagChatbot";
import { FocusSwitch } from "@/components/graph/GraphHud";

/**
 * The right-hand dock holds two things the user moves between constantly: Details (whatever node is selected) and
 * Ask (the companion). Both stay mounted so a streaming answer survives tab switches.
 *   ≥1024px  an in-flow column beside the view, so the canvas re-centres instead of being covered
 *   768–1023 an overlay panel on the right
 *   <768px   a bottom sheet with two snap points (half / full), dragged by its handle
 */
export const SHEET_HEIGHT = { peek: "min(max(34%, 220px), 300px)", half: "min(max(58%, 440px), calc(100% - 8px))", full: "calc(100% - 8px)" } as const;
/** Pixel height of the phone sheet at a snap, for a canvas of height h (mirrors SHEET_HEIGHT). */
export const sheetPx = (snap: keyof typeof SHEET_HEIGHT, h: number) => (snap === "peek" ? Math.min(Math.max(0.34 * h, 220), 300) : snap === "half" ? Math.min(Math.max(0.58 * h, 440), h - 8) : h - 8);

export function RightDock() {
  const selectedId = useGita((s) => s.selectedId);
  const chatOpen = useGita((s) => s.chatOpen);
  const dockTab = useGita((s) => s.dockTab);
  const setDockTab = useGita((s) => s.setDockTab);
  const select = useGita((s) => s.select);
  const setChatOpen = useGita((s) => s.setChatOpen);
  const desktop = useIsDesktop();
  const mobile = useIsMobile();
  const snap = useGita((s) => s.sheetSnap);
  const setSnap = useGita((s) => s.setSheetSnap);
  const view = useGita((s) => s.view);
  const drag = useDragControls();
  // In the graph views the sheet first peeks, so the selection and its connections stay visible above it.
  const graphView = view === "cosmos" || view === "darshana";
  const rest = graphView ? "peek" : "half";

  const hasDetails = !!selectedId;
  const open = hasDetails || chatOpen;
  const tab = !hasDetails ? "ask" : !chatOpen ? "details" : dockTab;
  // Asking is a reading task: give it the full sheet on phones.
  useEffect(() => {
    if (chatOpen && dockTab === "ask") setSnap("full");
  }, [chatOpen, dockTab, setSnap]);
  useEffect(() => {
    if (!open || (snap === "peek" && !graphView)) setSnap(rest);
  }, [open, rest, graphView, snap, setSnap]);
  // Opening something new in a graph view returns to the peek.
  useEffect(() => {
    if (selectedId && graphView && !chatOpen) setSnap("peek");
  }, [selectedId, graphView, chatOpen, setSnap]);

  const closeDetails = () => select(null);
  const both = hasDetails && chatOpen;

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      {both && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          <div className="seg w-full" role="tablist" aria-label="Panel">
            <button role="tab" aria-selected={tab === "details"} className="flex-1" onClick={() => setDockTab("details")}>
              Details
            </button>
            <button role="tab" aria-selected={tab === "ask"} className="flex-1" onClick={() => setDockTab("ask")}>
              Ask
            </button>
          </div>
        </div>
      )}
      <div className={`min-h-0 flex-1 ${tab === "details" ? "" : "hidden"}`}>
        {selectedId && (selectedId.startsWith("BG_") ? <VerseExplorer verseId={selectedId} onClose={closeDetails} /> : <NodeInspector nodeId={selectedId} onClose={closeDetails} />)}
      </div>
      {chatOpen && (
        <div className={`min-h-0 flex-1 ${tab === "ask" ? "" : "hidden"}`}>
          <GraphRagChatbot onClose={() => setChatOpen(false)} />
        </div>
      )}
    </div>
  );

  if (mobile) {
    return (
      <AnimatePresence>
        {open && (
          <motion.aside
            key="sheet"
            role="dialog"
            aria-label={tab === "ask" ? "Ask" : "Details"}
            className="absolute inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-[16px] border-t border-line-2 bg-surface shadow-[var(--shadow-3)]"
            // Peek: about a third of the screen (the graph stays visible). Half: at least 440px, so a short phone still
            // shows a verse's meaning and first action. Full: nearly the whole screen.
            style={{ height: SHEET_HEIGHT[snap] }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.08, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -50 || info.velocity.y < -400) setSnap(snap === "peek" ? "half" : "full");
              else if (info.offset.y > 60 || info.velocity.y > 400) {
                if (snap === "full") setSnap("half");
                else if (snap === "half" && graphView && tab !== "ask") setSnap("peek");
                else if (tab === "ask") setChatOpen(false);
                else closeDetails();
              }
            }}
          >
            <button
              className="flex h-8 w-full shrink-0 touch-none items-center justify-center"
              onPointerDown={(e) => drag.start(e)}
              onClick={() => setSnap(snap === "full" ? rest : snap === "peek" ? "half" : "full")}
              aria-label={snap === "full" ? "Collapse panel" : "Expand panel"}
            >
              <span className="h-1 w-9 rounded-full bg-line-3" />
            </button>
            {view === "cosmos" && tab === "details" && <FocusSwitch className="shrink-0 border-b border-line px-4 pb-2" />}
            <div className="min-h-0 flex-1">{body}</div>
          </motion.aside>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="dock"
          aria-label={tab === "ask" ? "Ask" : "Details"}
          className={
            desktop
              ? "relative z-20 h-full w-[400px] shrink-0 overflow-hidden border-l border-line bg-surface xl:w-[440px]"
              : "absolute inset-y-0 right-0 z-20 w-[400px] overflow-hidden border-l border-line bg-surface shadow-[var(--shadow-3)]"
          }
          initial={desktop ? { width: 0, opacity: 0 } : { x: 24, opacity: 0 }}
          animate={desktop ? { width: "auto", opacity: 1 } : { x: 0, opacity: 1 }}
          exit={desktop ? { width: 0, opacity: 0 } : { x: 24, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="h-full w-[400px] xl:w-[440px]">{body}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
