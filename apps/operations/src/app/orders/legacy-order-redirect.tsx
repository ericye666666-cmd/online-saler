import { redirect } from "next/navigation";

const redirects: Record<string, string> = {
  "/orders/pending-payment": "/orders/all?status=pending-payment",
  "/orders/payment-processing": "/orders/all?status=pending-payment",
  "/orders/paid": "/orders/all?status=waiting-pick",
  "/orders/cancelled": "/orders/all?status=cancelled",
  "/orders/expired": "/orders/all?status=cancelled",
  "/orders/refunded": "/orders/after-sales",
  "/orders/payment-exceptions": "/orders/exceptions"
};

export function LegacyOrderRedirect({ pathname }: { pathname: string }) {
  return redirect(redirects[pathname] ?? "/orders/all");
}
