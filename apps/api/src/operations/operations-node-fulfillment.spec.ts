import assert from "node:assert/strict";
import test from "node:test";
import { FulfillmentMethod, FulfillmentNodeType, FulfillmentStatus } from "@online-saler/database";
import {
  buildPackageCode,
  canResolveFulfillmentException,
  canTransitionFulfillment,
  handoverStatusFor,
  requiresNodeTransit
} from "./operations-fulfillment-state";

const PICKUP = FulfillmentMethod.PICKUP;
const DELIVERY = FulfillmentMethod.KIKUYU_LOCAL_DELIVERY;

test("a package bound for a store has to be sent and received before handover", () => {
  assert.equal(requiresNodeTransit(FulfillmentNodeType.STORE), true);
  assert.equal(canTransitionFulfillment({
    from: FulfillmentStatus.PACKED,
    to: FulfillmentStatus.IN_TRANSIT_TO_NODE,
    fulfillmentMethod: PICKUP,
    nodeType: FulfillmentNodeType.STORE
  }), true);
  assert.equal(canTransitionFulfillment({
    from: FulfillmentStatus.IN_TRANSIT_TO_NODE,
    to: FulfillmentStatus.ARRIVED_AT_NODE,
    fulfillmentMethod: PICKUP,
    nodeType: FulfillmentNodeType.STORE
  }), true);
  // Skipping the store receipt is what "the warehouse says it shipped, the
  // store says it never came" looks like in data, so it is not allowed.
  assert.equal(canTransitionFulfillment({
    from: FulfillmentStatus.PACKED,
    to: FulfillmentStatus.READY_FOR_PICKUP,
    fulfillmentMethod: PICKUP,
    nodeType: FulfillmentNodeType.STORE
  }), false);
});

test("an order handed over at the warehouse never enters transit", () => {
  assert.equal(requiresNodeTransit(FulfillmentNodeType.WAREHOUSE), false);
  assert.equal(canTransitionFulfillment({
    from: FulfillmentStatus.PACKED,
    to: FulfillmentStatus.READY_FOR_PICKUP,
    fulfillmentMethod: PICKUP,
    nodeType: FulfillmentNodeType.WAREHOUSE
  }), true);
  assert.equal(canTransitionFulfillment({
    from: FulfillmentStatus.PACKED,
    to: FulfillmentStatus.IN_TRANSIT_TO_NODE,
    fulfillmentMethod: PICKUP,
    nodeType: FulfillmentNodeType.WAREHOUSE
  }), false);
});

test("a package at its node moves to the handover state its method needs", () => {
  assert.equal(handoverStatusFor(PICKUP), FulfillmentStatus.READY_FOR_PICKUP);
  assert.equal(handoverStatusFor(DELIVERY), FulfillmentStatus.READY_FOR_DISPATCH);
  assert.equal(canTransitionFulfillment({
    from: FulfillmentStatus.ARRIVED_AT_NODE,
    to: FulfillmentStatus.READY_FOR_DISPATCH,
    fulfillmentMethod: DELIVERY,
    nodeType: FulfillmentNodeType.STORE
  }), true);
  // A pickup order cannot be pushed into the delivery queue by mistake.
  assert.equal(canTransitionFulfillment({
    from: FulfillmentStatus.ARRIVED_AT_NODE,
    to: FulfillmentStatus.READY_FOR_DISPATCH,
    fulfillmentMethod: PICKUP,
    nodeType: FulfillmentNodeType.STORE
  }), false);
});

test("an exception returns to the step it interrupted, and only that step", () => {
  assert.equal(canResolveFulfillmentException({
    status: FulfillmentStatus.EXCEPTION,
    exceptionFromStatus: FulfillmentStatus.PICKING
  }), true);
  // A write-off clears the remembered step, which is what makes it final.
  assert.equal(canResolveFulfillmentException({
    status: FulfillmentStatus.EXCEPTION,
    exceptionFromStatus: null
  }), false);
  assert.equal(canResolveFulfillmentException({
    status: FulfillmentStatus.EXCEPTION,
    exceptionFromStatus: FulfillmentStatus.COMPLETED
  }), false);
  assert.equal(canResolveFulfillmentException({
    status: FulfillmentStatus.PACKED,
    exceptionFromStatus: FulfillmentStatus.PICKING
  }), false);
});

test("package codes name their node and order and survive odd formatting", () => {
  assert.equal(buildPackageCode("DL-20260923-1A2B3C4D", "kinoo"), "PKG-KINOO-1A2B3C4D");
  assert.equal(buildPackageCode("dl-20260923-abcd", "lucky-summer"), "PKG-LUCKYS-0923ABCD");
});
