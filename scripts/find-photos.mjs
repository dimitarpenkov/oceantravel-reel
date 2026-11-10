#!/usr/bin/env node
// Searches Wikimedia Commons for freely licensed photos of places, downloads candidates into
// <project>/assets/candidates/, records author + license in candidates.json, and writes a
// numbered contact sheet (candidates.jpg) to look at before choosing.
// Usage: node find-photos.mjs <projectDir> "Porto Katsiki" "Fiskardo" ... [--per 6]
import fs from "node:fs";
import path from "node:path";
import { UA, sleep, writeJson, ffmpeg, probeSize } from "./lib.mjs";

const args = process.argv.slice(2);
const dir = path.resolve(args.shift() || ".");
let per = 6;
const queries = [];
for (let i = 0; i < args.length; i++) args[i] === "--per" ? (per = Number(args[++i])) : queries.push(args[i]);
if (!queries.length) { console.error('Usage: node find-photos.mjs <projectDir> "place 1" "place 2" [--per 6]'); process.exit(2); }

// Licences that allow commercial reuse. CC BY / CC BY-SA need the author credited in the post.
const OK = /^(cc0|public domain|pd|cc by(-sa)? [1-4]\.0|cc by(-sa)? 2\.5|cc by(-sa)? 2\.0)/i;
const outDir = path.join(dir, "assets", "candidates");
fs.mkdirSync(outDir, { recursive: true });
const indexFile = path.join(dir, "candidates.json");
const all = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : [];
const strip = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function commons(params) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({ action: "query", format: "json", ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let a = 0; a < 4; a++) {
    try { const r = await fetch(u, { headers: UA }); if (r.ok) return JSON.parse((await r.text()).replace(/[\u0000-\u001f]/g, " ")); } catch {}
    await sleep(1500 * (a + 1));
  }
  throw new Error("Wikimedia не отговаря");
}

for (const q of queries) {
  const j = await commons({ generator: "search", gsrsearch: `${q} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "20", prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlheight: "1920" });
  const pages = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
  let got = 0;
  for (const p of pages) {
    if (got >= per) break;
    const ii = p.imageinfo?.[0]; const m = ii?.extmetadata || {};
    const lic = strip(m.LicenseShortName?.value);
    if (!ii || !OK.test(lic)) continue;
    if (Math.min(ii.width, ii.height) < 1000) continue; // too small for a phone screen
    if (/map|chart|logo|flag|coat of arms|diagram|plan/i.test(p.title)) continue;
    if (all.some((c) => c.title === p.title)) continue;
    const n = all.length + 1;
    const file = `assets/candidates/c${String(n).padStart(3, "0")}.jpg`;
    const r = await fetch(ii.thumburl || ii.url, { headers: UA });
    if (!r.ok) { await sleep(1500); continue; }
    fs.writeFileSync(path.join(dir, file), Buffer.from(await r.arrayBuffer()));
    all.push({ n, query: q, file, title: p.title, license: lic, author: strip(m.Artist?.value), page: ii.descriptionurl, width: ii.width, height: ii.height });
    got++;
    await sleep(700);
  }
  console.log(`${q}: ${got} снимки`);
}
writeJson(indexFile, all);

// contact sheet of every candidate (site photos first), 9:16 crops, 6 per row, numbered left→right
const items = [];
const prog = path.join(dir, "program.json");
if (fs.existsSync(prog)) JSON.parse(fs.readFileSync(prog, "utf8")).images.forEach((im, i) => items.push({ label: `S${i + 1}`, file: im.file }));
all.forEach((c) => items.push({ label: String(c.n), file: c.file }));
const tmp = path.join(dir, ".sheet");
fs.mkdirSync(tmp, { recursive: true });
const font = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf", "C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => fs.existsSync(f));
items.forEach((it, i) => {
  const label = font ? `,drawtext=fontfile='${font.replace(/:/g, "\\:")}':text='${it.label}':x=10:y=10:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=8` : "";
  ffmpeg(["-i", path.join(dir, it.file), "-vf", `scale=270:480:force_original_aspect_ratio=increase,crop=270:480${label}`, path.join(tmp, `t${String(i).padStart(3, "0")}.png`)]);
});
const cols = 6, rows = Math.ceil(items.length / cols);
ffmpeg(["-i", path.join(tmp, "t%03d.png"), "-vf", `tile=${cols}x${rows}:padding=4:color=white`, "-frames:v", "1", path.join(dir, "candidates.jpg")]);
console.log(`→ ${path.join(dir, "candidates.jpg")} (${items.length} кадъра: S = от сайта, числа = Wikimedia; ред по ред отляво надясно)`);
