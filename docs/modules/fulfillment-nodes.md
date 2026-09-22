# Fulfillment nodes and the store hand-off

Until 2026-09-23 the five stores existed only as a hard-coded array on the
checkout page, and the store a shopper picked was pasted as a sentence into the
order's free-text delivery note. Nothing downstream could route a package,
count a store's work, or settle an argument about a parcel that went missing
between the warehouse and the shop floor.

## What a node is

`FulfillmentNode` is one place a customer can be served from: the central
warehouse, or a store. Nodes are configured in operations under **系统管理 →
履约点配置**, so opening a sixth store or fixing a store's phone number no longer
needs a deploy.

| Field | Why it matters |
| --- | --- |
| `code` | Short, stable, lower-case. Used in package codes. Cannot change. |
| `phone` | Where "a package is coming" is sent. A node without one is flagged **缺手机号** and simply gets no notifications. |
| `supportsPickup` / `supportsDelivery` | Checkout only offers pickup nodes; routing only offers delivery nodes. |
| `status` | A node cannot be closed while it still holds open packages. |

Employees can be given a **home node**. Store staff may only receive packages
addressed to their own store; warehouse and head-office staff have no home node
and can act anywhere.

## The package's journey

```
PAID → PICKING → READY_TO_PACK → PACKED
                                   │
             warehouse node ───────┴─────── store node
                    │                            │
                    │                    IN_TRANSIT_TO_NODE
                    │                            │
                    │                     ARRIVED_AT_NODE
                    │                            │
                    └────────────┬───────────────┘
                                 │
                 READY_FOR_PICKUP │ READY_FOR_DISPATCH
                        │                   │
                        │           OUT_FOR_DELIVERY
                        │                   │
                        └────── COMPLETED ──┘
```

`IN_TRANSIT_TO_NODE` and `ARRIVED_AT_NODE` exist only for store nodes. The
warehouse hands over on the spot and skips both.

Sending a package stamps it with a **package code** — `PKG-<NODE>-<ORDER>` — and
the store scans that code in on arrival. The scan records who received it and
when, which is what settles "the warehouse says it shipped, the store says it
never came".

## Who does what

- **Warehouse** (`orders.assign-node`): routes a delivery order to its node and
  sends the packed parcel.
- **Store** (`orders.node-receive`, `orders.dispatch`, `orders.complete`,
  `orders.delivery-cost`): receives the package, hands it to the customer or a
  Bolt rider, and records the fare. Their screen is **订单中心 → 门店履约台**.
- **Operations** (`orders.write-off`) and **finance** (`orders.refund`) close
  orders that can never be fulfilled.

## Delivery economics

The customer pays a flat KSh 50. The store pays whatever Bolt charges. Both
numbers are recorded per order — `Order.deliveryFeeKsh` and
`OrderFulfillment.actualDeliveryCostKsh` — and the difference is the subsidy the
company absorbed. **订单中心 → 财务汇总** totals them, and flags deliveries whose
fare was never entered, because an unrecorded fare is unknown, not zero.

## Checking it by hand

1. Place a pickup order on the storefront and choose a store. The order page
   shows the store, its map link and a six-character pickup code.
2. In operations, pick and pack the order. **发往门店** appears once it is
   packed; it stamps the package code.
3. Open **门店履约台**, choose that store, and type the package code into the scan
   box. **确认收到包裹** moves it to 已到店.
4. Hand it over with **放到自提区并通知顾客**, then **核对并交付** using the
   pickup code.
5. For a delivery order, use **登记 Bolt 骑手 → 交给骑手 → 记录车费 → 确认已送达**,
   then check the fare and subsidy in 财务汇总.
