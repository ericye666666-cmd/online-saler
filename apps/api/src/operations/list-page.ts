/**
 * Server-side paging for the staff console's long lists (商品管理, 订单中心,
 * 每日打单配送).
 *
 * A list is paged only when the screen asks for a page. Screens that do not
 * send `page` keep getting the plain array they always got (the store console,
 * the picking and pack-station screens), so adding paging here cannot change
 * what those screens see.
 */
export const DEFAULT_LIST_PAGE_SIZE = 30;
/** The largest page a screen may ask for; the CSV export walks pages of this size. */
export const MAX_LIST_PAGE_SIZE = 200;

export type ListPageRequest = { page: number; pageSize: number };

export type ListPage<T> = {
  items: T[];
  /** Every row that matches the filters, across all pages. */
  total: number;
  /** The page actually returned: a page past the end comes back as the last page. */
  page: number;
  pageSize: number;
  pageCount: number;
};

function positiveInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : null;
}

/** The page the screen asked for, or null when it did not ask for paging at all. */
export function listPageRequest(page: unknown, pageSize?: unknown): ListPageRequest | null {
  if (page === undefined || page === null || page === "") return null;
  const size = positiveInteger(pageSize) ?? DEFAULT_LIST_PAGE_SIZE;
  return {
    page: positiveInteger(page) ?? 1,
    pageSize: Math.min(size, MAX_LIST_PAGE_SIZE)
  };
}

export function pageCountFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/**
 * Where to read from once the total is known. Asking for page 9 of a list that
 * now has 2 pages (someone took the last items down) returns page 2 rather
 * than an empty screen.
 */
export function listPageWindow(request: ListPageRequest, total: number) {
  const pageCount = pageCountFor(total, request.pageSize);
  const page = Math.min(request.page, pageCount);
  return { page, pageCount, skip: (page - 1) * request.pageSize, take: request.pageSize };
}

export function listPage<T>(items: T[], total: number, request: ListPageRequest): ListPage<T> {
  const window = listPageWindow(request, total);
  return { items, total, page: window.page, pageSize: request.pageSize, pageCount: window.pageCount };
}
