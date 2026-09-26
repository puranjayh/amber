/** Honest stand-in when a read model is missing, empty, or failed validation. */
export function MissingData({ file, detail }: { file: string; detail?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-6">
      <p className="text-[15px] font-medium text-ink">Not generated yet</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        <span className="font-mono text-ink">{file}</span> is missing, empty, or failed to validate.
        {detail ? ` ${detail}` : " Run the generator and refresh."}
      </p>
    </div>
  );
}
