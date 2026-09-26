import { readLoop } from "@/app/_data/loop";
import { asOf, getDemoWorklist, getHcp, getPair, getTrial } from "@/app/_data/source";
import { blockingUnknown } from "@/components/alert/alert";
import { MissingData } from "@/components/console/MissingData";
import { isStaticDemo, one } from "@/components/console/params";
import { PortalChrome } from "@/components/hcp/PortalChrome";
import { PortalForm } from "@/components/hcp/PortalForm";
import { PortalLive } from "@/components/hcp/PortalLive";
import { PortalSelect } from "@/components/hcp/PortalSelect";
import { catalogFor, trialPhaseLabel } from "@/components/hcp/portal-copy";
import { prefsByPatient } from "@/components/loop/rank";

export const metadata = { title: "AMBER — Your preferences" };

export default async function PatientPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staticDemo = isStaticDemo(sp);
  const panel = getHcp();
  const patients = panel.physicians.flatMap((p) => p.patients);
  if (patients.length === 0) {
    return (
      <>
        <PortalChrome asOf={asOf} />
        <main className="mx-auto w-full max-w-xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/hcp.json" />
        </main>
      </>
    );
  }

  const requested = one(sp.patient);
  const current =
    patients.find((p) => p.patientId === requested) ??
    patients.find((p) => p.patientId === "PT-4401") ??
    patients[0];
  const loop = staticDemo ? null : await readLoop(getDemoWorklist());
  const nudged = loop?.nudges.filter((n) => n.toRole === "patient" && n.status !== "done").map((n) => n.patientId) ?? [];
  const codes = [...new Set([
    ...patients.filter((p) => /^PT-\d+$/.test(p.patientId)).map((p) => p.patientId),
    ...nudged,
    current.patientId,
  ])];
  const liveAnswers = loop ? (prefsByPatient(loop.preferences)[current.patientId] ?? {}) : current.portal;
  const catalog = catalogFor(
    current.patientId,
    current.trials.map((trial) => {
      const pair = getPair(current.patientId, trial.nctId);
      const full = getTrial(trial.nctId);
      const cell = pair && !pair.eliminated ? blockingUnknown(pair) : undefined;
      return {
        nctId: trial.nctId,
        title: trial.title,
        phase: full ? trialPhaseLabel(full) : trial.phase,
        travelMinutes: trial.travelMinutes,
        blocking: cell?.criterionCitation,
      };
    }),
  );

  return (
    <>
      <PortalChrome asOf={asOf} />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-3 py-4 sm:px-6 sm:py-6">
        <div>
          <h1 className="text-[16px] font-medium text-ink">What only you know</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Your doctor already has the chart. These four answers are not in it. They change how
            trials are ranked for you. They are not medical facts
            {loop ? "." : ", and saving them does not message anyone."}
          </p>
        </div>
        <PortalSelect ids={codes} current={current.patientId} />
        {loop ? (
          <PortalLive
            patientId={current.patientId}
            initialAnswers={liveAnswers}
            catalog={catalog}
            initial={loop}
          />
        ) : (
          <PortalForm key={current.patientId} patientId={current.patientId} initial={current.portal} />
        )}
      </main>
    </>
  );
}
