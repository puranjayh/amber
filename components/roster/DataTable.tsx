import Link from "next/link";
import type { ReactNode } from "react";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T, index: number) => ReactNode;
};

/**
 * One table. Columns change per portal. Narrow widths stack each cell under its header
 * so a 400px screen does not scroll sideways.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  href,
  onClick,
  advanceTo,
  selected,
  label,
  template,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  href?: (row: T) => string | undefined;
  onClick?: (row: T) => void;
  advanceTo?: number;
  selected?: (row: T) => boolean;
  label: string;
  /** Tailwind grid columns, including the `md:grid-cols-[...]` list. */
  template: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface" aria-label={label}>
      <div
        className={`hidden border-b border-line bg-canvas px-4 py-2.5 text-[11px] text-ink-3 md:grid md:items-center md:gap-4 ${template}`}
      >
        {columns.map((column) => (
          <span key={column.id}>{column.header}</span>
        ))}
      </div>
      <ol>
        {rows.map((row, index) => {
          const key = rowKey(row);
          const current = selected?.(row) ?? false;
          const className = `block min-h-11 w-full px-4 py-3 text-left text-[15px] leading-[1.55] hover:bg-canvas md:grid md:items-center md:gap-4 md:px-4 ${template} ${
            current ? "bg-canvas" : ""
          }`;
          const body = columns.map((column) => (
            <span key={column.id} className="mt-1.5 block min-w-0 first:mt-0 md:mt-0">
              <span className="mr-2 text-[11px] text-ink-3 md:hidden">{column.header}</span>
              {column.cell(row, index)}
            </span>
          ));
          const to = href?.(row);
          return (
            <li key={key} className="border-b border-line-2 last:border-b-0">
              {to ? (
                <Link href={to} className={className} aria-current={current ? "page" : undefined}>
                  {body}
                </Link>
              ) : onClick || advanceTo !== undefined ? (
                <button
                  type="button"
                  data-advance={advanceTo}
                  onClick={onClick ? () => onClick(row) : undefined}
                  className={className}
                  aria-current={current ? "true" : undefined}
                >
                  {body}
                </button>
              ) : (
                <div className={className}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
