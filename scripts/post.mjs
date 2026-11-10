#!/usr/bin/env node
// Publishes a finished video to the agency's connected social accounts through Postforme.
//   node post.mjs accounts                                    → list connected accounts (id, platform, name)
//   node post.mjs publish <projectDir> [--yes] [--accounts id1,id2] [--schedule 2026-11-20T18:00:00+02:00]
//        reads <project>/renders/final.mp4, <project>/caption.txt, title from spec.json.
//        Without --yes it only prints what it WOULD post (dry run). Photo credits are appended.
//   node post.mjs status <postId>
// Key: POSTFORME_API_KEY in ~/.ocean-video/config.env (optional POSTFORME_ACCOUNTS=id1,id2 default set).
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./lib.mjs";

loadEnv();
const KEY = process.env.POSTFORME_API_KEY;
if (!KEY) { console.error("POSTFORME_API_KEY липсва (виж ~/.ocean-video/config.env)"); process.exit(2); }
const API = "https://api.postforme.dev/v1";
async function pf(p, opts = {}) {
  const r = await fetch(API + p, { ...opts, headers: { Authorization: `Bearer ${KEY}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${opts.method || "GET"} ${p} → ${r.status}: ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : {};
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };

if (cmd === "accounts") {
  const j = await pf("/social-accounts?limit=50");
  for (const a of j.data || []) console.log(`${a.id}  ${a.platform.padEnd(10)} ${a.username || a.name || ""}  [${a.status}]`);
  process.exit(0);
}

if (cmd === "status") {
  console.log(JSON.stringify(await pf(`/social-post-results?post_id=${rest[0]}`), null, 2));
  process.exit(0);
}

if (cmd === "publish") {
  const dir = path.resolve(rest[0] || ".");
  const spec = JSON.parse(fs.readFileSync(path.join(dir, "spec.json"), "utf8"));
  const video = path.join(dir, "renders", "final.mp4");
  const capFile = path.join(dir, "caption.txt");
  if (!fs.existsSync(video)) { console.error(`Няма видео: ${video}`); process.exit(1); }
  if (!fs.existsSync(capFile)) { console.error(`Няма описание: ${capFile}`); process.exit(1); }
  let caption = fs.readFileSync(capFile, "utf8").trim();

  // credit authors of CC BY / CC BY-SA photos that appear in the video
  const creditsFile = path.join(dir, "assets", "photos", "credits.json");
  if (fs.existsSync(creditsFile)) {
    const used = new Set(spec.shots.map((s) => s.src));
    const need = JSON.parse(fs.readFileSync(creditsFile, "utf8")).filter((c) => used.has(c.file) && /^cc by/i.test(c.license || ""));
    const names = [...new Set(need.map((c) => `${c.author || "неизвестен автор"} (${c.license})`))];
    if (names.length && !caption.includes("Снимки:")) caption += `\n\nСнимки: ${names.join(", ")}, Wikimedia Commons`;
  }

  const accounts = await pf("/social-accounts?limit=50");
  const wanted = (flag("--accounts") || process.env.POSTFORME_ACCOUNTS || "").split(",").filter(Boolean);
  const targets = (accounts.data || []).filter((a) => a.status !== "disconnected" && (!wanted.length || wanted.includes(a.id)));
  if (!targets.length) { console.error("Няма свързани профили в Postforme."); process.exit(1); }
  const title = (spec.postTitle || spec.title).slice(0, 90);
  const platforms = new Set(targets.map((a) => a.platform));
  const platform_configurations = {};
  if (platforms.has("instagram")) platform_configurations.instagram = { placement: "reels" };
  if (platforms.has("facebook")) platform_configurations.facebook = { placement: "reels" };
  if (platforms.has("youtube")) platform_configurations.youtube = { title, privacy_status: "public", made_for_kids: false };
  if (platforms.has("tiktok")) platform_configurations.tiktok = { title, privacy_status: "public" };

  console.log("Профили:", targets.map((a) => `${a.platform}:${a.username || a.name}`).join(", "));
  console.log("Заглавие:", title);
  console.log("Описание:\n" + caption);
  if (flag("--schedule")) console.log("Насрочено за:", flag("--schedule"));
  if (!rest.includes("--yes")) { console.log("\n(пробно пускане — нищо не е публикувано; добави --yes след одобрение)"); process.exit(0); }

  const up = await pf("/media/create-upload-url", { method: "POST", body: "{}" });
  const put = await fetch(up.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: fs.readFileSync(video) });
  if (!put.ok) throw new Error(`качването на видеото върна ${put.status}`);
  const post = await pf("/social-posts", {
    method: "POST",
    body: JSON.stringify({
      caption,
      social_accounts: targets.map((a) => a.id),
      media: [{ url: up.media_url }],
      platform_configurations,
      ...(flag("--schedule") ? { scheduled_at: flag("--schedule") } : {}),
    }),
  });
  fs.writeFileSync(path.join(dir, "posted.json"), JSON.stringify({ post, at: new Date().toISOString() }, null, 2));
  console.log(`✓ Публикувано. post id: ${post.id}  (провери с: node post.mjs status ${post.id})`);
  process.exit(0);
}
console.error("Команди: accounts | publish <projectDir> [--yes] | status <postId>");
process.exit(2);
