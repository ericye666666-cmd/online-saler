import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_CODE_LENGTH,
  CUSTOMER_CODE_MAX_ATTEMPTS,
  customerCodeMatches,
  generateCustomerCode,
  hashCustomerCode,
  isWellFormedCustomerCode,
  normalizeCustomerCode,
  verifyCustomerCode
} from "./customer-code";

function state(overrides: Partial<Parameters<typeof verifyCustomerCode>[0]> = {}) {
  return {
    codeHash: hashCustomerCode("5832"),
    failedAttempts: 0,
    lockedAt: null,
    verifiedAt: null,
    ...overrides
  };
}

test("a generated code is always four digits, leading zeros kept", () => {
  for (let i = 0; i < 400; i += 1) {
    const code = generateCustomerCode();
    assert.equal(code.length, CUSTOMER_CODE_LENGTH);
    assert.match(code, /^\d{4}$/);
  }
});

test("the stored hash never contains the code", () => {
  const hash = hashCustomerCode("5832");
  assert.ok(!hash.includes("5832"));
  assert.match(hash, /^pbkdf2_sha256\$120000\$[0-9a-f]+\$[0-9a-f]+$/);
});

test("the same code hashed twice gives different hashes but both verify", () => {
  const first = hashCustomerCode("5832");
  const second = hashCustomerCode("5832");
  assert.notEqual(first, second);
  assert.ok(customerCodeMatches("5832", first));
  assert.ok(customerCodeMatches("5832", second));
});

test("a wrong code never matches", () => {
  const hash = hashCustomerCode("5832");
  assert.ok(!customerCodeMatches("5833", hash));
  assert.ok(!customerCodeMatches("", hash));
  assert.ok(!customerCodeMatches("5832", null));
  assert.ok(!customerCodeMatches("5832", "not-a-hash"));
});

test("spaces and dashes a rider types are ignored", () => {
  assert.equal(normalizeCustomerCode("58 32"), "5832");
  assert.equal(normalizeCustomerCode("5-8-3-2"), "5832");
  assert.ok(customerCodeMatches("58 32", hashCustomerCode("5832")));
});

test("only four digits are well formed", () => {
  assert.ok(isWellFormedCustomerCode("5832"));
  assert.ok(!isWellFormedCustomerCode("583"));
  assert.ok(!isWellFormedCustomerCode("58321"));
  assert.ok(!isWellFormedCustomerCode("abcd"));
  assert.ok(!isWellFormedCustomerCode(null));
});

test("the right code verifies", () => {
  assert.deepEqual(verifyCustomerCode(state(), "5832"), { outcome: "VERIFIED" });
});

test("a wrong code counts down and locks on the last attempt", () => {
  const result = verifyCustomerCode(state({ failedAttempts: 0 }), "1111");
  assert.equal(result.outcome, "WRONG_CODE");
  assert.deepEqual(result, { outcome: "WRONG_CODE", attemptsRemaining: 4, nowLocked: false });

  const last = verifyCustomerCode(state({ failedAttempts: CUSTOMER_CODE_MAX_ATTEMPTS - 1 }), "1111");
  assert.deepEqual(last, { outcome: "WRONG_CODE", attemptsRemaining: 0, nowLocked: true });
});

test("a locked order refuses even the right code", () => {
  assert.deepEqual(verifyCustomerCode(state({ lockedAt: new Date() }), "5832"), { outcome: "LOCKED" });
  assert.deepEqual(
    verifyCustomerCode(state({ failedAttempts: CUSTOMER_CODE_MAX_ATTEMPTS }), "5832"),
    { outcome: "LOCKED" }
  );
});

test("a code is one-time: a second correct submission is refused", () => {
  assert.deepEqual(verifyCustomerCode(state({ verifiedAt: new Date() }), "5832"), { outcome: "ALREADY_USED" });
});

test("an order with no code issued cannot be completed", () => {
  assert.deepEqual(verifyCustomerCode(state({ codeHash: null }), "5832"), { outcome: "NO_CODE" });
});

test("a malformed submission is rejected before it burns an attempt", () => {
  assert.deepEqual(verifyCustomerCode(state(), "58"), { outcome: "MALFORMED" });
  assert.deepEqual(verifyCustomerCode(state(), ""), { outcome: "MALFORMED" });
});

test("the already-used check runs before the lock check, so a completed order reads as used", () => {
  assert.deepEqual(
    verifyCustomerCode(state({ verifiedAt: new Date(), lockedAt: new Date() }), "5832"),
    { outcome: "ALREADY_USED" }
  );
});
