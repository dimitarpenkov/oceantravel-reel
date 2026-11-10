#!/usr/bin/env node
// ElevenLabs helpers for the travel-video pipeline.
//   node elevenlabs.mjs voices                 → list Bulgarian voices (own + shared library)
//   node elevenlabs.mjs tts   [projectDir]     → spec.vo.text → assets/voice.mp3 + assets/words.json
//   node elevenlabs.mjs music [projectDir]     → spec.music.prompt → assets/music.mp3
// API key: $ELEVENLABS_API_KEY, else ~/.ocean-video/config.env, else ~/.elevenlabs.env (KEY=value lines).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { applyStress, loadDict, stripStress } from "./stress.mjs";

const API = "https://api.elevenlabs.io";
function loadEnv() {
  for (const f of [path.join(os.homedir(), ".ocean-video", "config.env"), path.join(os.homedir(), ".elevenlabs.env")]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}
loadEnv();
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("ELEVENLABS_API_KEY липсва (виж ~/.ocean-video/config.env)"); process.exit(2); }
const H = { "xi-api-key": KEY };

async function api(p, opts = {}) {
  const r = await fetch(API + p, { ...opts, headers: { ...H, ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${opts.method || "GET"} ${p} → ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r;
}

const [cmd, dirArg] = process.argv.slice(2);
const dir = path.resolve(dirArg || ".");
const readSpec = () => JSON.parse(fs.readFileSync(path.join(dir, "spec.json"), "utf8"));

if (cmd === "voices") {
  const own = await (await api("/v2/voices?page_size=100")).json();
  console.log("== Твоите гласове");
  for (const v of own.voices || []) console.log(`${v.voice_id}  ${v.name}  [${v.category}]  ${v.labels?.language || ""} ${v.labels?.accent || ""}`);
  const shared = await (await api("/v1/shared-voices?language=bg&page_size=30")).json();
  console.log("\n== Споделени български гласове (Voice Library)");
  for (const v of shared.voices || []) console.log(`${v.voice_id}  owner=${v.public_owner_id}  ${v.name}  ${v.gender || ""} ${v.age || ""}  ${v.use_case || ""}  ${v.descriptive || ""}`);
  process.exit(0);
}

async function ensureVoice(spec) {
  const id = spec.vo.voiceId || process.env.ELEVENLABS_VOICE_ID;
  if (!id) throw new Error("Няма избран глас: сложи spec.vo.voiceId или ELEVENLABS_VOICE_ID (виж `node elevenlabs.mjs voices`).");
  // a shared-library voice must be added to the account once before use
  if (spec.vo.voiceOwner) {
    const own = await (await api("/v2/voices?page_size=100")).json();
    if (!(own.voices || []).some((v) => v.voice_id === id)) {
      const added = await (await api(`/v1/voices/add/${spec.vo.voiceOwner}/${id}`, { method: "POST", body: JSON.stringify({ new_name: spec.vo.voiceName || "Ocean Travel BG" }) })).json();
      return added.voice_id || id;
    }
  }
  return id;
}

if (cmd === "tts") {
  const spec = readSpec();
  const voiceId = await ensureVoice(spec);
  // stress marks go to the voice only; the words written for subtitles are stripped of them below
  const ttsText = applyStress(spec.vo.text, loadDict(spec));
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "tts-text.txt"), ttsText);
  const body = {
    text: ttsText,
    model_id: spec.vo.model || "eleven_multilingual_v2",
    voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: spec.vo.speed || 1.05, ...(spec.vo.settings || {}) },
  };
  const j = await (await api(`/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", body: JSON.stringify(body) })).json();
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  const raw = path.join(dir, spec.vo.file.replace(/\.mp3$/, ".raw.mp3"));
  fs.writeFileSync(raw, Buffer.from(j.audio_base64, "base64"));
  // social feeds play around -15 LUFS; lift the voice there with a true-peak ceiling (timing is unchanged)
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", "loudnorm=I=-15:TP=-1.5:LRA=11", "-ar", "44100", "-b:a", "192k", path.join(dir, spec.vo.file)]);
  const a = j.alignment;
  const words = [];
  let cur = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) words.push(cur); cur = null; return; }
    if (!cur) cur = { text: "", start: a.character_start_times_seconds[i], end: 0 };
    cur.text += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  const clean = words.map((w) => ({ text: stripStress(w.text), start: +w.start.toFixed(3), end: +w.end.toFixed(3) })).filter((w) => w.text);
  fs.writeFileSync(path.join(dir, spec.vo.words), JSON.stringify(clean, null, 1));
  console.log(`voice → ${spec.vo.file} (${words.length} думи, ${words.at(-1).end.toFixed(2)} s), voice_id=${voiceId}`);
}

if (cmd === "music") {
  const spec = readSpec();
  const seconds = Number(process.argv[4]) || spec.music.seconds || 35;
  const body = { prompt: spec.music.prompt, music_length_ms: Math.round(seconds * 1000), model_id: "music_v1", force_instrumental: true };
  const r = await api(`/v1/music?output_format=mp3_44100_128`, { method: "POST", body: JSON.stringify(body) });
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, spec.music.file), Buffer.from(await r.arrayBuffer()));
  console.log(`music → ${spec.music.file} (${seconds}s)`);
}
