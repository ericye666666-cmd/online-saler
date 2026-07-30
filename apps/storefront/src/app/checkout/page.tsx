import { CheckoutPageClient } from "./checkout-page-client";
import { SiteHeader } from "../components/site-header";

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <main className="productPage">
      <SiteHeader />
      <div className="productPageShell">
        <CheckoutPageClient />
      </div>
    </main>
  );
}
