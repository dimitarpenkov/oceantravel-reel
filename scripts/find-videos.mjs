#!/usr/bin/env node
// Searches Pexels for real video clips of the places (free for commercial use), downloads previews
// into <project>/assets/candidates-video/, records author + link in videos.json, and writes a
// numbered contact sheet (videos.jpg: V1, V2… one frame from the middle of each clip).
// Usage: node find-videos.mjs <projectDir> "Lefkada" "Porto Katsiki" ... [--per 5] [--any]
//   --any also accepts landscape clips (they are cropped to 9:16 later)
import fs from "node:fs";
import path from "node:path";
import { loadEnv, ffmpeg, writeJson } from "./lib.mjs";

loadEnv();
const KEY = process.env.PEXELS_API_KEY;
if (!KEY) { console.error("PEXELS_API_KEY липсва (безплатен ключ от pexels.com/api)"); process.exit(2); }
const args = process.argv.slice(2);
const dir = path.resolve(args.shift() || ".");
let per = 5, any = false;
const queries = [];
for (let i = 0; i < args.length; i++) args[i] === "--per" ? (per = Number(args[++i])) : args[i] === "--any" ? (any = true) : queries.push(args[i]);

const outDir = path.join(dir, "assets", "candidates-video");
fs.mkdirSync(outDir, { recursive: true });
const indexFile = path.join(dir, "videos.json");
const all = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : [];

for (const q of queries) {
  const u = new URL("https://api.pexels.com/v1/videos/search");
  u.searchParams.set("query", q); u.searchParams.set("per_page", "20"); u.searchParams.set("size", "medium");
  if (!any) u.searchParams.set("orientation", "portrait");
  const r = await fetch(u, { headers: { Authorization: KEY } });
  if (!r.ok) { console.error(`Pexels ${r.status} за "${q}"`); continue; }
  const j = await r.json();
  let got = 0;
  for (const v of j.videos || []) {
    if (got >= per) break;
    if (all.some((c) => c.id === v.id)) continue;
    if (v.duration < 4) continue;
    // smallest file that is still at least 1080 on its short side (fast download, sharp enough)
    const files = (v.video_files || []).filter((f) => f.file_type === "video/mp4" && Math.min(f.width, f.height) >= 1080).sort((a, b) => a.width * a.height - b.width * b.height);
    const f = files[0];
    if (!f) continue;
    const n = all.length + 1;
    const file = `assets/candidates-video/v${String(n).padStart(3, "0")}.mp4`;
    const dl = await fetch(f.link);
    if (!dl.ok) continue;
    fs.writeFileSync(path.join(dir, file), Buffer.from(await dl.arrayBuffer()));
    all.push({ n, query: q, id: v.id, file, width: f.width, height: f.height, duration: v.duration, author: v.user?.name, page: v.url, source: "Pexels" });
    got++;
  }
  console.log(`${q}: ${got} клипа`);
}
writeJson(indexFile, all);

const tmp = path.join(dir, ".sheet-v");
fs.mkdirSync(tmp, { recursive: true });
const font = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf", "C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => fs.existsSync(f));
all.forEach((c, i) => {
  const label = font ? `,drawtext=fontfile='${font.replace(/:/g, "\\:")}':text='V${c.n} ${Math.round(c.duration)}s':x=10:y=10:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=8` : "";
  ffmpeg(["-ss", String(c.duration / 2), "-i", path.join(dir, c.file), "-frames:v", "1", "-vf", `scale=270:480:force_original_aspect_ratio=increase,crop=270:480${label}`, path.join(tmp, `t${String(i).padStart(3, "0")}.png`)]);
});
if (all.length) {
  ffmpeg(["-i", path.join(tmp, "t%03d.png"), "-vf", `tile=6x${Math.ceil(all.length / 6)}:padding=4:color=white`, "-frames:v", "1", path.join(dir, "videos.jpg")]);
  console.log(`→ ${path.join(dir, "videos.jpg")} (${all.length} клипа, V = Pexels)`);
}
