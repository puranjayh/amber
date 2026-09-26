import { redirect } from "next/navigation";
import { isStaticDemo, one } from "@/components/console/params";
import { trialPatientPath } from "@/components/hcp/access";

export default async function CoordinatorPatientRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const demo = isStaticDemo(sp) ? (one(sp.demo) === "static" ? "static" : "1") : null;
  redirect(trialPatientPath(decodeURIComponent(id), { trialId: one(sp.trial), demo }));
}
