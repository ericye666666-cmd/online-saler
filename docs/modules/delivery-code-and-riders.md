# Delivery Code and Store Riders

**Owner:** Operations (store nodes) and the rider on the bike.

## Scope

The last leg of the loop: a store hands a package to one of its own riders or a
Bolt driver, the customer reads a four-digit code off their own order page, and
the order only closes when they read it out.

In scope: the delivery code, the rider's mobile screen, authorized drop-off with
a photo, a failed delivery and its return to the store, the store's rider roster,
and the pickup code at the counter.

Out of scope: GPS tracking, route optimisation, maps routing, the Bolt API, live
rider location, dispatch algorithms, and logistics analytics. The physical model
is one central warehouse, six store nodes, store-based riders, customer.

## The rule

**No code, no completion.**

A delivery order cannot reach `COMPLETED` without a verified customer code. Not
if the rider knows the customer. Not if the store knows the customer. Not if the
customer sent "got it" on WhatsApp. Not if the rider says it went to the guard.
The state machine refuses the transition, so there is no screen and no endpoint
that can get around it.

## How the code behaves

| | |
| --- | --- |
| Length | 4 digits |
| Generated | at dispatch, never at payment |
| Verified against | a salted pbkdf2 hash |
| Readable by the customer | yes, on their own order page |
| Visible to the rider | no |
| Visible to store staff | no |
| Visible to customer service | no |
| Visible in any operations or rider API response | no |
| Wrong attempts allowed | 5, then the order locks |
| Reuse | none — dead after completion, failure, or replacement |

**No staff screen can look a code up.** "Resend code" issues a *new* code and
voids the old one. That is deliberate: it means customer service can rescue a
customer who never got the message without ever being able to read a code
themselves.

The customer, though, has to be able to read their own. Until 2026-09-23 the
only readable copy was the SMS, and with no SMS provider live that made every
delivery uncompletable. So the code is now also stored in
`OrderFulfillment.deliveryCode` and shown on `/orders/<number>`, the shopper's
own page, beside the pickup code that was always shown there. It is redacted
from every operations and rider response, cleared when the delivery completes or
fails, and replaced on every resend.

Only the codes are redacted. The customer's name, full phone number and
delivery address are returned to operations in full and printed on the parcel's
box label (owner decision, 2026-09-24, which removed the earlier phone masking):
a rider or store has to be able to ring the customer, and a masked number
cannot be dialled.

The property that matters is unchanged: **the people holding the package cannot
obtain the code**. A rider still cannot close a delivery they did not make, and
a store still cannot close one the customer never received. What changed is that
a leaked database row now contains a live code, where before it contained only a
hash. That is the price of having no SMS, and it is the reason this is worth
undoing once a provider is live — drop the column write and the order page
falls back to showing nothing.

Every check, right or wrong, writes a `CustomerCodeAttempt` row: the order, the
rider, the attempt number, the time. The digits that were typed are never stored.

## Data

- `OrderFulfillment.deliveryCodeHash`, `deliveryCode`, `deliveryCodeIssuedAt`,
  `deliveryCodeSentCount`
- `OrderFulfillment.customerCodeVerifiedAt`, `customerCodeFailedAttempts`,
  `customerCodeLockedAt` — shared by both handovers, since an order is either
  pickup or delivery
- `OrderFulfillment.deliveryCompletionMethod`, `dropOffPhotoObject`, `dropOffNote`
- `OrderFulfillment.deliveryFailureReason`, `deliveryFailureNote`,
  `deliveryAttemptCount`, `deliveryFailedAt`, `returningToNodeAt`
- `OrderFulfillment.currentHolderType`, `currentHolderId`, `currentHolderLabel`
- `DeliveryRider.fulfillmentNodeId`, `active`, `adminUserId`
- `CustomerCodeAttempt`

## API

Store, under `/operations/orders/:orderId`:

| Route | Does |
| --- | --- |
| `POST /dispatch-to-rider` | assigns the rider, mints the code, moves to `OUT_FOR_DELIVERY`, texts the customer, writes the event — all in one transaction |
| `POST /resend-delivery-code` | replaces the code and texts the new one |
| `POST /delivery-failed` | records a failure from the desk |
| `POST /return-to-node` | the rider is on the way back |
| `POST /confirm-return` | the package is back on the shelf |
| `POST /complete-delivery` | desk completion; still needs `code` |
| `POST /confirm-pickup` | counter pickup; needs the pickup code |

