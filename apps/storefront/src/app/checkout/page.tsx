import Link from "next/link";
import { CheckoutPageClient } from "./checkout-page-client";

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">Online Saler</Link>
        <nav className="nav" aria-label="Storefront navigation">
          <Link href="/">New arrivals</Link>
          <Link href="/cart">Cart</Link>
        </nav>
      </header>

      <CheckoutPageClient />
    </main>
  );
}
