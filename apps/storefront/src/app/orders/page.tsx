import Link from "next/link";
import { ChevronRight, Clock3, MessageCircle } from "lucide-react";
import { depositHoldDaysLeft } from "@online-saler/business-rules";
import { SiteHeader } from "../components/site-header";
import { checkoutViewers } from "../../auth/checkout-identity";
import { customerOrderStatusLabel, listCustomerOrders } from "../../orders/order-service";
import { moneyKsh } from "../storefront-products";
import { getStorefrontI18n } from "../../i18n/server";
import { supportWhatsAppUrl } from "../../support/whatsapp";
import { OrderLookupForm } from "./order-lookup-form";

export const dynamic = "force-dynamic";

/**
 * The shopper's own orders. This page exists because of the deposit plan: a
 * hold has to be paid off days after checkout, from a browser that has long
 * since closed the confirmation screen, and until now the only route back to an
 * order was that screen's link or a WhatsApp message to customer service.
 *
 * Guests get here too — the checkout cookie remembers which orders this device
 * placed, and that is exactly the set this page may show.
 */
export default async function OrdersPage() {
  const [viewers, i18n] = await Promise.all([checkoutViewers(), getStorefrontI18n()]);
  const { t } = i18n;
  const orders = await listCustomerOrders(viewers);
  const supportHref = supportWhatsAppUrl("Hello Direct Loop, I cannot find one of my orders.");

  return (
    <main className="productPage">
      <SiteHeader />
      <div className="productPageShell">
        <section className="orderStatusCard">
          <h1>{t("orders.title")}</h1>

          {orders.length === 0 ? (
            <div className="ordersEmpty">
              <p>{t("orders.emptyBody")}</p>
              <Link className="reserve-link" href="/">{t("cart.continueShopping")}</Link>
            </div>
          ) : (
            <ul className="ordersList">
              {orders.map((order) => {
                const held = order.status === "DEPOSIT_PAID";
                const daysLeft = held && order.balanceDueAt ? depositHoldDaysLeft(order.balanceDueAt) : null;
                const cover = order.items.find((item) => item.snapshot?.imageUrl)?.snapshot?.imageUrl ?? null;
                const title = order.items[0]?.snapshot?.title ?? order.orderNumber;
                const extra = order.items.length - 1;
                const label = customerOrderStatusLabel({
                  orderStatus: order.status,
                  fulfillmentMethod: order.fulfillmentMethod,
                  fulfillmentStatus: order.fulfillment?.status
                });

                return (
                  <li key={order.id} className={held ? "ordersRow held" : "ordersRow"}>
                    <Link href={`/orders/${encodeURIComponent(order.orderNumber)}`}>
                      {cover ? <img src={cover} alt="" /> : <span className="ordersRowCover" aria-hidden="true" />}
                      <span className="ordersRowText">
                        <strong>{title}{extra > 0 ? ` +${extra}` : ""}</strong>
                        <span className="ordersRowMeta">
                          {order.orderNumber} · {moneyKsh(order.totalKsh)}
                        </span>
                        {held ? (
                          // The only row on this page with something still to
                          // do, so it states the debt and the deadline outright
                          // instead of a status word.
                          <span className="ordersRowDue">
                            <Clock3 size={14} aria-hidden="true" />
                            {t("orders.balanceDue", { amount: moneyKsh(order.balanceKsh) })}
                            {typeof daysLeft === "number"
                              ? ` · ${daysLeft === 1 ? t("orders.lastDay") : t("orders.daysLeft", { days: String(daysLeft) })}`
                              : ""}
                          </span>
                        ) : (
                          <span className="ordersRowStatus">{label}</span>
                        )}
                      </span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Always on the page, not only when the list is empty. A shopper who
              sees one order here may still be missing the one they placed on a
              different handset — and with a deposit deadline running, telling
              them to "contact support" is not good enough. */}
          <OrderLookupForm />

          <a className="reserve-link" href={supportHref} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={16} aria-hidden="true" /> {t("support.chat")}
          </a>
        </section>
      </div>
    </main>
  );
}
