import { CheckoutPageClient } from "./checkout-page-client";
import { StorefrontHeader } from "../storefront-header";

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <main className="catalog-page">
      <StorefrontHeader />
      <div className="detail-shell">
        <CheckoutPageClient />
      </div>
    </main>
  );
}
