"use client";

/** Opens the browser print dialog so the letter can be saved as a PDF. */
export function PrintLetter() {
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-3"
      >
        Download PDF
      </button>
      <p className="text-right text-[11px] text-ink-3">In the print dialog, choose Save as PDF.</p>
    </div>
  );
}
