import { getDemoWorklist } from "@/app/_data/source";
import { resetLoop } from "@/app/_data/loop";

export const dynamic = "force-dynamic";

export async function POST() {
  const state = await resetLoop(getDemoWorklist());
  return Response.json(state);
}
