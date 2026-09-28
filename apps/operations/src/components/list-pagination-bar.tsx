"use client";

import { useCallback, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pageButtons, pageFromSearch, searchWithPage } from "@/lib/list-pagination";
import { t } from "@/i18n/runtime";

/**
 * 共 N 件 · 第 X / Y 页, then 上一页 · 1 … 4 5 6 … 12 · 下一页.
 *
 * Wraps onto two lines on a phone: the count on top, the buttons below. The
 * page numbers are hidden below the small breakpoint when there are many of
 * them, leaving 上一页 / 下一页 and the "X / Y" text to steer by.
 */
export function ListPaginationBar(props: {
  total: number;
  page: number;
  pageCount: number;
  unit: "件" | "单";
  busy?: boolean;
  onPage: (page: number) => void;
}) {
  const { total, page, pageCount, unit, busy, onPage } = props;
  const summary = unit === "件"
    ? t("共 {total} 件 · 第 {page} / {pages} 页", { total, page, pages: pageCount })
    : t("共 {total} 单 · 第 {page} / {pages} 页", { total, page, pages: pageCount });
  const buttons = pageButtons(page, pageCount);
  return (
    <nav aria-label={t("分页")} className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-muted-foreground text-sm">{summary}</span>
      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" size="sm" variant="outline" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeftIcon data-icon="inline-start" />{t("上一页")}
          </Button>
          <div className={buttons.length > 5 ? "hidden items-center gap-1 sm:flex" : "flex items-center gap-1"}>
            {buttons.map((value, index) => value === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-muted-foreground text-sm">…</span>
            ) : (
              <Button
                key={value}
                type="button"
                size="sm"
                className="min-w-8 px-2"
                variant={value === page ? "default" : "ghost"}
                aria-current={value === page ? "page" : undefined}
                disabled={busy && value !== page}
                onClick={() => { if (value !== page) onPage(value); }}
              >
                {value}
              </Button>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" disabled={busy || page >= pageCount} onClick={() => onPage(page + 1)}>
            {t("下一页")}<ChevronRightIcon data-icon="inline-end" />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}

/**
 * The list's page, kept in the address bar as ?page=N so a refresh stays on it.
 * The page is only ever shown after the list has loaded, so reading the address
 * bar in the first render cannot make the server and browser markup disagree.
 */
export function useUrlPage(): [number, (page: number) => void] {
  const [page, setPage] = useState(() => (typeof window === "undefined" ? 1 : pageFromSearch(window.location.search)));
  const update = useCallback((next: number) => {
    const value = Math.max(1, Math.floor(next));
    setPage(value);
    const search = searchWithPage(window.location.search, value);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, []);
  return [page, update];
}
