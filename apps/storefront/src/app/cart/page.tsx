import { CartPageClient } from "./cart-page-client";

export const dynamic = "force-dynamic";

/** The bag carries its own top bar (Close / Bag / Edit), as Vestiaire's does, instead of the site header. */
export default function CartPage() {
  return (
    <main className="bagMain">
      <CartPageClient />
    </main>
  );
}
