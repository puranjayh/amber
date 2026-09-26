import { getWorklist } from "@/app/_data/source";
import { readLoop } from "@/app/_data/loop";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readLoop(getWorklist());
  return Response.json(state);
}
