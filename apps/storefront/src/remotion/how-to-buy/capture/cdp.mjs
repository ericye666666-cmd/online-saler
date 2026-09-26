// Minimal CDP driver: headless Chrome, phone viewport, fresh profile.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function launch(outDir) {
  const port = 9333 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "howto-chrome-"));
  const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--hide-scrollbars", "--lang=en-KE", "about:blank"
  ], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); }
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const evalJs = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const steps = [];
  const api = {
    send, evalJs, steps,
    async goto(url) { await send("Page.navigate", { url }); await sleep(1500); await api.settle(); },
    async settle(ms = 8000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const ok = await evalJs(`document.readyState==="complete" && [...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).every(i=>i.complete)`).catch(() => false);
        if (ok) break; await sleep(300);
      }
      await sleep(600);
    },
    // rect of first visible element matching selector + optional text
    async rect(selector, text) {
      return evalJs(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});
        const el=${text ? `els.find(e=>e.innerText&&e.innerText.trim().toLowerCase().includes(${JSON.stringify(String(text).toLowerCase())}))` : "els[0]"};
        if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,text:(el.innerText||el.value||"").trim().slice(0,80)};})()`);
    },
    async scrollTo(selector, text, offset = 200) {
      await evalJs(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(selector)})];const el=${text ? `els.find(e=>e.innerText&&e.innerText.trim().toLowerCase().includes(${JSON.stringify(String(text).toLowerCase())}))` : "els[0]"};if(el){const r=el.getBoundingClientRect();scrollBy(0,r.top-${offset});}})()`);
      await sleep(700); await api.settle(3000);
    },
    async tap(r) {
      const x = r.x + r.w / 2, y = r.y + r.h / 2;
      for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      await sleep(1200); await api.settle();
    },
    async shot(name, meta = {}) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(outDir, name + ".png"), Buffer.from(r.data, "base64"));
      steps.push({ name, url: await evalJs("location.pathname+location.search"), ...meta });
    },
    async type(text) { for (const ch of text) { await send("Input.insertText", { text: ch }); await sleep(40); } },
    close() { ws.close(); chrome.kill(); }
  };
  return api;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
