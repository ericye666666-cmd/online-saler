import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";

const root = new URL("../", import.meta.url);
const sourceFiles = ["agent.py", "erp_agent.py", "legacy_product_labels.py", "start_online_saler_print_agent_windows.bat", "README.md", "SOURCE.md"];
const macosSourceFiles = ["agent.py", "erp_agent.py", "legacy_product_labels.py", "start_online_saler_print_agent_macos.command", "README.md", "SOURCE.md"];
const zipName = "direct-loop-print-agent.zip";
const macosZipName = "direct-loop-print-agent-macos.zip";

// One NUL byte between every field, the same framing build_windows_bundle.py uses.
const SEPARATOR = Buffer.alloc(1);

async function sourceDigest(projectRoot, names) {
  const sources = await Promise.all(names.map(file => readFile(new URL(`ops/local_print_agent/${file}`, projectRoot))));
  const hash = createHash("sha256");
  names.forEach((file, index) => hash.update(file).update(SEPARATOR).update(sources[index]).update(SEPARATOR));
  return hash.digest("hex");
}

async function readRelease(output, zip, json) {
  const [bytes, rawManifest] = await Promise.all([readFile(new URL(zip, output)), readFile(new URL(json, output), "utf8")]);
  const manifest = JSON.parse(rawManifest);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (manifest.filename !== zip || manifest.bytes !== bytes.length || manifest.sha256 !== sha256) {
    throw new Error("Print-agent ZIP does not match its release manifest.");
  }
  return { bytes, manifest };
}

/**
 * The Mac download is source rather than a signed binary, so the thing worth
 * checking is that it is the source this revision would run — and that the
 * launcher still unzips executable. A launcher that lands without its mode bit
 * opens in TextEdit when double-clicked, which reads as a broken download to
 * whoever is standing next to the printer.
 */
export async function verifyMacosPrintAgentBundle(projectRoot = root) {
  const output = new URL("apps/operations/public/downloads/", projectRoot);
  const { bytes, manifest } = await readRelease(output, macosZipName, "direct-loop-print-agent-macos.json");
  if (manifest.sourceSha256 !== await sourceDigest(projectRoot, macosSourceFiles)) {
    throw new Error("macOS print-agent ZIP is stale: rebuild it from this source revision.");
  }
  const agentSource = await readFile(new URL("ops/local_print_agent/agent.py", projectRoot), "utf8");
  if (manifest.version !== agentSource.match(/^APP_VERSION = "([^"]+)"/m)?.[1]) {
    throw new Error("macOS print-agent version does not match its source.");
  }
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const prefix = "DirectLoopPrintAgent/";
  for (const file of [...macosSourceFiles, "version.json"]) {
    if (!zip.file(prefix + file)) throw new Error(`macOS print-agent bundle is missing ${file}.`);
  }
  const launcherName = prefix + "start_online_saler_print_agent_macos.command";
  if (!((zip.file(launcherName).unixPermissions ?? 0) & 0o100)) {
    throw new Error("The macOS launcher would unzip without its executable bit.");
  }
  const launcher = await zip.file(launcherName).async("string");
  if (!launcher.startsWith("#!/bin/sh") || launcher.includes(String.fromCharCode(13))) {
    throw new Error("The macOS launcher needs a shell shebang and Unix line endings.");
  }
  const version = JSON.parse(await zip.file(prefix + "version.json").async("string"));
  if (version.version !== manifest.version || version.sourceSha256 !== manifest.sourceSha256 || !version.capabilities?.includes("online_saler_raster_v1")) {
    throw new Error("The macOS bundle version or product-label capability is incorrect.");
  }
  return manifest;
}

export async function verifyPrintAgentBundle(projectRoot = root) {
  const output = new URL("apps/operations/public/downloads/", projectRoot);
  const [bytes, rawManifest] = await Promise.all([
    readFile(new URL(zipName, output)),
    readFile(new URL("direct-loop-print-agent.json", output), "utf8")
  ]);
  const manifest = JSON.parse(rawManifest);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (manifest.filename !== zipName || manifest.bytes !== bytes.length || manifest.sha256 !== sha256) {
    throw new Error("Print-agent ZIP does not match its release manifest.");
  }
  const sources = await Promise.all(sourceFiles.map(file => readFile(new URL(`ops/local_print_agent/${file}`, projectRoot))));
  const hash = createHash("sha256");
  sourceFiles.forEach((file, index) => hash.update(file).update("\0").update(sources[index]).update("\0"));
  if (manifest.sourceSha256 !== hash.digest("hex")) throw new Error("Print-agent ZIP is stale: rebuild it from this source revision on Windows.");
  const sourceVersion = sources[0].toString("utf8").match(/^APP_VERSION = "([^"]+)"/m)?.[1];
  if (!sourceVersion || manifest.version !== sourceVersion) throw new Error("Print-agent version does not match its source.");

  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const prefix = "DirectLoopPrintAgent/";
  for (const file of ["DirectLoopPrintAgent.exe", "start_online_saler_print_agent_windows.bat", "README.md", "SOURCE.md", "version.json"]) {
    if (!zip.file(prefix + file)) throw new Error(`Windows print-agent bundle is missing ${file}.`);
  }
  if (Object.keys(zip.files).some(name => /\.(?:py|ps1)$/i.test(name))) throw new Error("The customer download must contain the ready EXE, not Python source or an installer script.");
  const exe = await zip.file(prefix + "DirectLoopPrintAgent.exe").async("nodebuffer");
  const peOffset = exe.length >= 64 ? exe.readUInt32LE(0x3c) : 0;
  if (exe.subarray(0, 2).toString() !== "MZ" || peOffset < 64 || peOffset + 6 > exe.length || exe.subarray(peOffset, peOffset + 4).toString() !== "PE\0\0" || exe.readUInt16LE(peOffset + 4) !== 0x8664) {
    throw new Error("Print-agent download does not contain a Windows x64 executable.");
  }
  const version = JSON.parse(await zip.file(prefix + "version.json").async("string"));
  if (version.version !== manifest.version || version.sourceSha256 !== manifest.sourceSha256 || !version.capabilities?.includes("online_saler_raster_v1")) {
    throw new Error("The executable bundle version or product-label capability is incorrect.");
  }
  return manifest;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const manifest = await verifyPrintAgentBundle();
    console.log(`Verified Windows print agent v${manifest.version}: ${manifest.bytes} bytes, SHA-256 ${manifest.sha256}`);
    const macos = await verifyMacosPrintAgentBundle();
    console.log(`Verified macOS print agent v${macos.version}: ${macos.bytes} bytes, SHA-256 ${macos.sha256}`);
  } catch (error) {
    if (error.code === "ENOENT" && process.argv.includes("--allow-missing")) {
      console.warn("Local preview has no print-agent bundles. Download the matching CI artifact to apps/operations/public/downloads to test downloads.");
    } else {
      console.error(`Cannot publish the print-agent download: ${error.message}`);
      console.error(`Build the bundles first; the Windows download must stay an EXE, not a source ZIP. Project: ${fileURLToPath(root)}`);
      process.exitCode = 1;
    }
  }
}
