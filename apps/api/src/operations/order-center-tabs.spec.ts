import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CustomerServiceCaseStatus,
  CustomerServiceIssueType,
  FulfillmentStatus,
  OrderStatus,
  prisma,
  type Prisma
} from "@online-saler/database";
import type { OperationsAccessService } from "./operations-access.service";
import { ORDER_CENTER_TABS, orderCenterTab, type OrderCenterTab } from "./operations-fulfillment-state";
import { OperationsFulfillmentService, nodeWhere, tabWhere } from "./operations-fulfillment.service";
import type { ProductImageStorageService } from "../product/product-image-storage.service";

/**
 * The order centre's tab strip is two halves that have to agree: the summary
 * counts each order under `orderCenterTab`, and clicking a tab lists the rows
 * `tabWhere` selects. If a status has no tab, or a tab's list and its count
 * disagree, the numbers stop adding up to 全部 and an order is on no tab at all
 * — which is how parcels sent to a store went missing from the strip.
 *
 * These tests run every combination of order status, fulfillment status and
 * open after-sale through both halves.
 */

type Row = {
  status: OrderStatus;
  fulfillmentNodeId: string | null;
  fulfillment: { status: FulfillmentStatus; fulfillmentNodeId: string | null } | null;
  customerServiceCases: Array<{ issueType: CustomerServiceIssueType; status: CustomerServiceCaseStatus }>;
};

