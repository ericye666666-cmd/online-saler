import { prisma } from "@online-saler/database";
import { currentCustomerSession } from "./customer-auth";
import { currentGuestCheckout } from "./guest-checkout";

export type CheckoutViewer = {
  customerId: string;
  isGuest: boolean;
  /**
   * Signed-in shoppers reach every order on their account. Guests only reach the
   * orders their own device started, so typing a stranger's M-Pesa number into
   * checkout never opens that stranger's history.
   */
  ownsOrder: (orderId: string) => boolean;
};

/**
 * Every identity this browser can act as, account first. A guest who creates an
 * account after paying keeps both: the session for the new account, the cookie
 * for the orders they placed before it existed.
 */
export async function checkoutViewers(): Promise<CheckoutViewer[]> {
  const viewers: CheckoutViewer[] = [];
  const session = await currentCustomerSession();
  if (session) {
    viewers.push({ customerId: session.customerId, isGuest: false, ownsOrder: () => true });
  }
  const guest = await currentGuestCheckout();
  if (guest && !viewers.some((viewer) => viewer.customerId === guest.customerId)) {
    viewers.push({
      customerId: guest.customerId,
      isGuest: true,
      ownsOrder: (orderId: string) => guest.orderIds.includes(orderId)
    });
  }
  return viewers;
}

/**
 * The customer id to act as for one order, or null when this browser holds no
 * identity that may touch it.
 */
export async function resolveOrderViewer(orderId: string, viewers: CheckoutViewer[]): Promise<string | null> {
  if (!viewers.length) return null;
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: { in: viewers.map((viewer) => viewer.customerId) } },
    select: { id: true, customerId: true }
  });
  if (!order) return null;
  const viewer = viewers.find((candidate) => candidate.customerId === order.customerId);
  return viewer?.ownsOrder(order.id) ? order.customerId : null;
}
