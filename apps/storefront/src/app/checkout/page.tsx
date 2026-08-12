import Link from "next/link";
import { CheckoutPageClient } from "./checkout-page-client";
import { SiteHeader } from "../components/site-header";
import { currentCustomerSession } from "../../auth/customer-auth";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await currentCustomerSession();

  return (
    <main className="productPage">
      <SiteHeader />
      <div className="productPageShell checkoutPageShell">
        {session ? (
          <>
            <section className="checkoutIdentity" aria-label="Signed-in customer">
              {session.avatarUrl
                ? <img src={session.avatarUrl} alt="" />
                : <span className="checkoutIdentityFallback" aria-hidden="true">{(session.displayName ?? session.email).slice(0, 1).toUpperCase()}</span>}
              <strong>{session.displayName ?? session.email}</strong>
            </section>
            <CheckoutPageClient />
          </>
        ) : (
          <section className="customerLoginCard">
            <p className="detail-meta">Checkout</p>
            <h1>Sign in before checkout</h1>
            <p>Google sign-in connects this purchase to your account. Your M-Pesa phone number is collected only when you start payment.</p>
            <Link className="googleLoginButton" href="/login?returnTo=%2Fcheckout">
              <span aria-hidden="true">G</span>
              Continue with Google
            </Link>
            <Link className="customerLoginBack" href="/cart">Back to cart</Link>
          </section>
        )}
      </div>
    </main>
  );
}
