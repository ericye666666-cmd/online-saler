import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentCustomerSession, safeReturnTo } from "../../auth/customer-auth";
import { LanguageSwitcher } from "../components/language-switcher";
import { getStorefrontI18n } from "../../i18n/server";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  const { t } = await getStorefrontI18n();
  const session = await currentCustomerSession();
  if (session) redirect(returnTo);

  return (
    <main className="customerAuthPage">
      <header className="customerAuthHeader">
        <Link href="/cart" aria-label={t("common.back")}><ArrowLeft size={28} /></Link>
        <strong>{t("auth.title")}</strong>
        <LanguageSwitcher compact />
      </header>
      <section className="customerAuthBody">
        <div className="customerAuthIntro">
          <p>DIRECT LOOP</p>
          <h1>{t("auth.joinTitle")}</h1>
          <span>{t("auth.joinBody")}</span>
        </div>
        {query.error ? <p className="customerLoginError">{t("auth.error")}</p> : null}
        <a className="googleLoginButton" href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`}>
          {t("auth.google")}
        </a>
        <div className="customerAuthDivider"><span />{t("auth.or")}<span /></div>
        <Link className="customerAuthSecondary" href="/">{t("auth.continueShopping")}</Link>
        <p className="customerAuthFooter">{t("auth.alreadyMember")} <Link href="/cart">{t("auth.backToCart")}</Link></p>
      </section>
    </main>
  );
}
