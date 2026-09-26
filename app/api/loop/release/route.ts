import { setReleaseMode } from "@/app/_data/loop";
import { forAudience, parseAudience } from "@/components/loop/registry";
import { ReleaseMode } from "@/app/_data/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { physicianId?: unknown; mode?: unknown };
  const mode = ReleaseMode.safeParse(body.mode);
  if (typeof body.physicianId !== "string" || !mode.success) {
    return Response.json({ error: "physicianId and mode required" }, { status: 400 });
  }
  const state = await setReleaseMode(body.physicianId, mode.data);
  const audience = parseAudience(new URL(request.url).searchParams.get("audience"));
  return Response.json(forAudience(state, audience));
}
