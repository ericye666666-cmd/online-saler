import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../components/site-header";
import { currentCustomerSession } from "../../../auth/customer-auth";
import { getCustomerOrderByNumber, orderStatusLabel, paymentStatusLabel } from "../../../orders/order-service";
import { moneyKsh } from "../../storefront-products";

type OrderPageProps = {
  params: Promise<{ orderNumber: string }>;
};

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: OrderPageProps) {
  const [{ orderNumber }, session] = await Promise.all([params, currentCustomerSession()]);
  const returnTo = `/orders/${encodeURIComponent(orderNumber)}`;

  if (!session) {
    return (
      <main className="productPage">
        <SiteHeader />
        <div className="productPageShell">
          <section className="customerLoginCard">
            <p className="detail-meta">Order status</p>
            <h1>Sign in to view this order</h1>
            <p>Use the same Google account you used at checkout.</p>
            <Link className="googleLoginButton" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
              <span aria-hidden="true">G</span>
              Continue with Google
            </Link>
            <Link className="customerLoginBack" href="/">Back to catalog</Link>
          </section>
        </div>
      </main>
    );
  }

  const order = await getCustomerOrderByNumber(orderNumber, session.customerId);
  if (!order) notFound();

  const latestPayment = order.payments[0] ?? null;
  const item = order.items[0] ?? null;
  const snapshot = item?.snapshot ?? null;

  return (
    <main className="productPage">
      <SiteHeader />
      <div className="productPageShell">
        <section className="orderStatusCard">
          <p className="detail-meta">Order {order.orderNumber}</p>
          <div className="orderStatusHeading">
            <div>
              <h1>{orderStatusLabel(order.status)}</h1>
              <p>
                {order.status === "PAID"
                  ? "Payment is confirmed. The warehouse team can prepare this item next."
                  : "Keep this page open while payment is being confirmed."}
              </p>
            </div>
            <span className={`orderBadge ${order.status.toLowerCase()}`}>{orderStatusLabel(order.status)}</span>
          </div>

          <div className="orderStatusGrid">
            <article>
              <h2>Payment</h2>
              <dl>
                <div><dt>Status</dt><dd>{paymentStatusLabel(latestPayment?.status)}</dd></div>
                <div><dt>Amount</dt><dd>{moneyKsh(order.totalKsh)}</dd></div>
                <div><dt>Phone</dt><dd>{latestPayment?.phone ? `+${latestPayment.phone}` : "Not started"}</dd></div>
                <div><dt>Receipt</dt><dd>{latestPayment?.providerReceiptNumber ?? "Pending"}</dd></div>
              </dl>
            </article>

            <article>
              <h2>Fulfillment</h2>
              <dl>
                <div><dt>Method</dt><dd>{order.fulfillmentMethod === "PICKUP" ? "Kikuyu pickup" : "Kikuyu local delivery"}</dd></div>
                <div><dt>Delivery fee</dt><dd>{moneyKsh(order.deliveryFeeKsh)}</dd></div>
                <div><dt>Address</dt><dd>{order.deliveryAddress ?? "Kikuyu pickup"}</dd></div>
                <div><dt>Note</dt><dd>{order.deliveryNote ?? "None"}</dd></div>
              </dl>
            </article>
          </div>

          {snapshot ? (
            <article className="orderItemCard">
              {snapshot.imageUrl ? <img src={snapshot.imageUrl} alt={snapshot.title} /> : null}
              <div>
                <h2>{snapshot.title}</h2>
                <p>{[snapshot.brand, snapshot.category, snapshot.sizeLabel].filter(Boolean).join(" / ")}</p>
                <strong>{moneyKsh(snapshot.unitPriceKsh)}</strong>
              </div>
            </article>
          ) : null}

          <div className="orderStatusActions">
            <Link className="reserve-link" href="/">Continue shopping</Link>
            {order.status !== "PAID" ? <Link className="reserve-button secondary" href="/checkout">Back to checkout</Link> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
