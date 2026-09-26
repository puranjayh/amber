export type SearchParams = Record<string, string | string[] | undefined>;

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function isDemo(sp: SearchParams): boolean {
  return one(sp.demo) === "1";
}
