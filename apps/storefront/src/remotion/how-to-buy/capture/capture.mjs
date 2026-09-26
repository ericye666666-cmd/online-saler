// Captures the buying flow on dloop.co.ke. Never taps the final Pay button.
import { launch } from "./cdp.mjs";
import { writeFileSync } from "node:fs";
const out = process.argv[2];
const b = await launch(out);
const dump = async (tag) => console.log(tag, await b.evalJs(`location.pathname+' :: '+JSON.stringify([...document.querySelectorAll('button,a,input,select,label,[role=radio]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0}).map(e=>e.tagName[0]+':'+(e.innerText||e.placeholder||e.name||e.type||'').replace(/\s+/g,' ').slice(0,50)+'@'+Math.round(e.getBoundingClientRect().y)).slice(0,60))`));
async function step(name, target, { tap = true } = {}) {
  const r = await target;
  if (!r) { await dump("MISSING " + name); throw new Error("no target for " + name); }
  await b.shot(name, { tap: r });
  if (tap) await b.tap(r);
}
// PREVIEW_DELIVERY_FEE=200 relabels the courier fee on screen only, for filming
// before a new fee reaches the live shop. Nothing is sent to the server.
async function relabelFee() {
  const fee = process.env.PREVIEW_DELIVERY_FEE;
  if (!fee) return;
  const changed = await b.evalJs(`(()=>{let c=0;for(const el of document.querySelectorAll('label *')){
    if(/^\\s*KSh\\s*\\d+\\s*$/i.test(el.textContent)&&![...el.children].some(ch=>/KSh/i.test(ch.textContent))){el.textContent='KSh ${fee}';c++;}}return c;})()`);
  console.log("relabelled fee labels:", changed);
}
try {
  // START_URL starts on a category page (e.g. men's jackets) instead of the home page.
  if (process.env.START_URL) {
    await b.goto(process.env.START_URL);
  } else {
    await b.goto("https://dloop.co.ke/");
    await step("01-home", b.rect("a", "Clothing"));
  }
  await step("02-category", b.rect("a[href^='/p/']"));
  await step("03-product", b.rect("button", "Add to bag"));
  await step("04-added", b.rect("a", "View bag"));
  await step("05-bag", b.rect("a,button", "Next"));
  await step("06-checkout", b.rect("button", "M-Pesa phone"));
  await step("07-phone", b.rect("input"));
  await b.type("0712345678");
  await step("08-phone-typed", b.rect("button", "Save and continue"));
  await step("09-checkout-phone", b.rect("button", "Pickup"));
  await relabelFee();
  await step("10-pickup", b.rect("select"), { tap: false });
  await b.evalJs(`(()=>{const s=document.querySelector('select');const o=[...s.options].find(o=>o.text.includes('Kikuyu Warehouse'));
    const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await b.settle(1500);
  await relabelFee();
  await step("11-pickup-chosen", b.rect("button", "Save and continue"));
  await b.evalJs("scrollTo(0,0)"); await b.settle(1000);
  await dump("FINAL");
  const pay = await b.rect("button", "with M-Pesa");
  await step("12-ready-to-pay", pay, { tap: false }); // NEVER tap: this reserves the piece and sends a real M-Pesa prompt
} finally { writeFileSync(out + "/steps.json", JSON.stringify(b.steps, null, 2)); b.close(); }
