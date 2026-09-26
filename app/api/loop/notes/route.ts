import { getDemoWorklist } from "@/app/_data/source";
import { saveNote } from "@/app/_data/loop";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { physicianId?: unknown; text?: unknown };
  if (typeof body.physicianId !== "string" || !body.physicianId || typeof body.text !== "string") {
    return Response.json({ error: "physicianId and text required" }, { status: 400 });
  }
  const state = await saveNote(getDemoWorklist(), body.physicianId, body.text);
  return Response.json(state);
}
