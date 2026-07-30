import Link from "next/link";
import { CartPageClient } from "./cart-page-client";

export const dynamic = "force-dynamic";

export default function CartPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">Online Saler</Link>
        <nav className="nav" aria-label="Storefront navigation">
          <Link href="/">New arrivals</Link>
          <Link href="/cart">Cart</Link>
        </nav>
      </header>

      <CartPageClient />
    </main>
  );
}
