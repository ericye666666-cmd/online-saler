import Link from "next/link";
import { ChevronRight, Heart, MessageCircle, Receipt, TrendingUp } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { AccountSessionRow } from "./account-session-row";
import { supportWhatsAppUrl } from "../../support/whatsapp";
import { getStorefrontI18n } from "../../i18n/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { t } = await getStorefrontI18n();
  const supportHref = supportWhatsAppUrl("Hello Direct Loop, I need help with my order.");

  return (
    <main className="accountPage">
      <SiteHeader />

      <div className="accountShell">
        <h1>{t("account.title")}</h1>

        <AccountSessionRow />

        <ul className="accountList">
          {/* First row on the page. A deposit hold has a deadline attached to
              it, so getting back to an order cannot depend on still having the
              payment confirmation screen open. */}
          <li>
            <Link href="/orders">
              <Receipt size={19} aria-hidden="true" />
              <span className="accountRowText">
                <strong>{t("account.orders")}</strong>
                <span>{t("account.ordersHint")}</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link href="/saved">
              <Heart size={19} aria-hidden="true" />
              <span className="accountRowText"><strong>{t("account.saved")}</strong></span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
          <li>
            <a href={supportHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={19} aria-hidden="true" />
              <span className="accountRowText"><strong>{t("account.support")}</strong></span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
          </li>
        </ul>

        {/* Affiliates reach their links and commission here rather than from a
            bottom tab, which would mean nothing to an ordinary shopper. */}
        <ul className="accountList accountAffiliate">
          <li>
            <Link href="/seller">
              <TrendingUp size={19} aria-hidden="true" />
              <span className="accountRowText">
                <strong>{t("account.affiliate")}</strong>
                <span>{t("account.affiliateHint")}</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link href="/become-affiliate">
              <span className="accountRowText"><strong>{t("account.becomeAffiliate")}</strong></span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
