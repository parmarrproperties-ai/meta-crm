/**
 * PostgREST returns at most 1,000 rows per request (the project's max-rows
 * setting) no matter what `.limit()` says, and silently truncates. Every query
 * that can legitimately exceed that must page through `.range()`.
 *
 * Usage:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from("t").select("*").gte("d", x).order("id").range(from, to)
 *   );
 *
 * Always include a deterministic `.order()` (ending in a unique column) in the
 * builder so pages don't overlap or skip rows.
 */

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllRows<T = Record<string, any>>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = 1000, maxRows = 500_000 }: { pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
