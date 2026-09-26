import { LoopState, type LoopState as LoopStateT } from "@/app/_data/schema";

export function parseLoopState(json: unknown): LoopStateT {
  const parsed = LoopState.safeParse(json);
  return parsed.success ? parsed.data : { backend: "file", preferences: [], nudges: [], notes: [] };
}