Rider, under `/operations/rider`. Every route resolves the rider from the bearer
token, never from the request body, so a rider cannot name another rider's id:

| Route | Does |
| --- | --- |
| `GET /me` | who the rider is and which store they ride for |
| `GET /deliveries` | only this rider's open deliveries |
| `POST /deliveries/:orderId/complete` | code, then done |
| `POST /deliveries/:orderId/drop-off` | photo **and** code, then done |
| `POST /deliveries/:orderId/failed` | reason and note |
| `POST /deliveries/:orderId/return` | heading back to the store |

Roster, under `/operations/riders`: `GET`, `POST`, `PATCH /:riderId`. A store
manager with a home node only ever sees and edits their own node's riders.

## Permissions

| Code | Who |
| --- | --- |
| `rider.deliveries` | the `DELIVERY_RIDER` role, and only that role |
| `page.rider.deliveries` | the rider's one screen |
| `riders.view`, `riders.manage` | store manager, order operations, project manager |
| `orders.resend-code` | store manager, order operations, project manager |

The `DELIVERY_RIDER` role holds exactly two permissions. It has no orders module,
so a rider signing in sees one screen with their own drops on it — no order list,
no finance, no affiliate, no other node, and nothing about commission or cost.

## Setting a rider up

1. **系统 / 账号** — create an admin account for the rider and give it the
   *Delivery Rider* role. Give them the login and password.
2. **订单中心 / 门店骑手** — add the rider with their name and phone, and type
   that login account in the "登录账号" box.
3. The rider opens the Operations URL on their phone, signs in, and lands on
   **我的配送**.

A rider set to 下班 keeps their login but receives no dispatches, and cannot be
stood down while they still have packages in hand.

## Clicking through it

1. **门店履约台** — pick the node, scan the package, **确认收到包裹**.
2. Same row, choose a rider and press **交给骑手并发送配送码** — or, for a Bolt
   driver, **登记外部 Bolt 骑手** then **交给 Bolt 骑手并发送配送码**. Nothing on the
   screen shows the code.
3. Press **用 WhatsApp 发给顾客**. WhatsApp opens on the customer's number with the
   link to their order page already written. They open it and see the four
   digits.
4. On the rider's phone, **我的配送** shows the order, the address, and a **打给顾客**
   button. Hand over the goods, ask for the code, type it, press
   **核对号码并完成**. The order is `COMPLETED`. With a Bolt driver instead of a
   rider, the store does this from **门店履约台** with
   **用顾客的配送码确认送达** once the customer confirms on the phone.
5. Type a wrong code instead: it says how many attempts are left. Five wrong and
   the order locks and says to call the store.
6. Press **代收** instead: it demands a photo *and* a code before the button
   enables.
7. Press **没送成**, pick a reason: the order goes to **配送失败**, the customer is
   told their payment is safe, and the code dies. **我现在把货送回门店** → the store
   sees **送回途中** → **确认收到退回的包裹** → the package is back at
   **已到店** and can be dispatched again with a fresh code.

## Operational risks

- **SMS is not live, so the store sends the link by hand.** The provider is
  env-gated (`AFRICASTALKING_API_KEY`, `AFRICASTALKING_USERNAME`,
  `AFRICASTALKING_SENDER_ID`); with nothing set, messages sit in the outbox and
  the log says so rather than pretending to send. The outbox also has to be
  drained — something must call `/api/internal/send-notifications` on a schedule.
  Until both are true, **用 WhatsApp 发给顾客** on the store desk is what actually
  reaches the customer: it opens WhatsApp with a link to their order page, where
  the code is. The message carries the link and never the digits, so sending it
  does not put the code in front of the person sending it.
- **A customer on a second handset needs the lookup form.** The order page is
  gated on the browser that placed the order. Opening the WhatsApp link on a
  different phone shows the phone-plus-order-number form instead, which
  re-attaches the order and then shows the code. Nothing else recovers it — not
  even customer service, who cannot read a code either.
- A store with no riders on the roster cannot dispatch. The screen says so and
  points at 门店骑手.
- The external Bolt path (`assign-rider` then `dispatch`) still exists and now
  also mints and texts a code, so it cannot strand an order that could never be
  completed.

## Tests

- `packages/business-rules/src/customer-code.test.ts` — generation, hashing,
  lockout, one-time use.
- `apps/api/src/operations/operations-delivery-code.spec.ts` — dispatch, both
  completion routes, wrong codes, lockout, drop-off proof, failure and return,
  redaction, and that no response carries a code or its hash.
