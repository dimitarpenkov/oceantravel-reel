#!/usr/bin/env node
// Checks that everything the skill needs is installed and configured.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { loadEnv, CONFIG_FILE, HF } from "./lib.mjs";

loadEnv();
let ok = true;
const line = (good, msg, fix) => { console.log(`${good ? "✓" : "✗"} ${msg}${!good && fix ? `\n    → ${fix}` : ""}`); if (!good) ok = false; };
const has = (cmd, args = ["-version"]) => { try { execFileSync(cmd, args, { stdio: "ignore", shell: process.platform === "win32" }); return true; } catch { return false; } };

line(Number(process.versions.node.split(".")[0]) >= 20, `Node.js ${process.versions.node}`, "Инсталирай Node.js 20+ от https://nodejs.org");
line(has("ffmpeg"), "ffmpeg", "macOS: brew install ffmpeg · Windows: winget install Gyan.FFmpeg");
line(has("ffprobe"), "ffprobe", "идва заедно с ffmpeg");
line(has(process.platform === "win32" ? "npx.cmd" : "npx", ["-y", HF, "--version"]), `HyperFrames (${HF})`, "нужен е интернет при първото пускане (npx го сваля)");
line(fs.existsSync(CONFIG_FILE), `Настройки: ${CONFIG_FILE}`, "създай файла по примера в references/setup.md");
line(!!process.env.ELEVENLABS_API_KEY, "ELEVENLABS_API_KEY (глас)", "ключ от elevenlabs.io → Profile → API Keys");
line(!!process.env.ELEVENLABS_VOICE_ID, "ELEVENLABS_VOICE_ID (гласът на агенцията)", "node scripts/elevenlabs.mjs voices → избери глас");
line(!!process.env.PEXELS_API_KEY, "PEXELS_API_KEY (видеа от мястото, по желание)", "безплатен ключ от pexels.com/api");
line(!!(process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET), "HF_API_KEY_ID + HF_API_KEY_SECRET (оживяване на снимки, по желание)", "console.higgsfield.ai → API keys");
line(!!process.env.POSTFORME_API_KEY, "POSTFORME_API_KEY (автоматично качване)", "ключ от postforme.dev; без него видеото се прави, но се качва ръчно");

if (process.env.ELEVENLABS_API_KEY) {
  try {
    const h = { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } };
    const v = await fetch("https://api.elevenlabs.io/v2/voices?page_size=1", h);
    line(v.ok, v.ok ? "ElevenLabs приема ключа" : `ElevenLabs отказва ключа (${v.status})`, "провери ключа и правата му (Text to Speech, Voices, Music)");
    const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", h);
    if (r.ok) { const j = await r.json(); console.log(`  план ${j.tier}, остават ${j.character_limit - j.character_count} знака`); }
  } catch (e) { line(false, "ElevenLabs не отговаря: " + e.message); }
}
console.log(ok ? "\nВсичко е наред." : "\nОправи отбелязаните с ✗ и пусни пак.");
process.exit(ok ? 0 : 1);
