import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
const root = new URL("../", import.meta.url);
const zip = new JSZip();
for (const file of ["agent.py", "erp_agent.py", "legacy_product_labels.py", "start_windows.ps1", "start_online_saler_print_agent_windows.bat", "README.md", "SOURCE.md"]) {
  const source = await readFile(new URL(`ops/local_print_agent/${file}`, root));
  const content = /\.(bat|ps1)$/.test(file) ? source.toString("utf8").replace(/\r?\n/g, "\r\n") : source;
  zip.file(`DirectLoopPrintAgent/${file}`, content, { date: new Date("2026-09-14T00:00:00Z") });
}
const output = new URL("apps/operations/public/downloads/", root);
await mkdir(output, { recursive: true });
await writeFile(new URL("direct-loop-print-agent.zip", output), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("Built Windows print agent download:", fileURLToPath(output));
