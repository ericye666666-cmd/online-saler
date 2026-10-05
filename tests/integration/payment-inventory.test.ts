import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

async function main() {
  const databaseUrl = process.env.MVP_INTEGRATION_DATABASE_URL;
  if (!databaseUrl) throw new Error("Set MVP_INTEGRATION_DATABASE_URL to a disposable local test database.");
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Payment integration tests require a localhost database whose name contains test.");
  }
  process.env.DATABASE_URL = databaseUrl;
  Object.assign(process.env, {
    MPESA_ENV: "sandbox", MPESA_CONSUMER_KEY: "integration-mock", MPESA_CONSUMER_SECRET: "integration-mock",
    MPESA_SHORTCODE: "174379", MPESA_PASSKEY: "integration-mock", MPESA_CALLBACK_BASE_URL: "https://example.invalid",
    MPESA_ENVIRONMENT: "sandbox"
  });
  // Reject every accidental network request. Payment initiation below uses an
  // in-memory provider implementation; the actual Prisma database is real.
  globalThis.fetch = async () => { throw new Error("Network forbidden in payment integration tests"); };
  const { prisma, releaseExpiredReservations } = await import("@online-saler/database");
  const { startCheckout, releaseCustomerCheckoutReservations } = await import("../../apps/storefront/src/checkout/checkout-service");
  const { initiateMpesaPayment, handleMpesaCallback } = await import("../../apps/storefront/src/payments/payment-service");
  const { MpesaClient, MpesaProviderError, mpesaConfigFromEnv } = await import("../../apps/storefront/src/payments/mpesa-client");
  const sequentialOnly = process.env.MVP_TEST_DATABASE_ENGINE === "pglite";
  const concurrencyOptions = { skip: sequentialOnly ? "PGlite single-connection mode cannot establish concurrent PostgreSQL correctness" : false };
  const prefix = `payment-test-${randomUUID()}`;
  let count = 0;
  const customers: string[] = [];
  const products: string[] = [];
  const callbackKeys: string[] = [];

  async function fixture(productId?: string) {
    const key = `${prefix}-${++count}`;
    const customer = await prisma.customer.create({ data: {
      googleSubjectId: key, email: `${key}@example.invalid`, normalizedEmail: `${key}@example.invalid`, phone: "254712345678"
    } });
    customers.push(customer.id);
    const product = productId ? await prisma.product.findUniqueOrThrow({ where: { id: productId } }) : await prisma.product.create({ data: {
      productCode: key, barcode: key, status: "PUBLISHED", title: "Integration test item", priceKsh: 200,
      inventoryItem: { create: { barcode: key, status: "AVAILABLE" } }
    } });
    if (!productId) products.push(product.id);
    return { customer, product };
  }
  async function pickupNode() {
    return prisma.fulfillmentNode.upsert({
      where: { code: `${prefix}-node` },
      update: {},
      create: { code: `${prefix}-node`, name: "Integration pickup point", type: "STORE" }
    });
  }
  async function checkout(f: Awaited<ReturnType<typeof fixture>>, phone = "0712345678") {
    const node = await pickupNode();
    return startCheckout({
      customerId: f.customer.id, productIds: [f.product.id], phone,
      fulfillmentMethod: "PICKUP", fulfillmentNodeId: node.id
    });
  }
  // A shopper with their own phone, so the per-phone allowance tests below are
  // not affected by reservations other tests leave on the shared fixture phone.
  async function shopper(phone: string) {
    const key = `${prefix}-${++count}`;
    const customer = await prisma.customer.create({ data: {
      googleSubjectId: key, email: `${key}@example.invalid`, normalizedEmail: `${key}@example.invalid`, phone
    } });
    customers.push(customer.id);
    return customer;
  }
  async function garments(howMany: number) {
    const ids: string[] = [];
    for (let index = 0; index < howMany; index += 1) {
      const key = `${prefix}-${++count}`;
      const product = await prisma.product.create({ data: {
        productCode: key, barcode: key, status: "PUBLISHED", title: "Integration test item", priceKsh: 200,
        inventoryItem: { create: { barcode: key, status: "AVAILABLE" } }
      } });
      products.push(product.id);
      ids.push(product.id);
    }
    return ids;
  }
  async function checkoutPieces(customerId: string, productIds: string[], phone: string) {
    const node = await pickupNode();
    return startCheckout({ customerId, productIds, phone, fulfillmentMethod: "PICKUP", fulfillmentNodeId: node.id });
  }
  async function stockOf(productIds: string[]) {
    const rows = await prisma.inventoryItem.findMany({ where: { productId: { in: productIds } } });
    return productIds.map((id) => rows.find((row) => row.productId === id)?.status);
  }
  function provider(error?: Error) {
    let calls = 0;
    const client = new MpesaClient(mpesaConfigFromEnv());
    client.initiateStkPush = async () => {
      calls += 1;
      if (error) throw error;
      const id = `${prefix}-provider-${randomUUID()}`;
      callbackKeys.push(id);
      return { checkoutRequestId: id, merchantRequestId: "integration-merchant", responseCode: "0", responseDescription: "accepted", customerMessage: "mock", raw: { mock: true } };
    };
    return { client, calls: () => calls };
  }
  function callback(checkoutRequestId: string, options: { code?: number; amount?: number; receipt?: string; phone?: number } = {}) {
    return { Body: { stkCallback: {
      CheckoutRequestID: checkoutRequestId, MerchantRequestID: "integration-merchant", ResultCode: options.code ?? 0, ResultDesc: "integration callback",
      CallbackMetadata: { Item: [
        { Name: "Amount", Value: options.amount ?? 200 },
        { Name: "MpesaReceiptNumber", Value: options.receipt ?? `receipt-${randomUUID()}` },
        { Name: "PhoneNumber", Value: options.phone ?? 254712345678 }
      ] }
    } } };
  }
  async function pending() {
    const f = await fixture();
    const order = await checkout(f);
    const mock = provider();
    const payment = await initiateMpesaPayment(order.orderId, f.customer.id, mock.client);
    return { ...f, order, payment, mock };
  }
  async function expire(orderId: string) {
    await prisma.checkoutDraft.update({ where: { convertedOrderId: orderId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await releaseExpiredReservations();
  }
  try {
    await test("checkout retry returns its original reserved order", async () => {
      const f = await fixture();
      const first = await checkout(f);
      const retried = await checkout(f);
      assert.equal(retried.orderId, first.orderId);
      assert.equal(await prisma.order.count({ where: { customerId: f.customer.id } }), 1);
      await releaseCustomerCheckoutReservations(f.customer.id, [f.product.id]);
    });
    await test("a payment that may still land cannot be silently moved to another payment phone", async () => {
      const f = await pending();
      const node = await pickupNode();
      await assert.rejects(startCheckout({ customerId: f.customer.id, productIds: [f.product.id], phone: "0799999999", fulfillmentMethod: "PICKUP", fulfillmentNodeId: node.id }), /previous payment is still being confirmed/);
      assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).phone, "254712345678");
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: f.order.orderId } })).status, "PAYMENT_PROCESSING");
      await releaseCustomerCheckoutReservations(f.customer.id, [f.product.id]);
    });
    await test("an unpaid attempt with no prompt sent is released when the shopper switches phone", async () => {
      const f = await fixture();
      const first = await checkout(f);
      const second = await checkout(f, "0799999998");
      assert.notEqual(second.orderId, first.orderId);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: first.orderId } })).status, "CANCELLED");
      assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).phone, "254799999998");
      assert.deepEqual(await stockOf([f.product.id]), ["RESERVED"]);
      await releaseCustomerCheckoutReservations(f.customer.id, [f.product.id]);
    });
    await test("one phone can check out fifty pieces at once", async () => {
      const phone = "0722000050";
      const customer = await shopper("254722000050");
      const ids = await garments(50);
      const order = await checkoutPieces(customer.id, ids, phone);
      assert.equal(order.items.length, 50);
      assert.ok((await stockOf(ids)).every((status) => status === "RESERVED"));
      await releaseCustomerCheckoutReservations(customer.id, ids);
      assert.ok((await stockOf(ids)).every((status) => status === "AVAILABLE"));
    });
    await test("a fifty-first piece is refused and costs no earlier attempt", async () => {
      const phone = "0722000051";
      const customer = await shopper("254722000051");
      const ids = await garments(51);
      const earlier = await checkoutPieces(customer.id, ids.slice(0, 2), phone);
      await assert.rejects(checkoutPieces(customer.id, ids, phone), /You can pay for up to 50 pieces at once\./);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: earlier.orderId } })).status, "PENDING_PAYMENT");
      assert.deepEqual(await stockOf(ids.slice(0, 3)), ["RESERVED", "RESERVED", "AVAILABLE"]);
      await releaseCustomerCheckoutReservations(customer.id, ids.slice(0, 2));
    });
    await test("checking out again on the same phone releases the earlier unpaid attempt", async () => {
      // Staff paying for two shoppers on one shared phone: two accounts, one phone.
      const phone = "0722000052";
      const first = await shopper("254722000052");
      const second = await shopper("254722000052");
      const [kept, released, extra] = await garments(3);
      const earlier = await checkoutPieces(first.id, [kept, released], phone);
      const later = await checkoutPieces(second.id, [kept, extra], phone);
      const earlierOrder = await prisma.order.findUniqueOrThrow({ where: { id: earlier.orderId }, include: { sourceDraft: true } });
      assert.equal(earlierOrder.status, "CANCELLED");
      assert.equal(earlierOrder.sourceDraft?.status, "ABANDONED");
      // The piece the new attempt did not take is back on sale, as after expiry.
      assert.deepEqual(await stockOf([kept, released, extra]), ["RESERVED", "AVAILABLE", "RESERVED"]);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: later.orderId } })).status, "PENDING_PAYMENT");
      // The same account starting over is released the same way.
      const again = await checkoutPieces(second.id, [released], phone);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: later.orderId } })).status, "CANCELLED");
      assert.deepEqual(await stockOf([kept, released, extra]), ["AVAILABLE", "RESERVED", "AVAILABLE"]);
      await releaseCustomerCheckoutReservations(second.id, [released]);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: again.orderId } })).status, "CANCELLED");
    });
    await test("an earlier attempt whose M-Pesa prompt is still out is kept and can still be paid", async () => {
      const phone = "0722000053";
      const customer = await shopper("254722000053");
      const [inFlight, other] = await garments(2);
      const earlier = await checkoutPieces(customer.id, [inFlight], phone);
      const payment = await initiateMpesaPayment(earlier.orderId, customer.id, provider().client);
      // A different piece can still be checked out alongside it...
      const later = await checkoutPieces(customer.id, [other], phone);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: earlier.orderId } })).status, "PAYMENT_PROCESSING");
      assert.deepEqual(await stockOf([inFlight, other]), ["RESERVED", "RESERVED"]);
      // ...but the piece the prompt is for is not taken away from it.
      await assert.rejects(checkoutPieces(customer.id, [inFlight, other], phone), /previous payment is still being confirmed/);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: earlier.orderId } })).status, "PAYMENT_PROCESSING");
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: later.orderId } })).status, "PENDING_PAYMENT");
      // The shopper answers the prompt: the money lands on a garment.
      assert.equal((await handleMpesaCallback(callback(payment.checkoutRequestId!, { phone: 254722000053 }))).status, "SUCCESS");
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: earlier.orderId } })).status, "PAID");
      assert.deepEqual(await stockOf([inFlight]), ["PAID"]);
      await releaseCustomerCheckoutReservations(customer.id, [other]);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: later.orderId } })).status, "CANCELLED");
    });
    await test("payment initiation refuses lost inventory before sending any STK", async () => {
      const f = await fixture();
      const order = await checkout(f);
      await prisma.inventoryItem.update({ where: { productId: f.product.id }, data: { status: "PAID" } });
      const mock = provider();
      await assert.rejects(initiateMpesaPayment(order.orderId, f.customer.id, mock.client), /no longer owns/);
      assert.equal(mock.calls(), 0);
      await releaseCustomerCheckoutReservations(f.customer.id, [f.product.id]);
    });
    await test("two customers cannot reserve the same one-of-one item", concurrencyOptions, async () => {
      const a = await fixture();
      const b = await fixture(a.product.id);
      // Two phones: on one phone the later checkout replaces the earlier
      // unpaid one by design, which is not what this race is about.
      const results = await Promise.allSettled([checkout(a), checkout(b, "0799999997")]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const active = await prisma.checkoutDraft.count({ where: { customerId: { in: [a.customer.id, b.customer.id] }, status: "ACTIVE" } });
      assert.equal(active, 1);
      await releaseCustomerCheckoutReservations(a.customer.id, [a.product.id]);
      await releaseCustomerCheckoutReservations(b.customer.id, [a.product.id]);
    });
    await test("concurrent payment initiation sends exactly one STK", concurrencyOptions, async () => {
      const f = await fixture();
      const order = await checkout(f);
      const mock = provider();
      const results = await Promise.all(Array.from({ length: 4 }, () => initiateMpesaPayment(order.orderId, f.customer.id, mock.client)));
      assert.equal(new Set(results.map((r) => r.paymentId)).size, 1);
      assert.equal(mock.calls(), 1);
      assert.equal(await prisma.payment.count({ where: { orderId: order.orderId } }), 1);
      await releaseCustomerCheckoutReservations(f.customer.id, [f.product.id]);
    });
    await test("successful callback creates exactly one pick task and duplicate is harmless", async () => {
      const f = await pending();
      const payload = callback(f.payment.checkoutRequestId!);
      assert.equal((await handleMpesaCallback(payload)).status, "SUCCESS");
      assert.equal((await handleMpesaCallback(payload)).duplicate, true);
      assert.equal(await prisma.mpesaCallback.count({ where: { paymentId: f.payment.paymentId } }), 1);
      assert.equal(await prisma.orderFulfillment.count({ where: { orderId: f.order.orderId } }), 1);
      assert.equal((await prisma.inventoryItem.findUniqueOrThrow({ where: { productId: f.product.id } })).status, "PAID");
    });
    await test("simultaneous duplicate callbacks settle only once", concurrencyOptions, async () => {
      const f = await pending();
      const payload = callback(f.payment.checkoutRequestId!);
      const results = await Promise.all([handleMpesaCallback(payload), handleMpesaCallback(payload), handleMpesaCallback(payload)]);
      assert.equal(results.filter((r) => r.status === "SUCCESS").length, 1);
      assert.equal(results.filter((r) => r.duplicate).length, 2);
      assert.equal(await prisma.fulfillmentEvent.count({ where: { orderId: f.order.orderId, action: "PAYMENT_CONFIRMED_PICK_TASK_CREATED" } }), 1);
    });
    await test("late successful callback cannot claim the next buyer's reservation", async () => {
      const old = await pending();
      await expire(old.order.orderId);
      const buyer = await fixture(old.product.id);
      const next = await checkout(buyer);
      assert.equal((await handleMpesaCallback(callback(old.payment.checkoutRequestId!))).manualReview, true);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: next.orderId } })).status, "PENDING_PAYMENT");
      assert.equal((await prisma.inventoryItem.findUniqueOrThrow({ where: { productId: old.product.id } })).status, "RESERVED");
      assert.equal(await prisma.orderFulfillment.count({ where: { orderId: old.order.orderId } }), 0);
      await releaseCustomerCheckoutReservations(buyer.customer.id, [buyer.product.id]);
    });
    await test("late failed callback cannot release the next buyer's reservation", async () => {
      const old = await pending();
      await expire(old.order.orderId);
      const buyer = await fixture(old.product.id);
      await checkout(buyer);
      await handleMpesaCallback(callback(old.payment.checkoutRequestId!, { code: 1032 }));
      assert.equal((await prisma.inventoryItem.findUniqueOrThrow({ where: { productId: old.product.id } })).status, "RESERVED");
      await releaseCustomerCheckoutReservations(buyer.customer.id, [buyer.product.id]);
    });
    await test("fractional amount mismatch is retained for manual review without rounding", async () => {
      const f = await pending();
      assert.equal((await handleMpesaCallback(callback(f.payment.checkoutRequestId!, { amount: 199.9 }))).manualReview, true);
      assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.paymentId } })).status, "MANUAL_REVIEW");
      await releaseCustomerCheckoutReservations(f.customer.id, [f.product.id]);
    });
    await test("a receipt used by another payment cannot pay a second order", async () => {
      const a = await pending();
      const b = await pending();
      const receipt = `receipt-${randomUUID()}`;
      await handleMpesaCallback(callback(a.payment.checkoutRequestId!, { receipt }));
      assert.equal((await handleMpesaCallback(callback(b.payment.checkoutRequestId!, { receipt }))).manualReview, true);
      await releaseCustomerCheckoutReservations(b.customer.id, [b.product.id]);
    });
    await test("unowned inventory prevents fulfillment even with a paid callback", async () => {
      const f = await pending();
      await prisma.inventoryItem.update({ where: { productId: f.product.id }, data: { status: "AVAILABLE" } });
      assert.equal((await handleMpesaCallback(callback(f.payment.checkoutRequestId!))).manualReview, true);
      assert.equal(await prisma.orderFulfillment.count({ where: { orderId: f.order.orderId } }), 0);
      await releaseCustomerCheckoutReservations(f.customer.id, [f.product.id]);
    });
    await test("unknown STK transport outcome is not retried or marked unpaid", async () => {
      const f = await fixture();
      const order = await checkout(f);
      const mock = provider(new Error("connection reset after send"));
      await assert.rejects(initiateMpesaPayment(order.orderId, f.customer.id, mock.client), /connection reset/);
      const retried = await initiateMpesaPayment(order.orderId, f.customer.id, mock.client);
      assert.equal(retried.status, "MANUAL_REVIEW");
      assert.equal(mock.calls(), 1);
      await releaseCustomerCheckoutReservations(f.customer.id, [f.product.id]);
    });
    await test("explicit STK rejection releases its own unpaid stock", async () => {
      const f = await fixture();
      const order = await checkout(f);
      const mock = provider(new MpesaProviderError("rejected", { errorCode: "integration-reject" }));
      await assert.rejects(initiateMpesaPayment(order.orderId, f.customer.id, mock.client), /rejected/);
      assert.equal((await prisma.inventoryItem.findUniqueOrThrow({ where: { productId: f.product.id } })).status, "AVAILABLE");
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status, "CANCELLED");
    });
    await test("callback racing customer cancellation preserves one consistent outcome", concurrencyOptions, async () => {
      const f = await pending();
      await Promise.all([handleMpesaCallback(callback(f.payment.checkoutRequestId!)), releaseCustomerCheckoutReservations(f.customer.id, [f.product.id])]);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: f.order.orderId } });
      const stock = await prisma.inventoryItem.findUniqueOrThrow({ where: { productId: f.product.id } });
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.paymentId } });
      if (order.status === "PAID") {
        assert.equal(stock.status, "PAID"); assert.equal(payment.status, "SUCCESS");
      } else {
        assert.equal(order.status, "CANCELLED"); assert.equal(stock.status, "AVAILABLE"); assert.equal(payment.status, "MANUAL_REVIEW");
      }
    });
    await test("callback racing expiry never leaves paid stock available", concurrencyOptions, async () => {
      const f = await pending();
      await Promise.all([handleMpesaCallback(callback(f.payment.checkoutRequestId!)), releaseExpiredReservations(new Date(Date.now() + 16 * 60_000))]);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: f.order.orderId } });
      const stock = await prisma.inventoryItem.findUniqueOrThrow({ where: { productId: f.product.id } });
      if (order.status === "PAID") assert.equal(stock.status, "PAID");
      else { assert.equal(order.status, "EXPIRED"); assert.equal(stock.status, "AVAILABLE"); }
    });
    await test("orphan callback is retained once for manual review", async () => {
      const key = `${prefix}-orphan`;
      callbackKeys.push(key);
      const payload = callback(key);
      assert.equal((await handleMpesaCallback(payload)).manualReview, true);
      assert.equal((await handleMpesaCallback(payload)).duplicate, true);
      assert.equal(await prisma.mpesaCallback.count({ where: { providerCheckoutRequestId: key } }), 1);
    });
  } finally {
    // Delete only records created by this suite, never truncate a shared table.
    await prisma.mpesaCallback.deleteMany({ where: { providerCheckoutRequestId: { in: callbackKeys } } });
    await prisma.notification.deleteMany({ where: { order: { is: { customerId: { in: customers } } } } });
    await prisma.order.deleteMany({ where: { customerId: { in: customers } } });
    await prisma.customer.deleteMany({ where: { id: { in: customers } } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.fulfillmentNode.deleteMany({ where: { code: `${prefix}-node` } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
