import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seedSource = await readFile(
  new URL("../packages/database/prisma/seed-staging-test-employee.mjs", import.meta.url),
  "utf8"
);

function upsertBlock(model, binding) {
  const pattern = new RegExp(
    `const ${binding} = await prisma\\.${model}\\.upsert\\(\\{([\\s\\S]*?)\\n  \\}\\);`
  );
  const match = seedSource.match(pattern);
  assert.ok(match, `${model} staging upsert should exist`);
  return match[1];
}

test("keeps Affiliate slug data out of the Employee staging seed", () => {
  const employeeUpsert = upsertBlock("employee", "employee");
  assert.doesNotMatch(employeeUpsert, /\bslug\s*:/);
});

test("sets the stable Affiliate slug on staging create and update", () => {
  const affiliateUpsert = upsertBlock("affiliate", "affiliate");
  assert.match(affiliateUpsert, /update:\s*\{[\s\S]*?slug:\s*"staging-affiliate"/);
  assert.match(affiliateUpsert, /create:\s*\{[\s\S]*?slug:\s*"staging-affiliate"/);
});
