import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./src/product/measurement-guide-assets", import.meta.url));
const target = fileURLToPath(new URL("./dist/product/measurement-guide-assets", import.meta.url));

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });

console.log("Measurement guide assets copied to API dist.");
