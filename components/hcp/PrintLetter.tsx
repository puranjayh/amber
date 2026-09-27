"use client";

import { downloadNotes, type NotePage } from "@/components/console/notesPdf";

/** Saves the take-home note as a PDF. Nothing is emailed or printed. */
export function PrintLetter({ pages, filename }: { pages: NotePage[]; filename: string }) {
  return (
    <button
      type="button"
      onClick={() => downloadNotes(pages, filename)}
      className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-3"
    >
      Download PDF
    </button>
  );
}
