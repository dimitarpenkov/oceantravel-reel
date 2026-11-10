#!/usr/bin/env node
// Copies chosen photos into <project>/assets/photos/ cropped to 9:16 at 1350x2400 (room for
// Ken Burns zoom without blur). Photos smaller than ~1000px on the short side, or landscape
// photos you want shown whole, should use "fit": "card" in spec.json instead.
// Usage: node prep-photos.mjs <projectDir> S1 12 7 ...   (labels from candidates.jpg)
//        node prep-photos.mjs <projectDir> path/to/own-photo.jpg
// Optional focus: 12@left | 12@right | 12@top | 12@bottom (where to crop)
import fs from "node:fs";
import path from "node:path";
import { ffmpeg, probeSize, writeJson } from "./lib.mjs";

const [dirArg, ...picks] = process.argv.slice(2);
const dir = path.resolve(dirArg || ".");
const read = (f) => (fs.existsSync(path.join(dir, f)) ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : null);
const cands = read("candidates.json") || [];
const prog = read("program.json");
const credits = read("assets/photos/credits.json") || [];
fs.mkdirSync(path.join(dir, "assets", "photos"), { recursive: true });

for (const pick of picks) {
  const [id, focus = "center"] = pick.split("@");
  let src, credit;
  if (/^S\d+$/i.test(id)) { const im = prog?.images[Number(id.slice(1)) - 1]; src = im && path.join(dir, im.file); credit = { source: "oceantravel.bg" }; }
  else if (/^\d+$/.test(id)) { const c = cands.find((c) => c.n === Number(id)); src = c && path.join(dir, c.file); credit = c && { source: "Wikimedia Commons", title: c.title, author: c.author, license: c.license, page: c.page }; }
  else { src = path.resolve(id); credit = { source: "собствена снимка" }; }
  if (!src || !fs.existsSync(src)) { console.error(`! няма такава снимка: ${pick}`); continue; }
  const name = (/^\d+$/.test(id) ? `c${id}` : path.basename(id, path.extname(id))).replace(/[^\w-]/g, "_");
  const out = `assets/photos/${name}.jpg`;
  const { w, h } = probeSize(src);
  const x = { left: "0", right: "iw-1350", center: "(iw-1350)/2", top: "(iw-1350)/2", bottom: "(iw-1350)/2" }[focus];
  const y = { top: "0", bottom: "ih-2400", left: "(ih-2400)/2", right: "(ih-2400)/2", center: "(ih-2400)/2" }[focus];
  ffmpeg(["-i", src, "-vf", `scale=1350:2400:force_original_aspect_ratio=increase:flags=lanczos,crop=1350:2400:${x}:${y}`, "-q:v", "3", path.join(dir, out)]);
  const soft = Math.min(w, h) < 1100 || (w > h && h < 1500);
  credits.push({ file: out, ...credit });
  console.log(`${pick} → ${out}${soft ? `  (малка снимка ${w}x${h}: ползвай "fit": "card" и "src": "${path.relative(dir, src)}")` : ""}`);
}
writeJson(path.join(dir, "assets", "photos", "credits.json"), credits);
