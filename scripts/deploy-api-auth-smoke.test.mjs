import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/deploy-api-staging.yml", import.meta.url), "utf8");
const steps = workflow.split(/^      - name: /m).slice(1);
const namedStep = (name) => {
  const step = steps.find((entry) => entry.startsWith(`${name}\n`));
  assert.ok(step, `workflow step is present: ${name}`);
  return step;
};

test("deployment smoke shares one staff login and uses Bearer tokens for every protected curl", () => {
  assert.match(namedStep("Authenticate deployment smoke checks"), /verify-staging-image-processing\.mjs --authenticate/);
  assert.equal((workflow.match(/STAGING_ADMIN_PASSWORD:/g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /ADMIN_RESPONSE|ADMIN_USER_ID|X-Admin-User-Id|X-Employee-Id|[?&]adminUserId=/);
  for (const name of ["Verify product creation", "Verify real image upload and retrieval", "Verify Operations workspace API", "Verify product control API", "Verify OpenAI image recognition"]) {
    const step = namedStep(name);
    const calls = [...step.matchAll(/curl\b[\s\S]*?(?=\n\n|$)/g)].map(([call]) => call);
    const protectedCalls = calls.filter((call) => /"\$\{SERVICE_URL\}\/(?:products"|products\/[^\n]+\/images\/upload|operations\/|ai-jobs)/.test(call));
    assert.ok(protectedCalls.length, `${name} has protected checks`);
    for (const call of protectedCalls) {
      assert.match(call, /--header "Authorization: Bearer \$\{STAGING_SMOKE_ACCESS_TOKEN\}"/, name);
    }
  }
  assert.match(namedStep("Verify OpenAI image recognition"), /\/ai-jobs\/\$\{AI_JOB_ID\}/);
});

test("public catalog and original media smoke checks do not depend on staff authentication", () => {
  assert.doesNotMatch(namedStep("Verify public storefront products API"), /Authorization|STAGING_SMOKE_ACCESS_TOKEN/);
  const imageStep = namedStep("Verify real image upload and retrieval");
  const download = imageStep.match(/curl --fail --silent --show-error \\\n[\s\S]*?--output \/tmp\/product-test-downloaded\.png/)?.[0];
  assert.ok(download);
  assert.doesNotMatch(download, /Authorization|STAGING_SMOKE_ACCESS_TOKEN/);
});

test("live OpenAI smoke remains explicitly opt-in and smoke shell blocks remain valid", () => {
  assert.match(namedStep("Verify OpenAI image recognition"), /if: github\.event_name == 'workflow_dispatch' && inputs\.run_live_openai_smoke/);
  for (const step of steps.filter((entry) => /^(Authenticate deployment smoke checks|Verify )/.test(entry))) {
    const block = step.match(/        run: \|\n((?:          .*\n|\n)*)/)?.[1];
    if (!block) continue;
    const script = block.split("\n").map((line) => line.slice(10)).join("\n");
    const result = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
    assert.equal(result.status, 0, `${step.split("\n")[0]}: ${result.stderr}`);
  }
});
