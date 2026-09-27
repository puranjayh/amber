"use client";

import { useRouter } from "next/navigation";
import { ANCHORS } from "./anchors";

export type SignedIn = "coordinator" | "physician" | "patient";

const OPTIONS: { id: SignedIn; label: string }[] = [
  { id: "coordinator", label: "Trial coordinator" },
  { id: "physician", label: "Dr Sanjay Gupta" },
  { id: "patient", label: "A patient" },
];

function hrefFor(id: SignedIn, trial: string, demo: string): string {
  const q = new URLSearchParams();
  if (demo) q.set("demo", demo);
  if (id === "coordinator") {
    q.set("trial", trial);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  }
  if (id === "physician") {
    q.set("physician", "hcp-rahman");
    q.set("trial", trial);
    return `/doctor?${q.toString()}`;
  }
  q.set("patient", "PT-4413");
  return `/patient-portal?${q.toString()}`;
}

/** Top-right identity. Changing it opens the other app, not a filtered list. */
export function IdentitySwitcher({
  current,
  trial = ANCHORS[0].nctId,
  demo = "",
}: {
  current: SignedIn;
  trial?: string;
  demo?: string;
}) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
      <span className="sr-only">Signed in as</span>
      <span aria-hidden>Signed in as</span>
      <select
        aria-label="Signed in as"
        value={current}
        onChange={(e) => router.push(hrefFor(e.target.value as SignedIn, trial, demo))}
        className="max-w-[11rem] rounded-md border border-line bg-surface px-1.5 py-1 text-[13px] text-ink"
      >
        {OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
