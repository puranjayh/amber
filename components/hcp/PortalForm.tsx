"use client";

import { useEffect, useState } from "react";
import type { Driver, PortalAnswers } from "@/app/_data/schema";
import { readPortalAnswers, writePortalAnswers } from "./portal";

const TRAVEL = [30, 60, 90, 120] as const;
const VISITS = [1, 2, 4] as const;
const DRIVERS: { id: Driver; label: string }[] = [
  { id: "self", label: "I can drive myself" },
  { id: "family", label: "A family member" },
  { id: "friend", label: "A friend" },
  { id: "none", label: "I do not have a ride" },
];

function Choice({
  name,
  checked,
  onSelect,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  children: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-[13px] ${
        checked ? "border-ink bg-canvas text-ink" : "border-line bg-surface text-ink-2"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      {children}
    </label>
  );
}

export function PortalForm({
  patientId,
  initial,
  live = false,
  onLiveSubmit,
}: {
  patientId: string;
  initial: PortalAnswers;
  live?: boolean;
  onLiveSubmit?: (answers: PortalAnswers) => Promise<void>;
}) {
  const [held, setHeld] = useState({ id: patientId, answers: initial });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  if (held.id !== patientId) {
    setHeld({ id: patientId, answers: initial });
    setSaved(false);
  }
  const answers = held.answers;
  const setAnswers = (next: PortalAnswers) => setHeld({ id: patientId, answers: next });
  const complete =
    answers.maxTravelMinutes !== undefined &&
    answers.maxExtraVisitsPerMonth !== undefined &&
    answers.acceptsPlacebo !== undefined &&
    answers.driver !== undefined;

  useEffect(() => {
    if (live) return;
    const overlay = readPortalAnswers(patientId);
    if (overlay) setHeld({ id: patientId, answers: { ...initial, ...overlay } });
  }, [patientId, live, initial]);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!complete) return;
        if (live && onLiveSubmit) {
          setBusy(true);
          void onLiveSubmit(answers)
            .then(() => setSaved(true))
            .finally(() => setBusy(false));
          return;
        }
        writePortalAnswers(patientId, answers);
        setSaved(true);
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-ink">How far will you travel?</legend>
        <div className="grid grid-cols-2 gap-2">
          {TRAVEL.map((minutes) => (
            <Choice
              key={minutes}
              name="travel"
              checked={answers.maxTravelMinutes === minutes}
              onSelect={() => setAnswers({ ...answers, maxTravelMinutes: minutes })}
            >
              {minutes} minutes
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-ink">How many extra visits a month?</legend>
        <div className="grid grid-cols-3 gap-2">
          {VISITS.map((n) => (
            <Choice
              key={n}
              name="visits"
              checked={answers.maxExtraVisitsPerMonth === n}
              onSelect={() => setAnswers({ ...answers, maxExtraVisitsPerMonth: n })}
            >
              {n}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-ink">
          Would you accept a placebo arm?
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <Choice
            name="placebo"
            checked={answers.acceptsPlacebo === true}
            onSelect={() => setAnswers({ ...answers, acceptsPlacebo: true })}
          >
            Yes
          </Choice>
          <Choice
            name="placebo"
            checked={answers.acceptsPlacebo === false}
            onSelect={() => setAnswers({ ...answers, acceptsPlacebo: false })}
          >
            No
          </Choice>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-ink">Who can drive you?</legend>
        <div className="grid gap-2">
          {DRIVERS.map((d) => (
            <Choice
              key={d.id}
              name="driver"
              checked={answers.driver === d.id}
              onSelect={() => setAnswers({ ...answers, driver: d.id })}
            >
              {d.label}
            </Choice>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={!complete || busy}
        className="w-full rounded-md bg-ink px-4 py-2.5 text-[13px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save answers"}
      </button>
      {saved && !live && (
        <p className="text-[13px] text-ink-2" role="status">
          Saved on this device. Your doctor sees them on their panel. This page did not contact
          anyone.
        </p>
      )}
    </form>
  );
}
