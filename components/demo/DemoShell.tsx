"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BEATS, advance, isAdvanceKey, isRetreatKey, revealedThrough, retreat } from "./beats";

export function DemoShell({ children }: { children: ReactNode }) {
  const [beat, setBeat] = useState(0);
  const [presenting, setPresenting] = useState(true);
  const skipScroll = useRef(true);
  const root = useRef<HTMLDivElement>(null);
  const safeBeat = Math.min(Math.max(0, beat), BEATS.length - 1);
  const shown = revealedThrough(safeBeat, presenting);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest("[data-advance]");
      if (!target) return;
      const n = Number(target.getAttribute("data-advance"));
      if (Number.isFinite(n)) setBeat(Math.min(Math.max(0, n), BEATS.length - 1));
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPresenting(false);
        return;
      }
      if (isAdvanceKey(e.key)) {
        e.preventDefault();
        setBeat((b) => advance(b));
      } else if (isRetreatKey(e.key)) {
        e.preventDefault();
        setBeat((b) => retreat(b));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting]);

  useEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }
    document
      .getElementById(`beat-${BEATS[safeBeat]}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [safeBeat]);

  return (
    <div
      ref={root}
      data-shown={shown}
      data-active={BEATS[safeBeat]}
      data-presenting={presenting ? "1" : "0"}
    >
      {children}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface px-3 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 text-[13px] text-ink-2">
          {presenting ? (
            <>
              <span>
                <span className="font-medium text-ink">
                  {safeBeat + 1}/{BEATS.length}
                </span>
                <span className="ml-2 text-ink-3">{BEATS[safeBeat]}</span>
              </span>
              <span className="text-ink-3">
                <span className="hidden sm:inline">space or → advances · ← back · </span>
                esc exits
              </span>
            </>
          ) : (
            <>
              <span className="text-ink-3">Presenter off — the whole story is on the page.</span>
              <button
                type="button"
                onClick={() => {
                  setPresenting(true);
                  setBeat(0);
                }}
                className="text-ink hover:underline"
              >
                Resume
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
