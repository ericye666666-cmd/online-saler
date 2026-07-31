import Link from "next/link";
import { ArrowRight, BadgeCheck, MessageCircle, Share2, ShoppingBag, WalletCards } from "lucide-react";
import { currentCustomerSession } from "../../auth/customer-auth";
import { getActiveSellerForCustomer } from "../../seller/seller-dashboard-service";
import { SiteHeader } from "../components/site-header";
import styles from "./join-seller.module.css";

export const dynamic = "force-dynamic";

export default async function JoinSellerPage() {
  const session = await currentCustomerSession();
  const seller = await getActiveSellerForCustomer(session);
  const whatsappHref = supportWhatsappUrl(session?.email);

  return (
    <main className={styles.page}>
      <SiteHeader />
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.story}>
            <span className={styles.eyebrow}><Share2 size={16} /> Direct Loop sellers</span>
            <h1>Share products and earn from verified sales.</h1>
            <p>Direct Loop keeps stock, checkout, M-Pesa payment and fulfillment on the platform. Sellers promote links and track attributed orders.</p>
            <div className={styles.steps}>
              <div><Share2 size={19} /><span><strong>Share catalog or product links</strong><small>Your Affiliate ID is kept in the link.</small></span></div>
              <div><ShoppingBag size={19} /><span><strong>Customer buys through Direct Loop</strong><small>No private collection of platform order money.</small></span></div>
              <div><WalletCards size={19} /><span><strong>Commission is tracked automatically</strong><small>Paid attributed orders appear in your seller dashboard.</small></span></div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.mark}>DL</div>
            <h2>{seller ? "Seller access is active" : session ? "Apply for seller access" : "Sign in before applying"}</h2>
            <p>
              {seller
                ? "Your Google account already has seller access. Open the dashboard to see your sharing link, visits, attributed orders and commission."
                : session
                  ? "You are signed in. Contact Operations and ask them to open seller access for this Google account."
                  : "Use Google login first so Operations can activate seller access on the correct account."}
            </p>
            <div className={styles.actions}>
              {seller ? (
                <Link className={styles.primary} href="/seller">Open seller dashboard <ArrowRight size={18} /></Link>
              ) : session ? (
                <a className={styles.primary} href={whatsappHref} target="_blank" rel="noreferrer">Contact Operations <MessageCircle size={18} /></a>
              ) : (
                <Link className={styles.primary} href={`/login?returnTo=${encodeURIComponent("/join-seller")}`}>Continue with Google <ArrowRight size={18} /></Link>
              )}
              <a className={styles.whatsapp} href={whatsappHref} target="_blank" rel="noreferrer">WhatsApp support <MessageCircle size={18} /></a>
              <Link className={styles.secondary} href="/">Back to catalog</Link>
            </div>
            <div className={styles.note}>
              <BadgeCheck size={16} /> Operations opens seller access from the Affiliate Commission module by searching your Google account email.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function supportWhatsappUrl(email?: string | null) {
  const message = [
    "Hello Direct Loop, I want to apply for seller access.",
    email ? `Google account: ${email}` : ""
  ].filter(Boolean).join("\n");
  return `https://wa.me/254742001507?text=${encodeURIComponent(message)}`;
}
