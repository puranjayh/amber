import { redirect } from "next/navigation";
import { isDemo, one } from "@/components/console/params";
import { trialPatientPath } from "@/components/hcp/access";

export default async function PatientRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const patient = one(sp.patient);
  if (!patient) redirect("/");
  redirect(
    trialPatientPath(patient, {
      trialId: one(sp.trial),
      demo: isDemo(sp) ? (one(sp.demo) === "static" ? "static" : "1") : null,
    }),
  );
}
