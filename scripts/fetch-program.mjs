#!/usr/bin/env node
// Reads one programme from oceantravel.bg (WooCommerce Store API) into <project>/program.json
// and downloads its photos into <project>/assets/site/.
// Usage: node fetch-program.mjs <programme URL or slug> <projectDir>
import fs from "node:fs";
import path from "node:path";
import { UA, stripHtml, writeJson, probeSize } from "./lib.mjs";

const [input, dirArg] = process.argv.slice(2);
if (!input || !dirArg) { console.error("Usage: node fetch-program.mjs <url|slug> <projectDir>"); process.exit(2); }
const dir = path.resolve(dirArg);
const slug = decodeURIComponent(input.replace(/\/+$/, "").split("/").pop());
const api = `https://oceantravel.bg/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}`;
const res = await fetch(api, { headers: UA });
if (!res.ok) { console.error(`Сайтът върна ${res.status} за ${api}`); process.exit(1); }
const list = await res.json();
const p = Array.isArray(list) ? list[0] : null;
if (!p) { console.error(`Няма програма със slug "${slug}". Провери линка.`); process.exit(1); }

const minor = p.prices?.currency_minor_unit ?? 2;
const money = (v) => (v ? Number(v) / 10 ** minor : null);
const program = {
  name: stripHtml(p.name),
  url: p.permalink,
  price: money(p.prices?.price),
  regularPrice: money(p.prices?.regular_price),
  currency: p.prices?.currency_code,
  onSale: p.on_sale,
  categories: (p.categories || []).map((c) => stripHtml(c.name)),
  shortDescription: stripHtml(p.short_description),
  description: stripHtml(p.description),
  images: [],
};
fs.mkdirSync(path.join(dir, "assets", "site"), { recursive: true });
for (const [i, img] of (p.images || []).entries()) {
  const file = `assets/site/site_${String(i + 1).padStart(2, "0")}.jpg`;
  try {
    const r = await fetch(img.src, { headers: UA });
    if (!r.ok) throw new Error(r.status);
    fs.writeFileSync(path.join(dir, file), Buffer.from(await r.arrayBuffer()));
    const { w, h } = probeSize(path.join(dir, file));
    program.images.push({ file, width: w, height: h, alt: img.alt || "", source: "oceantravel.bg" });
  } catch (e) { console.warn("! снимка", img.src, e.message); }
}
writeJson(path.join(dir, "program.json"), program);
console.log(`✓ ${program.name}\n  цена: ${program.price} ${program.currency} · снимки: ${program.images.length} · описание: ${program.description.length} знака\n  → ${path.join(dir, "program.json")}`);
