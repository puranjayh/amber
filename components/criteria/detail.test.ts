import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { DEMO, getPair, getPatient, getTrial } from "@/app/_data/source";
import { DoctorActions } from "@/components/hcp/DoctorActions";
import { NotYourPatient } from "@/components/hcp/NotYourPatient";
import { PairDetail } from "./PairDetail";
import { UnknownResolutions } from "./UnknownResolutions";
import { CoordinatorActions } from "@/components/worklist/CoordinatorActions";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: unknown }) =>
    createElement("a", { href }, children as never),
}));

const empty = { backend: "file" as const, preferences: [], nudges: [], notes: [] };

test("coordinator and physician wrap the same criteria table with different actions", () => {
  const patient = getPatient(DEMO.patientId);
  const trial = getTrial(DEMO.nctId);
  const pair = getPair(DEMO.patientId, DEMO.nctId);
  expect(patient && trial && pair).toBeTruthy();

  const shared = renderToStaticMarkup(createElement(PairDetail, { patient: patient!, trial: trial!, pair: pair! }));
  expect(shared).toContain("Criteria");
  expect(shared).toContain(DEMO.nctId);

  const unknowns = renderToStaticMarkup(
    createElement(UnknownResolutions, { patient: patient!, trial: trial!, pair: pair! }),
  );
  expect(unknowns).toContain("Unknowns");
  expect(unknowns).toContain("T");

  const coordinator = renderToStaticMarkup(
    createElement(CoordinatorActions, {
      patientId: DEMO.patientId,
      nctId: DEMO.nctId,
      physicianName: "Dr Rahman",
      stated: false,
      initial: empty,
      live: false,
    }),
  );
  expect(coordinator).toContain("Ask patient for preferences");
  expect(coordinator).not.toContain("Suggest this trial");
  expect(coordinator).not.toContain("Nudge Dr Rahman");

  const physician = renderToStaticMarkup(
    createElement(DoctorActions, {
      patientId: DEMO.patientId,
      nctId: DEMO.nctId,
      initial: empty,
      live: false,
    }),
  );
  expect(physician).toContain("Suggest this trial");
  expect(physician).toContain("Order this test");
  expect(physician).toContain("Dismiss");

  const denied = renderToStaticMarkup(createElement(NotYourPatient, { patientId: "PT-9999" }));
  expect(denied).toContain("Not your patient");
  expect(denied).not.toContain("Criteria");
});
