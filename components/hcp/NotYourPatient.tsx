export function NotYourPatient({ patientId }: { patientId: string }) {
  return (
    <section
      className="rounded-md border border-line bg-surface px-4 py-6"
      aria-label="Not your patient"
    >
      <h2 className="text-[18px] font-medium text-ink">Not your patient</h2>
      <p className="mt-1 text-[13px] text-ink-2">
        <span className="font-mono text-ink">{patientId}</span> is not on your panel. You see only
        your own patients. A coordinator on the trial portal is who sees across physicians.
      </p>
    </section>
  );
}
