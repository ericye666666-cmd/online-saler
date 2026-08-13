import { cookies } from "next/headers";
import { normalizeStorefrontLocale, STOREFRONT_LOCALE_COOKIE, translate } from "./dictionary";

export async function getStorefrontI18n() {
  const store = await cookies();
  const locale = normalizeStorefrontLocale(store.get(STOREFRONT_LOCALE_COOKIE)?.value);
  return {
    locale,
    t: (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values),
  };
}
