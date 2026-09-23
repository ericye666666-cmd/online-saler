"use client";

import { AlertCircle, CheckCircle2, Clock3, ReceiptText, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { friendlyFailureReason } from "../../../payments/payment-ui";
import { useStorefrontI18n } from "../../../i18n/use-storefront-i18n";
import { moneyKsh } from "../../storefront-products";

/**
 * Paying off a deposit hold. The shopper is mid-way through buying something —
 * money is already in — so this panel leads with the two facts that decide
 * whether they keep the piece: what is left to pay and how long they have.
 *
 * It deliberately does not reuse the checkout payment panel. That one is built
 * around a five-minute reservation running out; here the deadline is days away
 * and a failed prompt costs the shopper nothing.
 */

type BalanceStatus = {
  orderStatus: string;
  paymentStatus: string | null;
  paymentKind: string | null;
  balanceKsh: number;
  balanceDueAt: string | null;
  balanceDaysLeft: number | null;
  resultDescription: string | null;
};

export function BalancePaymentPanel({ orderId, balanceKsh, balanceDueAt, balanceDaysLeft, phone }: {
  orderId: string;
  balanceKsh: number;
  balanceDueAt: string | null;
  balanceDaysLeft: number | null;
  phone: string | null;
}) {
  const { t } = useStorefrontI18n();
  const [status, setStatus] = useState<BalanceStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const polling = useRef(false);

  const paymentStatus = status?.paymentStatus ?? null;
  const orderStatus = status?.orderStatus ?? "DEPOSIT_PAID";
  const waiting = paymentStatus === "PENDING";
  const settled = orderStatus === "PAID" || orderStatus === "FULFILLING" || orderStatus === "COMPLETED";

  // Only poll while a prompt is actually out. Outside that the page is static
  // and refreshing it would just burn the shopper's data for nothing.
  useEffect(() => {
    if (!waiting || polling.current) return;
    polling.current = true;
    const timer = setInterval(async () => {
      const next = await readStatus(orderId);
      if (!next) return;
      setStatus(next);
      if (next.paymentStatus !== "PENDING") {
        clearInterval(timer);
        polling.current = false;
        if (next.orderStatus === "PAID") window.location.reload();
      }
    }, 4000);
    return () => {
      clearInterval(timer);
      polling.current = false;
    };
  }, [waiting, orderId]);

  async function payBalance() {
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/payments/mpesa/initiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || t("balance.error"));
      const next = await readStatus(orderId);
      if (next) setStatus(next);
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : t("balance.error"));
    } finally {
      setSending(false);
    }
  }

  if (settled) {
    return (
      <section className="orderBalancePanel paid" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <div>
          <h2>{t("balance.paidTitle")}</h2>
          <p>{t("balance.paidBody")}</p>
        </div>
      </section>
    );
  }

  const outstanding = status?.balanceKsh || balanceKsh;
  const daysLeft = status?.balanceDaysLeft ?? balanceDaysLeft;
  const dueAt = status?.balanceDueAt ?? balanceDueAt;
  const dueLabel = dueAt
    ? new Date(dueAt).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    : null;
  const failed = paymentStatus === "FAILED" || paymentStatus === "CANCELLED" || paymentStatus === "TIMEOUT";
  const review = paymentStatus === "MANUAL_REVIEW";

  return (
    <section className="orderBalancePanel" aria-label="Pay the balance">
      <header className="orderBalanceHead">
        <Clock3 size={20} aria-hidden="true" />
        <div>
          <h2>{outstanding > 0 ? t("balance.headingAmount", { amount: moneyKsh(outstanding) }) : t("balance.headingFallback")}</h2>
          <p>
            {dueLabel
              ? t("balance.holdUntil", {
                date: dueLabel,
                left: typeof daysLeft === "number"
                  ? (daysLeft === 1 ? t("balance.leftLastDay") : t("balance.leftDays", { days: String(daysLeft) }))
                  : ""
              })
              : t("balance.holdUntilPlain")}
          </p>
        </div>
      </header>

      <p className="orderBalanceWarning">{t("balance.warning")}</p>

      {waiting ? (
        <p className="orderBalanceStage" role="status">
          <Smartphone size={16} aria-hidden="true" />
          {t("balance.waiting", { phone: phone ? ` (+${phone})` : "" })}
        </p>
      ) : null}
      {failed ? (
        <p className="orderBalanceStage failed" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          {t("balance.failed", { reason: friendlyFailureReason(status?.resultDescription) })}
        </p>
      ) : null}
      {review ? (
        <p className="orderBalanceStage review" role="alert">
          <ReceiptText size={16} aria-hidden="true" />
          {t("balance.review")}
        </p>
      ) : null}
      {error ? <p className="orderBalanceStage failed" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</p> : null}

      <button
        className="commercePrimaryButton full"
        type="button"
        disabled={sending || waiting || review}
        onClick={payBalance}
      >
        <Smartphone size={17} aria-hidden="true" />
        {sending
          ? t("balance.actionSending")
          : waiting
            ? t("balance.actionWaiting")
            : t("balance.action", { amount: moneyKsh(outstanding) })}
      </button>
    </section>
  );
}

async function readStatus(orderId: string): Promise<BalanceStatus | null> {
  const response = await fetch(`/api/payments/mpesa/status?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json() as Promise<BalanceStatus>;
}
