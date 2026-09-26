import { getWorklist } from "@/app/_data/source";
import { resetLoop } from "@/app/_data/loop";

export const dynamic = "force-dynamic";

export async function POST() {
  const state = await resetLoop(getWorklist());
  return Response.json(state);
}
