import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { storeConsoleNodes } from "./store-console-nodes";

const WAREHOUSE = { id: "kikuyu", name: "Kikuyu Warehouse", type: "WAREHOUSE" as const };
const KINOO = { id: "kinoo", name: "Kinoo", type: "STORE" as const };
const THOGOTO = { id: "thogoto", name: "Thogoto", type: "STORE" as const };
const ALL = [WAREHOUSE, THOGOTO, KINOO];

// A Kinoo account is locked to Kinoo: one option, no picker.
assert.deepEqual(storeConsoleNodes(ALL, "kinoo"), { options: [KINOO], locked: KINOO });
assert.deepEqual(storeConsoleNodes([KINOO], "kinoo"), { options: [KINOO], locked: KINOO });

// No home store: every store, and the warehouse only where asked for.
assert.deepEqual(storeConsoleNodes(ALL, null), { options: [THOGOTO, KINOO], locked: null });
assert.deepEqual(storeConsoleNodes(ALL, null, { includeWarehouse: true }), { options: ALL, locked: null });

// A home node that is the warehouse is head office, not a store: not locked.
assert.deepEqual(storeConsoleNodes(ALL, "kikuyu"), { options: [THOGOTO, KINOO], locked: null });

// Both store screens use it, so neither can grow its own dropdown back.
for (const file of ["./store-console.tsx", "../orders/node/node-client.tsx"]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.match(source, /storeConsoleNodes\(/, `${file} must decide its picker with storeConsoleNodes`);
  assert.match(source, /lockedNode \?/, `${file} must hide the picker for a store account`);
}

console.log("store console node tests passed");
