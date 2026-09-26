"use client";

import type { LoopState } from "@/app/_data/schema";
import { postReleaseMode, releaseUpdate } from "@/components/loop/useLoop";
import { followUpsPrompted, updateCards } from "./registry";

export function Retention({
  state,
  physicianId,
  patientIds,
  onApply,
}: {
  state: LoopState;
  physicianId: string;
  patientIds: readonly string[];
  onApply: (next: LoopState) => void;
}) {
  const mine = new Set(patientIds);
  const prompted = followUpsPrompted(state.nudges, mine);
  const mode = state.releases.find((row) => row.physicianId === physicianId)?.mode ?? "review";
  const cards = updateCards(state.nudges, mine);

  return (
    <section
      className="rounded-md border border-line bg-surface px-4 py-4 sm:px-4"
      aria-label="Trial updates"
    >
      <p className="text-[13px] text-ink-3">Follow-ups prompted</p>
      <p className="mt-1 font-mono text-[24px] font-medium leading-none text-ink">{prompted}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        Patients asked to come back after a registry change. Not a revenue figure.
      </p>
      <div
        className="mt-3 flex flex-wrap gap-2"
        role="group"
        aria-label="When an update goes to the patient"
      >
        <ModeButton
          active={mode === "review"}
          label="Review before the patient is told"
          onClick={() => {
            void postReleaseMode(physicianId, "review").then(onApply);
          }}
        />
        <ModeButton
          active={mode === "auto"}
          label="Send automatically"
          onClick={() => {
            void postReleaseMode(physicianId, "auto").then(onApply);
          }}
        />
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
        {mode === "review"
          ? "Patients are not told until you release the update. They never see what changed."
          : "Patients are told there is news as soon as the registry changes. They still do not see what changed."}
      </p>
      {cards.length > 0 && (
        <ul className="mt-3 space-y-3 border-t border-line pt-3">
          {cards.map((card) => (
            <li key={card.key} className="space-y-1.5">
              <p className="font-mono text-[11px] text-ink-3">{card.nctId}</p>
              <p className="text-[13px] leading-relaxed text-ink">{card.detail}</p>
              <ul className="space-y-1">
                {card.patients.map((patient) => (
                  <li key={patient.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] text-ink">{patient.patientId}</span>
                    {patient.held ? (
                      <>
                        <span className="text-[13px] text-ink-2">Not told yet.</span>
                        <button
                          type="button"
                          onClick={() => {
                            void releaseUpdate(patient.id).then(onApply);
                          }}
                          className="rounded-md bg-ink px-2.5 py-1 text-[13px] font-medium text-surface hover:bg-ink-2"
                        >
                          Tell them to book a follow-up
                        </button>
                      </>
                    ) : (
                      <span className="text-[13px] text-ink-2">Told to book a follow-up.</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-left text-[13px] ${
        active
          ? "border-ink bg-ink text-surface"
          : "border-line bg-surface text-ink hover:border-ink-3"
      }`}
    >
      {label}
    </button>
  );
}
