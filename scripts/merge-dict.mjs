#!/usr/bin/env node
// Used by the installers on update: merges the agency's grown stress dictionary (kept) into the new one.
// Usage: node merge-dict.mjs <new.json> <kept.json>   — words from <kept.json> win.
import fs from "node:fs";
const [fresh, kept] = process.argv.slice(2);
const a = JSON.parse(fs.readFileSync(fresh, "utf8"));
const b = JSON.parse(fs.readFileSync(kept, "utf8"));
fs.writeFileSync(fresh, JSON.stringify({ ...a, ...b }, null, 2) + "\n");
