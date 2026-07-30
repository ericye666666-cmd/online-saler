import Link from "next/link";
import { redirect } from "next/navigation";
import { currentCustomerSession, safeReturnTo } from "../../auth/customer-auth";
import { SiteHeader } from "../components/site-header";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  const session = await currentCustomerSession();
  if (session) redirect(returnTo);

  return (
    <main className="productPage">
      <SiteHeader />
      <div className="productPageShell">
        <section className="customerLoginCard">
          <p className="detail-meta">Customer account</p>
          <h1>Continue with Google</h1>
          <p>Use Google to identify your account and return to checkout. No phone number or address is requested during login.</p>
          {query.error ? <p className="customerLoginError">Google login could not be completed. Please try again.</p> : null}
          <a className="googleLoginButton" href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`}>
            <span aria-hidden="true">G</span>
            Continue with Google
          </a>
          <Link className="customerLoginBack" href="/cart">Back to cart</Link>
        </section>
      </div>
    </main>
  );
}
