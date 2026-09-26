import { redirect } from "next/navigation";
import clinicJson from "@/app/_data/clinic.json";
import { ClinicDay, type ClinicData } from "@/components/clinic/ClinicDay";
import { isDemo } from "@/components/console/params";

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  if (isDemo(await searchParams)) redirect("/patient?demo=1");
  return <ClinicDay clinic={clinicJson as ClinicData} />;
}
