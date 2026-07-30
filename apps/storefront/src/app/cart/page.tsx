import { CartPageClient } from "./cart-page-client";
import { StorefrontHeader } from "../storefront-header";

export const dynamic = "force-dynamic";

export default function CartPage() {
  return (
    <main className="catalog-page">
      <StorefrontHeader />
      <div className="detail-shell">
        <CartPageClient />
      </div>
    </main>
  );
}
