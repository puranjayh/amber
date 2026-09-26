import Link from "next/link";

/** Orange-to-pink mark plus the Amber wordmark. The file is drawn on black. */
export function AmberMark({ href }: { href?: string }) {
  const img = <img src="/amber-logo.png" alt="Amber" className="amber-mark" />;
  if (!href) return img;
  return (
    <Link href={href} className="shrink-0">
      {img}
    </Link>
  );
}
