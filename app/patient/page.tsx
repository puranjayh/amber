import { redirect } from "next/navigation";
import { isDemo, one } from "@/components/console/params";

export default async function PatientRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const patient = one(sp.patient);
  const qs = new URLSearchParams();
  if (isDemo(sp)) qs.set("demo", "1");
  if (patient) qs.set("patient", patient);
  redirect(qs.size ? `/hcp?${qs}` : "/hcp");
}
