import { CartPageClient } from "./cart-page-client";
import { SiteHeader } from "../components/site-header";

export const dynamic = "force-dynamic";

export default function CartPage() {
  return (
    <main className="productPage">
      <SiteHeader />
      <div className="productPageShell">
        <CartPageClient />
      </div>
    </main>
  );
}
