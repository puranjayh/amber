import { getWorklist } from "@/app/_data/source";
import { savePreferences } from "@/app/_data/loop";
import { PortalAnswers } from "@/app/_data/schema";
import { prefsStated } from "@/components/loop/rank";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { patientId?: unknown; answers?: unknown };
  if (typeof body.patientId !== "string" || !body.patientId) {
    return Response.json({ error: "patientId required" }, { status: 400 });
  }
  const answers = PortalAnswers.safeParse(body.answers);
  if (!answers.success || !prefsStated(answers.data)) {
    return Response.json({ error: "answers required" }, { status: 400 });
  }
  if (
    answers.data.maxTravelMinutes === undefined ||
    answers.data.maxExtraVisitsPerMonth === undefined ||
    answers.data.acceptsPlacebo === undefined ||
    answers.data.driver === undefined
  ) {
    return Response.json({ error: "all four answers required" }, { status: 400 });
  }
  const state = await savePreferences(getWorklist(), body.patientId, answers.data);
  return Response.json(state);
}
