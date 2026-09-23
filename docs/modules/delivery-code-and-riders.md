# Delivery Code and Store Riders

**Owner:** Operations (store nodes) and the rider on the bike.

## Scope

The last leg of the loop: a store hands a package to one of its own riders, the
customer gets a four-digit code by SMS, and the order only closes when the
customer reads that code out.

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
| Stored as | a salted pbkdf2 hash, never plaintext |
| Visible to the rider | no |
| Visible to store staff | no |
| Visible to customer service | no |
| Visible in any API response | no |
| Wrong attempts allowed | 5, then the order locks |
| Reuse | none — dead after completion, failure, or replacement |

Because only a hash is kept, **nobody can look a code up**. "Resend code" issues
a *new* code and voids the old one. That is deliberate: it means customer service
can rescue a customer who never got the SMS without ever being able to read a
code themselves.

Every check, right or wrong, writes a `CustomerCodeAttempt` row: the order, the
rider, the attempt number, the time. The digits that were typed are never stored.

## Data

- `OrderFulfillment.deliveryCodeHash`, `deliveryCodeIssuedAt`,
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
2. Same row, choose a rider and press **交给骑手并发送配送码**. The customer's
   phone gets: *"Delivery code 5832. Give this code to the rider only after you
   have received your order."* Nothing on the screen shows 5832.
3. On the rider's phone, **我的配送** shows the order, the address, and a **打给顾客**
   button. Hand over the goods, ask for the code, type it, press
   **核对号码并完成**. The order is `COMPLETED`.
4. Type a wrong code instead: it says how many attempts are left. Five wrong and
   the order locks and says to call the store.
5. Press **代收** instead: it demands a photo *and* a code before the button
   enables.
6. Press **没送成**, pick a reason: the order goes to **配送失败**, the customer is
   told their payment is safe, and the code dies. **我现在把货送回门店** → the store
   sees **送回途中** → **确认收到退回的包裹** → the package is back at
   **已到店** and can be dispatched again with a fresh code.

## Operational risks

- **SMS delivery is the single point of failure.** Without a working provider the
  customer never gets a code and no delivery can be completed. The provider is
  env-gated (`AFRICASTALKING_API_KEY`, `AFRICASTALKING_USERNAME`,
  `AFRICASTALKING_SENDER_ID`); with nothing set, messages sit in the outbox and
  the log says so rather than pretending to send. The outbox also has to be
  drained — something must call `/api/internal/send-notifications` on a schedule.
  Until both are true, this feature does not work end to end.
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
