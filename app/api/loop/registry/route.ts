import { getDemoWorklist } from "@/app/_data/source";
import { readLoop } from "@/app/_data/loop";
import { syncRegistry } from "@/app/_data/registry-sync";
import { forAudience, parseAudience } from "@/components/loop/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await syncRegistry();
  const state = await readLoop(getDemoWorklist());
  return Response.json(forAudience(state, parseAudience(new URL(request.url).searchParams.get("audience"))));
}
