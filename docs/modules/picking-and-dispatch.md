# The warehouse's morning: picking, packing and dispatch

**Owner:** Warehouse.

## Why this exists separately from the order centre

The order centre answers "what happened to DL-…?". A warehouse between eight and
eleven is asking a different question: what do I fetch, in what order, and which
pile does it go on. Answering the second question through a list of order cards
means walking the racks once per order, which is why the same aisle gets walked
five times before nine o'clock.

So there is one screen for the run — **仓库发货 → 每日打单配送** — and one for the
person doing the fetching — **仓库发货 → 手机拣货台**. Both write through the same
endpoints as the order centre. There is no warehouse-only state anywhere, so an
order moved on any of the three shows the same status on the other two.

## The run

`/orders/dispatch` splits every order still inside the warehouse into the four
steps of a morning, and groups each step by where the parcel is going — one
trolley per store, one pile for the van.

| Step | Fulfillment status | What happens |
| --- | --- | --- |
| ① 打单拣货 | `PAID` | Print the picking sheet, claim the orders. |
| ② 逐件核对 | `PICKING` | Every garment is scanned against its barcode. |
| ③ 打包 | `READY_TO_PACK` | Pack, which mints the package code, then print labels. |
| ④ 发车 | `PACKED` | Route to a node if there is none, then send. |

Ticking orders raises a bar offering only what fits them, each action saying how
many orders it will touch. A mixed selection is normal — a morning is rarely all
at one step — so `领取拣货 12 单` out of twenty ticked is the honest label.

Batches run one request at a time. These take the same order lock and touch the
same stock rows; thirty at once earns thirty conflicts rather than thirty claimed
orders. A failure does not stop the run, and every order that failed is named,
because "12 succeeded" does not say which parcel to go and find.

## The picking sheet

A4, printed through an isolated iframe so a popup blocker cannot swallow it and
the app's stylesheet cannot leak in.

The orders are taken apart and the garments put back together **in shelf order**,
because a picker walks the racks once, not once per order. The destination
travels on each line rather than heading a section — the sort is by where the
garment *is*, not where it is going — and the sheet ends with a count per
destination so the packing bench can check its piles against a number.

Shelf codes sort segment by segment with numbers compared as numbers, so `A-2`
comes before `A-10`. Anything unparseable sorts last, where it is noticed rather
than silently dropped into the middle of the walk. That rule is the one piece of
logic here that can be wrong in a way that costs an hour, so it is tested in
`picking-sheet.test.ts`.

**The sheet is not a record.** Nothing downstream reads it. It is printed on
paper and ticked with a pen, and the system learns nothing until a barcode is
scanned.

## The picker's phone

`/orders/picking`. One garment per screen, shelf code set at the largest size on
the page because it is read at arm's length in a warehouse.

Deliberately not a checklist. A list invites ticking ahead — *I will scan them
all at the bench* — and scanning at the bench proves only that the garment
exists, not that it came off the right shelf. One at a time, scan, advance.

- **领取并开始拣货** claims every waiting order, then flattens their garments into
  one shelf-ordered queue.
- A scan posts to `POST /operations/orders/:orderId/items/:orderItemId/scan`,
  the same endpoint the workbench uses. The list is re-read afterwards, so the
  picker sees an order leave for 待打包 when its last garment is verified.
- **找不到这件** drops the garment to the end of the queue rather than out of it,
  so a blocked shelf gets a second look. Anything still missing at the end is
  listed by order number for the supervisor. The phone cannot raise an exception
  itself: that is a written fact about stock, and it belongs on the workbench.

### Packing, on the same phone

Picking is walked in shelf order across every order, which is what stops a picker
crossing the same aisle five times — and it means the trolley comes back mixed,
with nothing yet saying which garments belong in one bag.

So the station has a second mode, and it flips to it by itself the moment the
racks are done. **一张卡片 = 一个包裹**: one card per order, carrying the photos
and barcodes needed to find its garments among the rest of the trolley, then
包装方式 and 包裹数量, then 完成打包 — which mints the package code the store
scans on arrival.

This is one screen rather than two because it is one person. Sending them back to
a desk to answer "what goes together" is the point at which the trolley gets
guessed at.

The paper sheet answers the same question at its foot, under **再按订单装袋**:
the same run listed one line per parcel, since the table itself is sorted by
shelf and scatters an order's lines down the page.

Labels are the exception: the Deli printer is on a Windows PC, so a phone cannot
print. Pack everything on the phone, then print the whole batch from
**每日打单配送** at that PC.

The desk view of the same route frames that screen like a phone and puts a QR
code beside it. It is not an iframe and not a screenshot — it is the same React
tree, so what a supervisor sees cannot drift from what the picker sees, and there
is no second session to sign into.

## Permissions

| Code | Screen |
| --- | --- |
| `page.orders.dispatch` | the daily run |
| `page.orders.picking` | the picker's phone |
| `orders.pick` | claim a picking task and scan garments |
| `orders.pack`, `orders.assign-node` | pack, label and send |

Both page codes seed themselves onto the roles that already hold
`page.orders.workbench`; see the seed note in
[fulfillment-nodes.md](fulfillment-nodes.md).

## Operational risks

- **A garment with no shelf code cannot be routed to.** It sorts last on both the
  sheet and the phone, which makes it visible, but the real fix is at check-in.
- **Claiming is all-or-nothing per run.** The phone claims every waiting order,
  which is right for one picker and wrong for three. With more than one picker,
  assign orders on the workbench first; the phone then only queues what that
  employee holds, because the scan endpoint refuses another picker's task.
- **The picking sheet can go stale.** It is a snapshot taken when printed. An
  order cancelled or written off after printing still appears on the paper; the
  scan will refuse it, which is the correct order of authority.
