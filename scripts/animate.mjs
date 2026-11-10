#!/usr/bin/env node
// Brings chosen photos to life with Higgsfield image-to-video (LTX-2.5 Fast: cheap, 9:16, camera moves).
// Animates every shot in spec.json that has "animate": true and writes the clip to "clip".
//   node animate.mjs <projectDir>          → price estimate only (nothing is spent)
//   node animate.mjs <projectDir> --yes    → generate (after the person approved the price)
// Keys: HF_API_KEY_ID + HF_API_KEY_SECRET in ~/.ocean-video/config.env (console.higgsfield.ai → API keys).
import fs from "node:fs";
import path from "node:path";
import { loadEnv, sleep, writeJson } from "./lib.mjs";

loadEnv();
const { HF_API_KEY_ID: ID, HF_API_KEY_SECRET: SECRET } = process.env;
if (!ID || !SECRET) { console.error("HF_API_KEY_ID / HF_API_KEY_SECRET липсват (виж references/setup.md)"); process.exit(2); }
const API = "https://api.higgsfield.ai";
const MODEL = process.env.HF_I2V_MODEL || "lightricks/ltx-2.5/image-to-video/fast";
const AUTH = { Authorization: `Key ${ID}:${SECRET}` };

const [dirArg, ...flags] = process.argv.slice(2);
const dir = path.resolve(dirArg || ".");
const specFile = path.join(dir, "spec.json");
const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
const todo = spec.shots.filter((s) => s.animate && !(s.clip && fs.existsSync(path.join(dir, s.clip))));
if (!todo.length) { console.log("Няма снимки за оживяване (сложи \"animate\": true на кадрите в spec.json)."); process.exit(0); }

async function hf(p, body, method = body ? "POST" : "GET") {
  const r = await fetch(p.startsWith("http") ? p : API + p, {
    method, headers: { ...AUTH, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}

const DEFAULT_PROMPT =
  "Subtle, realistic natural motion only: gentle waves and ripples on the water, softly drifting clouds, leaves and flags moving in a light breeze, sparkling sunlight. " +
  "Keep the place, buildings, coastline and colours exactly as in the photo. No new objects, no people appearing, no text, no morphing.";

const bodyFor = (s, imageUrl) => ({
  prompt: s.animatePrompt || DEFAULT_PROMPT,
  image_url: imageUrl,
  duration: 6,
  resolution: "1080p",
  aspect_ratio: s.fit === "card" ? "16:9" : "9:16",
  generate_audio: false,
  camera_movement: s.camera || (s.motion === "out" ? "dolly_out" : "dolly_in"),
});

// 1) price
let total = 0;
for (const s of todo) {
  const est = await hf(`/estimate/${MODEL}`, bodyFor(s, "https://example.com/placeholder.jpg"));
  s._usd = Number(est.usd || 0);
  total += s._usd;
  console.log(`${s.src}  →  ${s.camera || (s.motion === "out" ? "dolly_out" : "dolly_in")}  ~$${s._usd.toFixed(3)}`);
}
console.log(`Общо: ~$${total.toFixed(2)} за ${todo.length} клипа (${MODEL})`);
if (!flags.includes("--yes")) { console.log("\n(само цена — нищо не е похарчено; пусни с --yes след одобрение)"); process.exit(0); }

// 2) upload → submit → poll → download
fs.mkdirSync(path.join(dir, "assets", "clips"), { recursive: true });
const jobs = [];
for (const s of todo) {
  const up = await hf("/files/generate-upload-url", { content_type: "image/jpeg" });
  const put = await fetch(up.upload_url, { method: "PUT", headers: up.upload_headers || { "Content-Type": "image/jpeg" }, body: fs.readFileSync(path.join(dir, s.src)) });
  if (!put.ok) throw new Error(`качването на ${s.src} върна ${put.status}`);
  const job = await fetch(`${API}/${MODEL}`, {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json", "Idempotency-Key": `${path.basename(dir)}-${path.basename(s.src)}-${s.camera || s.motion}` },
    body: JSON.stringify(bodyFor(s, up.public_url)),
  }).then(async (r) => { const t = await r.text(); if (!r.ok) throw new Error(`генериране ${r.status}: ${t.slice(0, 300)}`); return JSON.parse(t); });
  console.log(`↑ ${s.src} → заявка ${job.request_id}`);
  jobs.push({ s, job });
}
for (const { s, job } of jobs) {
  let res, delay = 2000;
  const t0 = Date.now();
  while (true) {
    res = await hf(job.status_url);
    if (["completed", "failed", "nsfw", "canceled"].includes(res.status)) break;
    if (Date.now() - t0 > 15 * 60 * 1000) throw new Error(`изтече времето за ${s.src} (${job.request_id})`);
    await sleep(delay); delay = Math.min(delay * 1.5, 10000);
  }
  if (res.status !== "completed" || !res.video?.url) { console.log(`✗ ${s.src}: ${res.status} ${res.error || ""}`); continue; }
  const out = `assets/clips/ai_${path.basename(s.src, path.extname(s.src))}.mp4`;
  fs.writeFileSync(path.join(dir, out), Buffer.from(await (await fetch(res.video.url)).arrayBuffer()));
  s.clip = out;
  console.log(`✓ ${s.src} → ${out}`);
}
for (const s of spec.shots) delete s._usd;
writeJson(specFile, spec);
