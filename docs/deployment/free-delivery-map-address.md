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
6. New attributed payment earns 25% of item subtotal (was 10% until 2026-09-15); payment retries do not
   recalculate existing commissions. Weekly payout remains manual and requires
   a real verified transfer reference.
7. Customer Order Detail's support link opens WhatsApp with the order number;
   the customer sends the message. Existing manual support records remain intact.

Component source: https://github.com/visgl/react-google-maps (MIT).
Places (New): https://developers.google.com/maps/documentation/javascript/place-autocomplete-new

## Address picker update — 2026-09-14

Checkout now opens an address-list dialog, then map/search, place type, and
address details. Apartment floor and door are required; office building is
required. Customers can adjust the entrance pin and save a label. The saved
address book and checkout draft are scoped to the signed-in customer on the
current browser/device. There is no cross-device address synchronization in this
change, and legacy unscoped checkout drafts are not imported into another account.

Building, floor, door and directions are serialized into the existing
`deliveryAddress` string, with the existing Google Maps URL last. Operations and
customer order pages retain the same parser and receive the entrance coordinate.
No shared schema, API contract, fee or payment state changes are required.

Automatic street-name lookup additionally uses Google's Geocoder; enable and
allow Geocoding API for the browser key if resolved street names are required.
The exact selected coordinate remains usable when reverse geocoding fails.
Maps/Places failures retain manual entry. Runtime key configuration is unchanged.

Before releasing, verify on an iPhone and desktop:

1. Swipe product images both ways, scroll vertically from the photo, tap the
   progress controls, and use desktop thumbnails/arrow keys.
2. Add an address, search a Kenyan place, drag the map and confirm the pin.
3. Choose Apartment, validate floor/door, mark entrance, save, then edit/reselect.
4. Back/close must retain the previously saved address; refresh restores saved
   addresses only for the same account on the same device.
5. Test location refusal, missing/blocked key, blocked browser storage, and a
   current account with no delivery address. Saving an address must not start
   payment; payment without an address must fail before a checkout request.
6. Verify the final order/Operations address includes all details and the exact
   entrance map link using the existing controlled-order acceptance procedure.

Browser validation for this update is currently blocked by
`net::ERR_BLOCKED_BY_CLIENT` on the local QA route. Unit/build checks do not
constitute mobile Safari, live Maps or live payment acceptance.

Local `npm run ci` passed during authoring. Browser QA of the isolated local
component was blocked by `net::ERR_BLOCKED_BY_CLIENT` at localhost. Do not treat
build/unit results as proof of live Google Maps, geolocation or delivery.
