#!/usr/bin/env node
// Creates a new video project: HyperFrames portrait scaffold + logo + spec template.
// Usage: node new-project.mjs <projectDir>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { SKILL_DIR, HF } from "./lib.mjs";

const dir = path.resolve(process.argv[2] || "");
if (!process.argv[2]) { console.error("Usage: node new-project.mjs <projectDir>"); process.exit(2); }
if (fs.existsSync(path.join(dir, "spec.json"))) { console.log(`Проектът вече съществува: ${dir}`); process.exit(0); }
fs.mkdirSync(path.dirname(dir), { recursive: true });
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(npx, ["-y", HF, "init", path.basename(dir), "--example", "blank", "--resolution", "portrait", "--non-interactive", "--skip-skills"],
  { cwd: path.dirname(dir), stdio: "inherit", shell: process.platform === "win32" });
fs.mkdirSync(path.join(dir, "assets", "photos"), { recursive: true });
fs.copyFileSync(path.join(SKILL_DIR, "assets", "logo.png"), path.join(dir, "assets", "logo.png"));
fs.copyFileSync(path.join(SKILL_DIR, "templates", "spec.example.json"), path.join(dir, "spec.json"));
console.log(`✓ Нов проект: ${dir}`);
