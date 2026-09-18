import { cookies } from "next/headers";

import { OPERATIONS_LOCALE_COOKIE, normalizeOperationsLocale, type OperationsLocale } from "./locale";

export async function operationsLocaleFromCookies(): Promise<OperationsLocale> {
  const store = await cookies();
  return normalizeOperationsLocale(store.get(OPERATIONS_LOCALE_COOKIE)?.value);
}
