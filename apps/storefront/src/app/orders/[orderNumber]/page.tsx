import Link from "next/link";
import { parseDeliveryAddress, deliveryMapUrl } from "@online-saler/business-rules";
import { Clock3, MessageCircle } from "lucide-react";
import { SiteHeader } from "../../components/site-header";
import { checkoutViewers } from "../../../auth/checkout-identity";
import {
  customerFulfillmentProgress,
  customerOrderStatusLabel,
  customerOrderStatusMessage,
  getCustomerOrderByNumber,
  paymentStatusLabel
} from "../../../orders/order-service";
import { moneyKsh } from "../../storefront-products";
import { getStorefrontI18n } from "../../../i18n/server";
import { supportWhatsAppUrl } from "../../../support/whatsapp";
import { OrderLookupForm } from "../order-lookup-form";
import { BalancePaymentPanel } from "./balance-payment-panel";
import { depositHoldDaysLeft, lapsedDepositRefundKsh } from "@online-saler/business-rules";

type OrderPageProps = {
  params: Promise<{ orderNumber: string }>;
};

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: OrderPageProps) {
  const [{ orderNumber }, viewers, i18n] = await Promise.all([params, checkoutViewers(), getStorefrontI18n()]);
  const { t } = i18n;
  const returnTo = `/orders/${encodeURIComponent(orderNumber)}`;

  // A guest reaches the orders their own device placed. Anything else — another
  // handset, cleared cookies, an older order — goes through customer service,
  // who can look it up and offer to set the shopper up with an account.
  const order = await getCustomerOrderByNumber(orderNumber, viewers.map((viewer) => viewer.customerId));
  const viewer = order ? viewers.find((candidate) => candidate.customerId === order.customerId) : null;
  if (!order || !viewer?.ownsOrder(order.id)) {
    return (
      <main className="productPage">
        <SiteHeader />
        <div className="productPageShell">
          <section className="customerLoginCard">
            <p className="detail-meta">{t("order.progress")}</p>
            <h1>{t("order.lookupTitle")}</h1>
            <p>{t("order.lookupBody")}</p>
            {/* The form comes before customer service on purpose. A shopper who
                opened the store's WhatsApp link on a second handset can get
                back into their own order — and to their delivery code — in one
                step, without waiting for an agent. */}
            <OrderLookupForm defaultOrderNumber={orderNumber} />
            <a className="customerServiceButton" href={supportWhatsAppUrl(`Hello Direct Loop, I would like an update on order ${orderNumber}.`)} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={18} aria-hidden="true" /> <span>{t("support.chat")}</span>
            </a>
            <p className="customerLoginHint">{t("order.lookupRegister")}</p>
            <Link className="googleLoginButton" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
              {t("auth.google")}
            </Link>
            <Link className="customerLoginBack" href="/">{t("order.backCatalog")}</Link>
          </section>
        </div>
      </main>
    );
  }

  const delivery = parseDeliveryAddress(order.deliveryAddress ?? "");
  const latestPayment = order.payments[0] ?? null;
  const statusInput = {
    orderStatus: order.status,
    fulfillmentMethod: order.fulfillmentMethod,
    fulfillmentStatus: order.fulfillment?.status
  };
  const statusLabel = customerOrderStatusLabel(statusInput);
  const progress = customerFulfillmentProgress(statusInput);
  const translatedStatus = statusLabel === "Paid" ? t("order.paid")
    : statusLabel === "Preparing" ? t("order.preparing")
      : statusLabel === "Ready for pickup" ? t("order.ready")
        : statusLabel === "Out for delivery" ? t("order.outForDelivery")
          : statusLabel === "Completed" ? t("order.completed")
            : statusLabel;
  const translatedMessage = statusLabel === "Paid" ? t("order.paidMessage")
    : statusLabel === "Preparing" ? t("order.preparingMessage")
      : statusLabel === "Ready for pickup" ? t("order.readyMessage")
        : statusLabel === "Out for delivery" ? t("order.deliveryMessage")
          : statusLabel === "Completed" ? t("order.completedMessage")
            : customerOrderStatusMessage(statusLabel);

  return (
    <main className="productPage">
      <SiteHeader />
      <div className="productPageShell">
        <section className="orderStatusCard">
          <p className="detail-meta">Order {order.orderNumber}</p>
          <div className="orderStatusHeading">
            <div>
              <h1>{translatedStatus}</h1>
              <p>{translatedMessage}</p>
            </div>
            <span className={`orderBadge ${order.status.toLowerCase()}`}>{translatedStatus}</span>
          </div>

          {order.status === "DEPOSIT_PAID" ? (
            <BalancePaymentPanel
              orderId={order.id}
              balanceKsh={order.balanceKsh}
              balanceDueAt={order.balanceDueAt?.toISOString() ?? null}
              balanceDaysLeft={order.balanceDueAt ? depositHoldDaysLeft(order.balanceDueAt) : null}
              phone={latestPayment?.phone ?? null}
            />
          ) : null}

          {order.status === "DEPOSIT_EXPIRED" ? (
            <section className="orderBalancePanel lapsed" role="status">
              <Clock3 size={20} aria-hidden="true" />
              <div>
                <h2>{t("order.depositExpiredTitle")}</h2>
                <p>{t("order.depositExpiredBody", { amount: moneyKsh(lapsedDepositRefundKsh(order.totalKsh)) })}</p>
              </div>
            </section>
          ) : null}

          {order.fulfillment?.deliveryCode ? (
            <section className="orderCodePanel" role="status">
              <div>
                <h2>{t("order.deliveryCodeTitle")}</h2>
                <p className="orderCodeValue">{order.fulfillment.deliveryCode}</p>
                <p>{t("order.deliveryCodeBody")}</p>
                {order.fulfillment.deliveryRiderName ? (
                  <p className="orderCodeRider">
                    {t("order.deliveryCodeRider", { name: order.fulfillment.deliveryRiderName })}
                    {order.fulfillment.deliveryRiderPhone ? <> · <a href={`tel:${order.fulfillment.deliveryRiderPhone}`}>{order.fulfillment.deliveryRiderPhone}</a></> : null}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {progress.length ? (
            <ol className="orderProgress" aria-label="Order fulfillment progress">
              {progress.map((step, index) => (
                <li key={step.key} className={step.state} aria-current={step.state === "current" ? "step" : undefined}>
                  <span aria-hidden="true">{step.state === "complete" ? "✓" : index + 1}</span>
                  <strong>{step.key === "paid" ? t("order.paid") : step.key === "preparing" ? t("order.preparing") : step.key === "completed" ? t("order.completed") : order.fulfillmentMethod === "PICKUP" ? t("order.ready") : t("order.outForDelivery")}</strong>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="orderStatusGrid">
            <article>
              <h2>{t("order.payment")}</h2>
              <dl>
                <div><dt>{t("order.status")}</dt><dd>{paymentStatusLabel(latestPayment?.status)}</dd></div>
                <div><dt>{t("order.amount")}</dt><dd>{moneyKsh(order.totalKsh)}</dd></div>
                {order.paymentPlan === "DEPOSIT_50" ? (
                  <>
                    <div><dt>{t("order.depositLabel")}</dt><dd>{moneyKsh(order.depositKsh)}{order.depositPaidAt ? t("order.paidSuffix") : ""}</dd></div>
                    <div><dt>{t("order.balanceLabel")}</dt><dd>{moneyKsh(order.balanceKsh)}{order.status === "PAID" || order.status === "FULFILLING" || order.status === "COMPLETED" ? t("order.paidSuffix") : ""}</dd></div>
                  </>
                ) : null}
                <div><dt>{t("order.phone")}</dt><dd>{latestPayment?.phone ? `+${latestPayment.phone}` : "Not started"}</dd></div>
                <div><dt>{t("order.receipt")}</dt><dd>{latestPayment?.providerReceiptNumber ?? "Pending"}</dd></div>
              </dl>
            </article>

            <article>
              <h2>{t("order.fulfillment")}</h2>
              <dl>
                <div><dt>{t("order.method")}</dt><dd>{order.fulfillmentMethod === "PICKUP" ? t("checkout.pickup") : t("checkout.delivery")}</dd></div>
                {order.fulfillmentNode ? (
                  <div><dt>{t("order.pickupPoint")}</dt><dd>
                    {order.fulfillmentNode.name}
                    {order.fulfillmentNode.mapsUrl ? <> <a href={order.fulfillmentNode.mapsUrl} target="_blank" rel="noopener noreferrer">Google Maps ↗</a></> : null}
                  </dd></div>
                ) : null}
                {order.pickupCode ? (
                  <div><dt>{t("order.pickupCode")}</dt><dd><strong>{order.pickupCode}</strong></dd></div>
                ) : null}
                <div><dt>{t("order.deliveryFee")}</dt><dd>{order.deliveryFeeKsh === 0 ? t("order.free") : moneyKsh(order.deliveryFeeKsh)}</dd></div>
                <div><dt>{t("order.address")}</dt><dd>{delivery.address || t("checkout.pickup")} {delivery.point ? <a href={deliveryMapUrl(delivery.point)} target="_blank" rel="noopener noreferrer">Google Maps ↗</a> : null}</dd></div>
                <div><dt>{t("order.note")}</dt><dd>{order.deliveryNote ?? "—"}</dd></div>
              </dl>
            </article>
          </div>

          <div className="orderItemList">
            {order.items.map((orderItem) => orderItem.snapshot ? (
              <article className="orderItemCard" key={orderItem.id}>
                {orderItem.snapshot.imageUrl ? <img src={orderItem.snapshot.imageUrl} alt={orderItem.snapshot.title} /> : null}
                <div>
                  <h2>{orderItem.snapshot.title}</h2>
                  <p>{[orderItem.snapshot.brand, orderItem.snapshot.category, orderItem.snapshot.sizeLabel].filter(Boolean).join(" / ")}</p>
                  <strong>{moneyKsh(orderItem.snapshot.unitPriceKsh)}</strong>
                </div>
              </article>
            ) : null)}
          </div>

          <div className="orderStatusActions">
            <a className="reserve-button secondary" href={supportWhatsAppUrl(`Hello Direct Loop, I need after-sales help with order ${order.orderNumber}.`)} target="_blank" rel="noopener noreferrer">{t("support.chat")}</a>
            <Link className="reserve-link" href="/">{t("cart.continueShopping")}</Link>
            {!["PAID", "FULFILLING", "COMPLETED"].includes(order.status) ? <Link className="reserve-button secondary" href="/checkout">{t("checkout.backToCheckout")}</Link> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
