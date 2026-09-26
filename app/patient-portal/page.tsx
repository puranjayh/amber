import { asOf, getHcp } from "@/app/_data/source";
import { MissingData } from "@/components/console/MissingData";
import { one } from "@/components/console/params";
import { PortalChrome } from "@/components/hcp/PortalChrome";
import { PortalForm } from "@/components/hcp/PortalForm";
import { PortalSelect } from "@/components/hcp/PortalSelect";

export default async function PatientPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
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
  const codes = [
    ...patients.filter((p) => /^PT-\d+$/.test(p.patientId)).map((p) => p.patientId),
    ...(patients.some((p) => p.patientId === current.patientId) && !/^PT-\d+$/.test(current.patientId)
      ? [current.patientId]
      : []),
  ];

  return (
    <>
      <PortalChrome asOf={asOf} />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-3 py-4 sm:px-6 sm:py-6">
        <div>
          <h1 className="text-[16px] font-medium text-ink">What only you know</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Your doctor already has the chart. These four answers are not in it. They change how
            trials are ranked for you. They are not medical facts, and saving them does not message
            anyone.
          </p>
        </div>
        <PortalSelect ids={codes} current={current.patientId} />
        <PortalForm key={current.patientId} patientId={current.patientId} initial={current.portal} />
      </main>
    </>
  );
}
