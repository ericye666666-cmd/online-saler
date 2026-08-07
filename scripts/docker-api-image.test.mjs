import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dockerfile = readFileSync(new URL("../Dockerfile.api", import.meta.url), "utf8");
const runtimeStart = dockerfile.indexOf("FROM node:20-slim AS runtime");

assert.notEqual(runtimeStart, -1, "API Dockerfile must retain separate build and runtime stages");

const buildStage = dockerfile.slice(0, runtimeStart);
const runtimeStage = dockerfile.slice(runtimeStart);

assert.match(buildStage, /apt-get install[^\n]*openssl/);
assert.match(runtimeStage, /apt-get install[^\n]*openssl/);
assert.match(runtimeStage, /COPY --from=build \/app\/scripts\/deploy-staging-migrations\.mjs/);
assert.match(runtimeStage, /RUN test -f \/app\/scripts\/deploy-staging-migrations\.mjs/);
assert.match(runtimeStage, /COPY --from=build \/app\/scripts\/cleanup-staging-test-data\.mjs/);
assert.match(runtimeStage, /COPY --from=build \/app\/scripts\/staging-test-data-cleanup-lib\.mjs/);
assert.match(runtimeStage, /test -f \/app\/scripts\/cleanup-staging-test-data\.mjs/);
assert.match(runtimeStage, /test -f \/app\/scripts\/staging-test-data-cleanup-lib\.mjs/);

console.log("API Docker image runtime checks passed");
