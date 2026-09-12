# Free delivery and Google Maps address rollout

The production workflow already passes repository Actions variable
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY_PRODUCTION` into the storefront build/runtime.
The checkout now reads the runtime value on its authenticated server page.

For map search/pins, configure a Google Maps browser key with:

- Maps JavaScript API and Places API (New) enabled in its Google Cloud project.
- HTTP referrer restriction to the actual storefront domain (`https://dloop.co.ke/*`),
  plus only any deliberately supported preview domains.
- API restrictions to those two APIs. An enabled Maps billing account is required.

Never commit the key. Without a key, manual address entry and optional browser
geolocation remain usable; Google search and the embedded map are unavailable.
Map script/search failures must never prevent manual checkout.

Release Operations and API, then the existing manual production storefront
workflow with `develop`, `deploy-production`, `live`. New orders quote zero
delivery fee; existing in-flight payments retain their original snapshot.

Acceptance:

1. Select delivery: both its option and summary show Free; total equals items.
2. Open Google Maps, search a Kenyan landmark, select it, move the pin.
3. Check location permission denied, search error, and manual address paths.
4. Add building/house details in delivery note. Refresh to verify draft restore.
5. On a real delivery order, verify the same address and map link in customer
   Order Detail and Operations; handoff and delivered status require actual facts.
6. New attributed payment earns 10% of item subtotal; payment retries do not
   recalculate existing commissions. Weekly payout remains manual and requires
   a real verified transfer reference.
7. Customer Order Detail's support link opens WhatsApp with the order number;
   the customer sends the message. Existing manual support records remain intact.

Component source: https://github.com/visgl/react-google-maps (MIT).
Places (New): https://developers.google.com/maps/documentation/javascript/place-autocomplete-new

Local `npm run ci` passed during authoring. Browser QA of the isolated local
component was blocked by `net::ERR_BLOCKED_BY_CLIENT` at localhost. Do not treat
build/unit results as proof of live Google Maps, geolocation or delivery.
