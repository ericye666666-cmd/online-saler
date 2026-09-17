/**
 * The shopper's own size, kept in this browser.
 *
 * Stock is one item per size, so most of what someone scrolls past is unwearable
 * for them. Asking once and remembering the answer turns the storefront from
 * "100 items, 8 of them your size" into a shelf that already fits.
 *
 * It is a browsing convenience, not an account setting: no sign-in, nothing sent
 * to the server, and clearing it is one tap.
 */

const STORAGE_KEY = "directLoop.sizePreference.v1";
const CHANGED_EVENT = "size-preference-changed";

export function readSizePreference(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function writeSizePreference(size: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (size) window.localStorage.setItem(STORAGE_KEY, size);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage only costs the shortcut, never the page.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function subscribeToSizePreference(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
