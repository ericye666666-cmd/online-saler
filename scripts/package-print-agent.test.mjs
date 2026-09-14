import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { verifyPrintAgentBundle } from "./package-print-agent.mjs";

async function fixture(t, { sourceOnly = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "print-agent-release-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = pathToFileURL(dir + "/");
  const source = new URL("ops/local_print_agent/", root);
  const output = new URL("apps/operations/public/downloads/", root);
  await Promise.all([mkdir(source, { recursive: true }), mkdir(output, { recursive: true })]);
  const hash = createHash("sha256");
  for (const name of ["agent.py", "erp_agent.py", "legacy_product_labels.py", "start_online_saler_print_agent_windows.bat", "README.md", "SOURCE.md"]) {
    const data = await readFile(new URL(`../ops/local_print_agent/${name}`, import.meta.url));
    await writeFile(new URL(name, source), data);
    hash.update(name).update("\0").update(data).update("\0");
  }
  const version = (await readFile(new URL("agent.py", source), "utf8")).match(/^APP_VERSION = "([^"]+)"/m)[1];
  const sourceSha256 = hash.digest("hex");
  const zip = new JSZip();
  // Structural PE fixture only; execution is checked separately by the Windows CI job.
  const exe = Buffer.alloc(256);
  exe.write("MZ"); exe.writeUInt32LE(128, 0x3c); exe.write("PE\0\0", 128); exe.writeUInt16LE(0x8664, 132);
  zip.file(`DirectLoopPrintAgent/${sourceOnly ? "agent.py" : "DirectLoopPrintAgent.exe"}`, sourceOnly ? "print('source only')" : exe);
  for (const name of ["start_online_saler_print_agent_windows.bat", "README.md", "SOURCE.md"]) zip.file(`DirectLoopPrintAgent/${name}`, await readFile(new URL(name, source)));
  zip.file("DirectLoopPrintAgent/version.json", JSON.stringify({ version, sourceSha256, capabilities: ["online_saler_raster_v1"] }));
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  const manifest = { version, sourceSha256, filename: "direct-loop-print-agent.zip", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  await writeFile(new URL(manifest.filename, output), bytes);
  await writeFile(new URL("direct-loop-print-agent.json", output), JSON.stringify(manifest));
  return { root, source, output, manifest };
}

test("verifies a Windows bundle and rejects a changed ZIP", async t => {
  const f = await fixture(t);
  assert.deepEqual(await verifyPrintAgentBundle(f.root), f.manifest);
  await writeFile(new URL(f.manifest.filename, f.output), "corrupt download");
  await assert.rejects(verifyPrintAgentBundle(f.root), /does not match its release manifest/);
});

test("rejects source-only downloads even with a matching checksum", async t => {
  const f = await fixture(t, { sourceOnly: true });
  await assert.rejects(verifyPrintAgentBundle(f.root), /missing DirectLoopPrintAgent.exe/);
});

test("rejects a stale bundle when its source changes", async t => {
  const f = await fixture(t);
  await writeFile(new URL("agent.py", f.source), 'APP_VERSION = "99.0.0"\n');
  await assert.rejects(verifyPrintAgentBundle(f.root), /ZIP is stale/);
});
