export type SearchParams = Record<string, string | string[] | undefined>;

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function isDemo(sp: SearchParams): boolean {
  const v = one(sp.demo);
  return v === "1" || v === "static";
}

/** Current four-screen path. Live loop is the default; this freezes fixtures. */
export function isStaticDemo(sp: SearchParams): boolean {
  const v = one(sp.demo);
  return v === "1" || v === "static";
}

export function demoQuery(sp: SearchParams): string {
  const v = one(sp.demo);
  if (v === "static") return "demo=static";
  if (v === "1") return "demo=1";
  return "";
}
