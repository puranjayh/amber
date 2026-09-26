import { getDemoWorklist } from "@/app/_data/source";
import { readLoop } from "@/app/_data/loop";
import { forAudience, parseAudience } from "@/components/loop/registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const state = await readLoop(getDemoWorklist());
  return Response.json(forAudience(state, parseAudience(new URL(request.url).searchParams.get("audience"))));
}
