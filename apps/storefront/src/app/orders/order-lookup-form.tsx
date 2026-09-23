"use client";

import { FormEvent, useState } from "react";
import { Search } from "lucide-react";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";

/**
 * "I ordered on another phone." Takes the M-Pesa number and the order number
 * from the confirmation message and, when both match, re-attaches the order to
 * this device so the order page and the balance payment work again.
 *
 * Deliberately not a phone-number-only lookup: that would hand anyone who knows
 * a mobile number somebody else's purchase history.
 */
export function OrderLookupForm({ defaultOrderNumber = "" }: { defaultOrderNumber?: string }) {
  const { t } = useStorefrontI18n();
  const [phone, setPhone] = useState("");
  // Prefilled when the shopper arrived on a link that already names the order —
  // a WhatsApp message from the store, say. Then the only thing left to type is
  // the number that proves the order is theirs.
  const [orderNumber, setOrderNumber] = useState(defaultOrderNumber);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, orderNumber })
      });
      const result = await response.json().catch(() => ({})) as { orderNumber?: string; error?: string };
      if (!response.ok || !result.orderNumber) throw new Error(result.error || t("orders.lookupFailed"));
      // A full navigation, not a router push: the order the server may now show
      // was decided by a cookie this response just set.
      window.location.href = `/orders/${encodeURIComponent(result.orderNumber)}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("orders.lookupFailed"));
      setBusy(false);
    }
  }

  return (
    <form className="orderLookup" onSubmit={submit}>
      <h2>{t("orders.lookupTitle")}</h2>
      <p>{t("orders.lookupBody")}</p>

      <label>
        <span>{t("orders.lookupPhone")}</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
        />
      </label>

      <label>
        <span>{t("orders.lookupNumber")}</span>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          placeholder="DL-20260923-A1B2C3D4"
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          required
        />
      </label>

      {error ? <p className="orderLookupError" role="alert">{error}</p> : null}

      <button className="commercePrimaryButton full" type="submit" disabled={busy}>
        <Search size={17} aria-hidden="true" /> {busy ? t("orders.lookupBusy") : t("orders.lookupAction")}
      </button>
    </form>
  );
}
