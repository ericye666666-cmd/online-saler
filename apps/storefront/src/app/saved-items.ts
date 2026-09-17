/**
 * Saved items, kept in this browser.
 *
 * Every piece is one of one, so a shopper who taps the heart and comes back
 * later has no other way to find that exact item again. Component state alone
 * lost the list on every reload, so the codes live in localStorage and the
 * `saved-items-changed` event keeps open tabs and the header in step — the same
 * shape the cart already uses.
 */

const STORAGE_KEY = "directLoop.savedItems.v1";
const CHANGED_EVENT = "saved-items-changed";

function readRaw(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === "string") : [];
  } catch {
    // Private mode, cleared site data or a corrupt value: start from empty
    // rather than breaking every page that reads the list.
    return [];
  }
}

export function readSavedCodes(): string[] {
  return Array.from(new Set(readRaw()));
}

export function isSaved(code: string): boolean {
  return readSavedCodes().includes(code);
}

export function toggleSaved(code: string): boolean {
  const current = readSavedCodes();
  const next = current.includes(code) ? current.filter((item) => item !== code) : [...current, code];
  writeSavedCodes(next);
  return next.includes(code);
}

export function writeSavedCodes(codes: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set(codes))));
  } catch {
    // Storage can be full or blocked; the in-page state still reflects the tap.
  }
  notifySavedChanged();
}

export function notifySavedChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function subscribeToSaved(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
