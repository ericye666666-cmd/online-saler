import { CheckoutPageClient } from "./checkout-page-client";
import { SiteHeader } from "../components/site-header";
import { currentCustomerSession } from "../../auth/customer-auth";
import { activeFulfillmentNodes } from "../../checkout/checkout-service";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await currentCustomerSession();
  const pickupPoints = (await activeFulfillmentNodes())
    .filter((node) => node.supportsPickup)
    .map((node) => ({
      id: node.id,
      code: node.code,
      name: node.name,
      mapsUrl: node.mapsUrl,
      address: node.address
    }));
  // Checkout never asks for an account. Signed-in shoppers keep their own saved
  // draft; everyone else shares the device-local "guest" draft.
  const draftKey = session?.customerId ?? "guest";

  return (
    <main className="productPage">
      <SiteHeader customerIdentity={session ? {
        displayName: session.displayName,
        email: session.email,
        avatarUrl: session.avatarUrl
      } : undefined} />
      <div className="productPageShell checkoutPageShell">
        <CheckoutPageClient key={draftKey} draftKey={draftKey} signedIn={Boolean(session)} pickupPoints={pickupPoints} mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""} />
      </div>
    </main>
  );
}