/** Just enough of Prisma's filter semantics to evaluate the order-centre wheres. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (key === "AND") {
      if (!(value as Record<string, unknown>[]).every((entry) => matches(row, entry))) return false;
    } else if (key === "OR") {
      if (!(value as Record<string, unknown>[]).some((entry) => matches(row, entry))) return false;
    } else if (key === "NOT") {
      const list = Array.isArray(value) ? value : [value];
      if (list.some((entry) => matches(row, entry as Record<string, unknown>))) return false;
    } else if (key === "fulfillment") {
      const relation = value as { is?: Record<string, unknown> | null; isNot?: null };
      const related = row.fulfillment as Record<string, unknown> | null;
      if ("is" in relation) {
        if (relation.is === null ? related !== null : !related || !matches(related, relation.is!)) return false;
      }
      if ("isNot" in relation && !related) return false;
    } else if (key === "customerServiceCases") {
      const some = (value as { some: Record<string, unknown> }).some;
      if (!(row.customerServiceCases as Record<string, unknown>[]).some((item) => matches(item, some))) return false;
    } else if (!scalar(row[key], value)) {
      return false;
    }
  }
  return true;
}

function scalar(actual: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== "object") return actual === condition;
  const filter = condition as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
  if (filter.in && !filter.in.includes(actual)) return false;
  if (filter.notIn && filter.notIn.includes(actual)) return false;
  if ("not" in filter && actual === filter.not) return false;
  return true;
}

function everyRow(): Row[] {
  const rows: Row[] = [];
  const fulfillmentStatuses: Array<FulfillmentStatus | null> = [null, ...Object.values(FulfillmentStatus)];
  for (const status of Object.values(OrderStatus)) {
    for (const fulfillmentStatus of fulfillmentStatuses) {
      for (const afterSale of [false, true]) {
        rows.push({
          status,
          fulfillmentNodeId: null,
          fulfillment: fulfillmentStatus ? { status: fulfillmentStatus, fulfillmentNodeId: null } : null,
          customerServiceCases: afterSale
            ? [{ issueType: CustomerServiceIssueType.AFTER_SALE, status: CustomerServiceCaseStatus.OPEN }]
            : [{ issueType: CustomerServiceIssueType.AFTER_SALE, status: CustomerServiceCaseStatus.CLOSED }]
        });
      }
    }
  }
  return rows;
}

function tabOf(row: Row): OrderCenterTab {
  return orderCenterTab({
    orderStatus: row.status,
    fulfillmentStatus: row.fulfillment?.status,
    hasOpenAfterSale: row.customerServiceCases.some(
      (item) => item.issueType === CustomerServiceIssueType.AFTER_SALE && item.status !== CustomerServiceCaseStatus.CLOSED
    )
  });
}

test("every order lands on exactly one real tab, never only on 全部", () => {
  for (const row of everyRow()) {
    const tab = tabOf(row);
    assert.ok(ORDER_CENTER_TABS.includes(tab), `${row.status}/${row.fulfillment?.status}: ${tab} is not a tab`);
    assert.notEqual(tab, "all", `${row.status}/${row.fulfillment?.status} is counted in 全部 but on no tab`);
  }
});

test("every fulfillment status the API can report has its own tab", () => {
  const seen = new Map<OrderCenterTab, FulfillmentStatus>();
  for (const status of Object.values(FulfillmentStatus)) {
    const tab = orderCenterTab({ orderStatus: OrderStatus.FULFILLING, fulfillmentStatus: status });
    assert.notEqual(tab, "all", `${status} has no tab`);
    assert.ok(!seen.has(tab), `${status} and ${seen.get(tab)} share the ${tab} tab`);
    seen.set(tab, status);
  }
  assert.equal(orderCenterTab({ orderStatus: OrderStatus.FULFILLING, fulfillmentStatus: FulfillmentStatus.IN_TRANSIT_TO_NODE }), "in-transit-to-node");
  assert.equal(orderCenterTab({ orderStatus: OrderStatus.FULFILLING, fulfillmentStatus: FulfillmentStatus.ARRIVED_AT_NODE }), "at-node");
});

test("a tab lists exactly the orders it counts, so the counts add up to 全部", () => {
  const tabs = ORDER_CENTER_TABS.filter((tab) => tab !== "all");
  for (const row of everyRow()) {
    const listedOn = tabs.filter((tab) => matches(row as unknown as Record<string, unknown>, tabWhere(tab) as Record<string, unknown>));
    assert.deepEqual(listedOn, [tabOf(row)], `${row.status}/${row.fulfillment?.status}/${row.customerServiceCases[0].status}`);
  }
});

test("a store's list finds a parcel by the fulfillment record, falling back to the order", () => {
  const where = nodeWhere("kinoo") as Record<string, unknown>;
  const row = (orderNode: string | null, taskNode: string | null | undefined) => ({
    fulfillmentNodeId: orderNode,
    fulfillment: taskNode === undefined ? null : { status: FulfillmentStatus.IN_TRANSIT_TO_NODE, fulfillmentNodeId: taskNode }
  });
  assert.equal(matches(row("kinoo", "kinoo"), where), true);
  // A task created before its node was copied onto it still shows at its store.
  assert.equal(matches(row("kinoo", null), where), true);
  assert.equal(matches(row("kinoo", undefined), where), true);
  // The task is what the store trusts once it names a node.
  assert.equal(matches(row("kinoo", "thogoto"), where), false);
  assert.equal(matches(row(null, null), where), false);
});

test("sending a parcel to its store writes the store onto the fulfillment record", async (t) => {
  // The store console lists `?nodeId=` against the fulfillment record, and the
  // send check reads the order's node. Writing the node on send keeps a
  // correctly sent parcel on its store's en-route list whatever the task said.
  const KINOO = { id: "node-kinoo", code: "KINOO", name: "Kinoo", type: "STORE", phone: null };
  const printedAt = new Date("2026-09-25T08:00:00Z");
  const fulfillment = { id: "fulfillment", status: FulfillmentStatus.PACKED, fulfillmentNodeId: null, packageCode: "PKG-KINOO-43A434C5", packageLabelPrintedAt: printedAt };
  const order = {
    id: "order", orderNumber: "DL-20260924-43A434C5", status: OrderStatus.FULFILLING,
    fulfillmentMethod: "KIKUYU_LOCAL_DELIVERY", fulfillmentNodeId: KINOO.id, fulfillmentNode: KINOO,
    items: [{ id: "item" }], fulfillment
  };
  const writes: Array<Record<string, unknown>> = [];
  const tx = {
    $queryRaw: async () => [{ id: "order" }],
    orderFulfillment: {
      findUnique: async () => fulfillment,
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return fulfillment; }
    },
    fulfillmentEvent: { upsert: async () => ({}), create: async () => ({}) }
  };
  const original = prisma.$transaction;
  prisma.$transaction = (async (callback: (value: unknown) => unknown) => callback(tx)) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = original; });

  const service = new OperationsFulfillmentService({} as OperationsAccessService, {} as ProductImageStorageService);
  Object.assign(service as unknown as Record<string, unknown>, {
    employeeForPermission: async () => ({ actorAdminUserId: "admin", actorEmployeeId: "packer" }),
    requireOrderWithTask: async () => order,
    assertTransition: () => undefined,
    queueNodeNotification: async () => undefined,
    orderDetail: async () => order
  });
  await service.sendToNode("order", { adminUserId: "admin" });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].status, FulfillmentStatus.IN_TRANSIT_TO_NODE);
  assert.equal(writes[0].fulfillmentNodeId, KINOO.id);
  assert.equal(writes[0].sentToNodeByEmployeeId, "packer");
  // And that record is on Kinoo's en-route list.
  const sent = { status: order.status, customerServiceCases: [], fulfillmentNodeId: KINOO.id, fulfillment: { status: writes[0].status, fulfillmentNodeId: writes[0].fulfillmentNodeId } };
  assert.equal(matches(sent, nodeWhere(KINOO.id) as Record<string, unknown>), true);
  assert.equal(matches(sent, tabWhere("in-transit-to-node") as Record<string, unknown>), true);
});

// Keeps the Prisma type import honest: tabWhere returns an Order filter.
const _typed: Prisma.OrderWhereInput = tabWhere("packed");
void _typed;
