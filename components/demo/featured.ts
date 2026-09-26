/** Keep the worklist short on /demo and never drop the hero pair. */
export function featuredWorklist<T extends { patientId: string }>(
  rows: T[],
  heroId: string,
  limit = 6,
): T[] {
  if (rows.length <= limit) return rows;
  const top = rows.slice(0, limit);
  if (top.some((r) => r.patientId === heroId)) return top;
  const hero = rows.find((r) => r.patientId === heroId);
  return hero ? [...top.slice(0, limit - 1), hero] : top;
}
