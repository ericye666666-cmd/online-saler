import { SiteHeader } from "../components/site-header";
import { SavedPageClient } from "./saved-page-client";
import { listPublishedProducts } from "../../db/catalog";
import { getStorefrontI18n } from "../../i18n/server";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  // The saved codes live in the browser, so the server sends the catalogue and
  // the client picks the saved ones out of it.
  const [products, { t }] = await Promise.all([
    listPublishedProducts(),
    getStorefrontI18n(),
  ]);

  return (
    <main className="savedPage">
      <SiteHeader />
      <div className="savedShell">
        <h1>{t("saved.title")}</h1>
        <SavedPageClient products={products} />
      </div>
    </main>
  );
}
