/**
 * Paging for the console's long lists (商品管理, 订单中心, 每日打单配送).
 *
 * The API returns one page plus the total; these helpers decide which page
 * buttons to show and keep the page in the address bar (?page=3), so a refresh
 * or a shared link lands on the same page.
 */
export const LIST_PAGE_SIZE = 30;
/** The largest page the API hands out; the CSV export walks the list in pages of this size. */
export const EXPORT_PAGE_SIZE = 200;

export type PagedList<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function emptyPagedList<T>(): PagedList<T> {
  return { items: [], total: 0, page: 1, pageSize: LIST_PAGE_SIZE, pageCount: 1 };
}

/**
 * The page buttons between 上一页 and 下一页: always the first and last page,
 * the current one with a neighbour either side, and a gap marker where pages are
 * skipped. At most seven slots, so the row fits a phone.
 */
export function pageButtons(current: number, pageCount: number): Array<number | "gap"> {
  const last = Math.max(1, Math.floor(pageCount));
  const page = Math.min(Math.max(1, Math.floor(current)), last);
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(page - 1, last - 4));
  const end = Math.min(last - 1, Math.max(page + 1, 5));
  const buttons: Array<number | "gap"> = [1];
  if (start > 2) buttons.push("gap");
  for (let value = start; value <= end; value += 1) buttons.push(value);
  if (end < last - 1) buttons.push("gap");
  buttons.push(last);
  return buttons;
}

/** The page in a query string such as "?page=3&status=all"; anything odd is page 1. */
export function pageFromSearch(search: string): number {
  const value = new URLSearchParams(search).get("page");
  const parsed = value ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * The query string with the page written in, other parameters untouched. Page 1
 * is the default and is left out, so a fresh visit keeps a clean address.
 */
export function searchWithPage(search: string, page: number): string {
  const params = new URLSearchParams(search);
  if (page > 1) params.set("page", String(Math.floor(page)));
  else params.delete("page");
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Accepts either a paged reply or a plain array (an API that has not been redeployed yet). */
export function asPagedList<T>(reply: PagedList<T> | T[], pageSize = LIST_PAGE_SIZE): PagedList<T> {
  if (Array.isArray(reply)) {
    return { items: reply, total: reply.length, page: 1, pageSize: Math.max(pageSize, reply.length), pageCount: 1 };
  }
  return reply;
}
