import { redirect } from "next/navigation";
import { isDemo, one } from "@/components/console/params";

export default async function PatientRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const patient = one(sp.patient);
  if (!patient) redirect("/");
  const qs = new URLSearchParams();
  if (isDemo(sp)) qs.set("demo", one(sp.demo) === "static" ? "static" : "1");
  const trial = one(sp.trial);
  if (trial) qs.set("trial", trial);
  redirect(`/worklist/patient/${encodeURIComponent(patient)}${qs.size ? `?${qs}` : ""}`);
}
