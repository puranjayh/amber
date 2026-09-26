import Link from "next/link";

/** Transparent orange-to-pink mark plus the Amber wordmark. */
export function AmberMark({ href, side = false }: { href?: string; side?: boolean }) {
  const img = (
    <img src="/amber-logo.png" alt="Amber" className={side ? "amber-mark amber-mark-side" : "amber-mark"} />
  );
  if (!href) return img;
  return (
    <Link href={href} className="shrink-0">
      {img}
    </Link>
  );
}
