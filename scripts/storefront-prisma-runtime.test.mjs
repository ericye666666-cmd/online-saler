import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../Dockerfile.storefront", import.meta.url), "utf8");

test("Storefront image installs OpenSSL before generating Prisma Client", () => {
  const dependenciesStage = dockerfile.slice(
    dockerfile.indexOf("AS dependencies"),
    dockerfile.indexOf("FROM dependencies AS builder"),
  );
  assert.match(dependenciesStage, /apt-get install[^\n]*openssl/);

  const runnerStage = dockerfile.slice(dockerfile.indexOf("AS runner"));
  assert.match(runnerStage, /apt-get install[^\n]*openssl/);
});
