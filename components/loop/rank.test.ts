import { expect, test } from "vitest";
import { getPatient, getTrial, getWorklist } from "@/app/_data/source";
import {
  LOOP_FOCUS,
  SEED_COUNT,
  SEED_PREFS,
  pairTravel,
  prefsByPatient,
  preferenceUnknown,
  rank,
  rankIndex,
  rankReason,
  seedPatientIds,
  seedPreferenceRows,
} from "./rank";

test("missing preferences is an explicit unknown — the same penalty as a missing lab", () => {
  expect(preferenceUnknown(undefined)).toBe(1);
  expect(preferenceUnknown({})).toBe(1);
  expect(preferenceUnknown(SEED_PREFS)).toBe(0);
});

test("seed holds 46 other 2-unknown patients so the focus patient sits at #47", () => {
  const worklist = getWorklist();
  const ids = seedPatientIds(worklist);
  expect(ids).toHaveLength(SEED_COUNT);
  expect(ids).not.toContain(LOOP_FOCUS);
  const prefs = prefsByPatient(seedPreferenceRows(worklist, "2026-09-25T00:00:00.000Z"));
  const travel = (row: (typeof worklist)[number]) =>
    pairTravel(getPatient(row.patientId), getTrial(row.nctId));
  const before = rank(worklist, prefs, travel);
  expect(rankIndex(before, LOOP_FOCUS)).toBe(46);
  expect(
    rankReason({
      place: 46,
      travelMinutes: pairTravel(getPatient(LOOP_FOCUS), getTrial(before[46].nctId)),
    }),
  ).toBe("ranked #47: clinically strong, preferences unknown.");
});

test("when preferences arrive the focus patient rises because reachability is known", () => {
  const worklist = getWorklist();
  const prefs = prefsByPatient(seedPreferenceRows(worklist, "2026-09-25T00:00:00.000Z"));
  prefs[LOOP_FOCUS] = { ...SEED_PREFS, maxTravelMinutes: 90 };
  const travel = (row: (typeof worklist)[number]) =>
    pairTravel(getPatient(row.patientId), getTrial(row.nctId));
  const after = rank(worklist, prefs, travel);
  const place = rankIndex(after, LOOP_FOCUS);
  expect(place).toBeGreaterThanOrEqual(0);
  expect(place).toBeLessThan(10);
  const minutes = pairTravel(getPatient(LOOP_FOCUS), getTrial(after[place].nctId));
  expect(minutes).toBe(25);
  expect(
    rankReason({
      place,
      prefs: prefs[LOOP_FOCUS],
      travelMinutes: minutes,
    }),
  ).toBe(`ranked #${place + 1}: preferences received, trial is 25 min away, within their limit.`);
});
