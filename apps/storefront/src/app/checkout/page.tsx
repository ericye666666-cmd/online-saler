import Link from "next/link";
import { CheckoutPageClient } from "./checkout-page-client";
import { SiteHeader } from "../components/site-header";
import { currentCustomerSession } from "../../auth/customer-auth";
import { getStorefrontI18n } from "../../i18n/server";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await currentCustomerSession();
  const { t } = await getStorefrontI18n();

  return (
    <main className="productPage">
      <SiteHeader customerIdentity={session ? {
        displayName: session.displayName,
        email: session.email,
        avatarUrl: session.avatarUrl
      } : undefined} />
      <div className="productPageShell checkoutPageShell">
        {session ? (
          <CheckoutPageClient />
        ) : (
          <section className="customerLoginCard">
            <p className="detail-meta">{t("checkout.title")}</p>
            <h1>{t("auth.checkoutTitle")}</h1>
            <p>{t("auth.checkoutBody")}</p>
            <Link className="googleLoginButton" href="/login?returnTo=%2Fcheckout">
              {t("auth.google")}
            </Link>
            <Link className="customerLoginBack" href="/cart">{t("auth.backToCart")}</Link>
          </section>
        )}
      </div>
    </main>
  );
}
