import Link from "next/link";
import type { PairResult } from "@/src/contracts";

function pairTone(pair: PairResult | undefined) {
  if (!pair) return "border-dashed border-ink-3 text-ink-3";
  if (pair.eliminated) return "border-fail-line bg-fail-bg text-fail";
  if (pair.unknownCount > 0) return "border-unknown-line bg-unknown-bg text-unknown";
  return "border-pass-line bg-pass-bg text-pass";
}

function pairLabel(pair: PairResult | undefined) {
  if (!pair) return "no result";
  if (pair.eliminated) return "eliminated";
  if (pair.unknownCount > 0) return `${pair.unknownCount} unknown`;
  return "eligible";
}

export function PairPicker({
  patientIds,
  nctIds,
  cube,
  current,
}: {
  patientIds: string[];
  nctIds: string[];
  cube: PairResult[];
  current: { patientId: string; nctId: string };
}) {
  const find = (patientId: string, nctId: string) =>
    cube.find((p) => p.patientId === patientId && p.nctId === nctId);

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left font-mono font-medium text-ink-3" scope="col">
              <span className="sr-only">Patient</span>
            </th>
            {nctIds.map((id) => (
              <th key={id} scope="col" className="px-1 py-1.5 text-center font-mono font-medium text-ink-3">
                {id.slice(-4)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {patientIds.map((pid) => (
            <tr key={pid} className="border-t border-line-2">
              <th scope="row" className="px-2 py-1 text-left font-mono font-medium text-ink-2">
                {pid}
              </th>
              {nctIds.map((nct) => {
                const pair = find(pid, nct);
                const active = pid === current.patientId && nct === current.nctId;
                return (
                  <td key={nct} className="px-1 py-1 text-center">
                    <Link
                      href={`/patient?patient=${pid}&trial=${nct}`}
                      aria-current={active ? "page" : undefined}
                      aria-label={`${pid} × ${nct}: ${pairLabel(pair)}`}
                      className={`inline-block w-full min-w-[4.5rem] rounded border px-1.5 py-1 font-mono ${pairTone(pair)} ${
                        active ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : ""
                      }`}
                    >
                      {pairLabel(pair)}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
