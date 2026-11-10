#!/usr/bin/env node
// Prepares chosen Pexels clips (labels from videos.jpg) as 1080x1920, silent, 8-second H.264 clips
// in <project>/assets/clips/. Optional start second: V3@2.5 starts the clip 2.5 s in.
// Usage: node prep-videos.mjs <projectDir> V3 V7@2 ...
// Then in spec.json put "clip": "assets/clips/v3.mp4" on the shot (keep "src" as the fallback photo, or any photo).
import fs from "node:fs";
import path from "node:path";
import { ffmpeg, writeJson } from "./lib.mjs";

const [dirArg, ...picks] = process.argv.slice(2);
const dir = path.resolve(dirArg || ".");
const vids = JSON.parse(fs.readFileSync(path.join(dir, "videos.json"), "utf8"));
const creditsFile = path.join(dir, "assets", "photos", "credits.json");
const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, "utf8")) : [];
fs.mkdirSync(path.join(dir, "assets", "clips"), { recursive: true });

for (const pick of picks) {
  const [id, ss = "0"] = pick.replace(/^V/i, "").split("@");
  const v = vids.find((c) => c.n === Number(id));
  if (!v) { console.error(`! няма клип ${pick}`); continue; }
  const out = `assets/clips/v${id}.mp4`;
  ffmpeg(["-ss", ss, "-i", path.join(dir, v.file), "-t", "8", "-an",
    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,fps=30,setsar=1",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(dir, out)]);
  credits.push({ file: out, source: "Pexels", author: v.author, license: "Pexels License", page: v.page });
  console.log(`${pick} → ${out}`);
}
writeJson(creditsFile, credits);
