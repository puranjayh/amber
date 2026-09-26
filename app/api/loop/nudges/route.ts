import { getDemoWorklist } from "@/app/_data/source";
import { createNudges, setBatchStatus, setNudgeStatus } from "@/app/_data/loop";
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
  return Response.json(state);
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: unknown; batchId?: unknown; status?: unknown };
  const status = NudgeStatus.safeParse(body.status);
  if (!status.success) {
    return Response.json({ error: "status required" }, { status: 400 });
  }
  if (typeof body.batchId === "string") {
    return Response.json(await setBatchStatus(getDemoWorklist(), body.batchId, status.data));
  }
  if (typeof body.id !== "string") {
    return Response.json({ error: "id or batchId required" }, { status: 400 });
  }
  return Response.json(await setNudgeStatus(getDemoWorklist(), body.id, status.data));
}
