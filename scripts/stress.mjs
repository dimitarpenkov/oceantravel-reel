#!/usr/bin/env node
// Stress marks for the Bulgarian voiceover.
// The voice gets a combining acute accent (U+0301) after the stressed vowel; subtitles never show it.
// Sources, later wins: references/stress-bg.json (shared dictionary) → spec.vo.stress (this video only)
// → apostrophes written straight into vo.text ("Лефка'да").
//
//   node stress.mjs <projectDir>          → check: shows the text as the voice will read it
//                                           (stressed vowel in CAPITALS) and lists words with no stress set
//   node stress.mjs add <дума'>           → adds/overwrites a word in the shared dictionary
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./lib.mjs";

export const ACUTE = "́";
const DICT_FILE = path.join(SKILL_DIR, "references", "stress-bg.json");
const VOWELS = "аъоуеиюяэыАЪОУЕИЮЯЭЫ";
const WORD = /[\p{L}\p{M}'’-]+/gu;

export const stripStress = (s) => String(s).replace(/[́̀]/g, "").replace(new RegExp(`([${VOWELS}])['’]`, "g"), "$1");
const bare = (w) => stripStress(w).replace(/['’]/g, "").toLowerCase();
const toMarks = (w) => w.replace(new RegExp(`([${VOWELS}])['’]`, "g"), `$1${ACUTE}`);

export function loadDict(spec) {
  const shared = JSON.parse(fs.readFileSync(DICT_FILE, "utf8"));
  const local = spec?.vo?.stress || {};
  const dict = {};
  for (const [k, v] of Object.entries({ ...shared, ...local })) if (!k.startsWith("_")) dict[bare(k)] = v;
  return dict;
}

// Returns the text the voice should read: every word stressed from the dictionary or by hand.
export function applyStress(text, dict) {
  return text.replace(WORD, (w) => {
    if (/[́]/.test(w) || new RegExp(`[${VOWELS}]['’]`).test(w)) return toMarks(w); // stressed by hand
    const v = dict[bare(w)];
    if (!v) return w;
    const out = w[0] === w[0].toUpperCase() ? v[0].toUpperCase() + v.slice(1) : v[0].toLowerCase() + v.slice(1);
    return toMarks(out);
  });
}

const vowelCount = (w) => [...w].filter((c) => VOWELS.includes(c)).length;

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("stress.mjs")) {
  const [a, b] = process.argv.slice(2);
  if (a === "add") {
    if (!b || !/['’]/.test(b)) { console.error("Пример: node stress.mjs add Кефало'ния"); process.exit(2); }
    const d = JSON.parse(fs.readFileSync(DICT_FILE, "utf8"));
    d[bare(b)] = b.replace(/’/g, "'");
    fs.writeFileSync(DICT_FILE, JSON.stringify(d, null, 2) + "\n");
    console.log(`✓ ${bare(b)} → ${b}`);
    process.exit(0);
  }
  const dir = path.resolve(a || ".");
  const spec = JSON.parse(fs.readFileSync(path.join(dir, "spec.json"), "utf8"));
  const tts = applyStress(spec.vo.text, loadDict(spec));
  const show = tts.replace(new RegExp(`([${VOWELS}])${ACUTE}`, "g"), (_, v) => v.toUpperCase());
  console.log("Гласът ще чете (ударената гласна е с главна буква):\n");
  console.log(show + "\n");
  const missing = [...new Set((tts.match(WORD) || []).filter((w) => !w.includes(ACUTE) && vowelCount(w) >= 2).map((w) => w.replace(/[,.!?]/g, "")))];
  if (missing.length) console.log("Без зададено ударение (провери дали гласът ги казва правилно):\n  " + missing.join(", "));
}
