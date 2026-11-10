// Shared helpers: config loading, ffmpeg, small utils.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONFIG_FILE = path.join(os.homedir(), ".ocean-video", "config.env");
export const HF = "hyperframes@0.9.26"; // pinned so every video renders the same way

export function loadEnv() {
  for (const f of [CONFIG_FILE, path.join(os.homedir(), ".elevenlabs.env")]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

export const ffmpeg = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
export const probeSize = (file) => {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString().trim();
  const [w, h] = out.split(",").map(Number);
  return { w, h };
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const UA = { "User-Agent": "OceanTravelReel/1.0 (social video maker; office@oceantravel.bg)" };
export function stripHtml(html = "") {
  return html
    .replace(/<(br|\/p|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&#8211;/g, "–").replace(/&#8212;/g, "—").replace(/&#8222;|&#8220;|&#8221;/g, "\"")
    .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#0?39;|&#8217;/g, "'").replace(/&euro;/g, "€")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
