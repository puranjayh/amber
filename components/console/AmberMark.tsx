import Link from "next/link";

/** Orange-to-pink mark plus the Amber wordmark. The file is drawn on black. */
export function AmberMark({ href, large = false }: { href?: string; large?: boolean }) {
  const img = (
    <img src="/amber-logo.png" alt="Amber" className={large ? "amber-mark amber-mark-lg" : "amber-mark"} />
  );
  if (!href) return img;
  return (
    <Link href={href} className="shrink-0">
      {img}
    </Link>
  );
}
