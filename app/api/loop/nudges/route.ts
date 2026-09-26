import { getDemoWorklist } from "@/app/_data/source";
import { createNudges, releaseUpdate, setBatchStatus, setNudgeStatus } from "@/app/_data/loop";
import { forAudience, parseAudience } from "@/components/loop/registry";
import { LoopRole, NudgeKind, NudgeStatus } from "@/app/_data/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    kind?: unknown;
    fromRole?: unknown;
    toRole?: unknown;
    patientId?: unknown;
    nctId?: unknown;
    patients?: unknown;
  };
  const kind = NudgeKind.safeParse(body.kind);
  const fromRole = LoopRole.safeParse(body.fromRole);
  const toRole = LoopRole.safeParse(body.toRole);
  const many = Array.isArray(body.patients)
    ? body.patients.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const rec = row as { patientId?: unknown; nctId?: unknown };
        return typeof rec.patientId === "string" ? [{ patientId: rec.patientId, nctId: rec.nctId }] : [];
      })
    : typeof body.patientId === "string"
      ? [{ patientId: body.patientId, nctId: body.nctId }]
      : [];
  if (!kind.success || !fromRole.success || !toRole.success || many.length === 0) {
    return Response.json({ error: "kind, fromRole, toRole, and patientId(s) required" }, { status: 400 });
  }
  if (kind.data === "trial_update") {
    return Response.json({ error: "trial updates come from the registry" }, { status: 400 });
  }
  const state = await createNudges(
    getDemoWorklist(),
    many.map((row) => ({
      kind: kind.data,
      fromRole: fromRole.data,
      toRole: toRole.data,
      patientId: row.patientId,
      nctId: typeof row.nctId === "string" ? row.nctId : null,
    })),
  );
  return Response.json(forAudience(state, parseAudience(new URL(request.url).searchParams.get("audience"))));
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: unknown; batchId?: unknown; status?: unknown; release?: unknown };
  const audience = parseAudience(new URL(request.url).searchParams.get("audience"));
  if (body.release === true && typeof body.id === "string") {
    return Response.json(forAudience(await releaseUpdate(body.id), audience));
  }
  const status = NudgeStatus.safeParse(body.status);
  if (!status.success) {
    return Response.json({ error: "status required" }, { status: 400 });
  }
  if (typeof body.batchId === "string") {
    return Response.json(forAudience(await setBatchStatus(getDemoWorklist(), body.batchId, status.data), audience));
  }
  if (typeof body.id !== "string") {
    return Response.json({ error: "id or batchId required" }, { status: 400 });
  }
  return Response.json(forAudience(await setNudgeStatus(getDemoWorklist(), body.id, status.data), audience));
}
