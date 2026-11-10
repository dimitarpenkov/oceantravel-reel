#!/usr/bin/env node
// Builds a vertical (1080x1920) HyperFrames travel promo from spec.json.
// Inputs: spec.json, assets/words.json (word timings from tts.mjs; estimated if missing).
// Outputs: index.html (photos with Ken Burns + zoom transitions, labels, hook, end card, audio)
//          compositions/captions.html (word-by-word karaoke captions).
// Usage: node build.mjs [projectDir]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const dir = path.resolve(process.argv[2] || ".");
const spec = JSON.parse(fs.readFileSync(path.join(dir, "spec.json"), "utf8"));
const W = 1080, H = 1920;
const B = spec.brand;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, "").replace(/^-+|-+$/g, "");
const r3 = (n) => Math.round(n * 1000) / 1000;
const exists = (p) => fs.existsSync(path.join(dir, p));

// ---------- words ----------
let words;
const offset = spec.vo.offset ?? 0.25;
if (exists(spec.vo.words)) {
  words = JSON.parse(fs.readFileSync(path.join(dir, spec.vo.words), "utf8"));
} else {
  console.warn("! no words.json — estimating timings (preview only)");
  let t = 0;
  words = spec.vo.text.split(/\s+/).filter(Boolean).map((w) => {
    const d = 0.12 + 0.055 * norm(w).length;
    const o = { text: w, start: t, end: t + d };
    t += d + (/[.!?]$/.test(w) ? 0.35 : /[,—]$/.test(w) ? 0.15 : 0.04);
    return o;
  });
}
// subtitles never show stress marks (accents or the apostrophe shorthand "Лефка'да")
const unstress = (s) => s.replace(/[́̀]/g, "").replace(/([аъоуеиюяэыАЪОУЕИЮЯЭЫ])['’]/g, "$1");
words = words.map((w) => ({ ...w, text: unstress(w.text) })).filter((w) => norm(w.text)).map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }));
const voEnd = words.at(-1).end;
const T = r3(voEnd + (spec.tail ?? 2.5));

// caption tokens: apply spoken→display replacements, strip soft punctuation
const tokens = [];
for (let i = 0; i < words.length; ) {
  let hit = null;
  for (const rep of spec.captionReplacements || []) {
    const seq = rep.spoken.split(/\s+/).map(norm);
    if (seq.every((s, k) => words[i + k] && norm(words[i + k].text) === s)) { hit = { rep, n: seq.length }; break; }
  }
  if (hit) {
    const last = words[i + hit.n - 1];
    const trail = (last.text.match(/[.!?]+$/) || [""])[0];
    tokens.push({ text: hit.rep.display, start: words[i].start, end: last.end, brk: !!trail });
    i += hit.n;
  } else {
    const w = words[i];
    tokens.push({ text: w.text.replace(/[,.;:—–]+$/g, "").replace(/^[—–]+$/, ""), start: w.start, end: w.end, brk: /[.!?,;—]$/.test(w.text) });
    i++;
  }
}
const toks = tokens.filter((t) => t.text);

// ---------- anchors → shot cut times ----------
let cursor = 0;
const findWord = (anchor) => {
  const a = norm(anchor);
  for (let i = cursor; i < words.length; i++) if (norm(words[i].text) === a) { cursor = i + 1; return words[i].start; }
  throw new Error(`anchor "${anchor}" not found in voiceover after word #${cursor}`);
};
const shots = spec.shots.map((s, i) => ({ ...s, i, cut: i === 0 ? 0 : r3(findWord(s.anchor) - 0.25) }));
shots.forEach((s, i) => {
  s.start = i === 0 ? 0 : r3(s.cut - 0.05);
  s.end = i === shots.length - 1 ? T : r3(shots[i + 1].cut + 0.2);
  s.dur = r3(s.end - s.start);
});
cursor = 0;
const endStart = r3(findWord(spec.endcard.anchor) + 0.15);
const hookEnd = shots[1]?.cut ?? 2.5;

// card-fit shots get a pre-blurred cover background (no CSS filters on footage)
for (const s of shots.filter((s) => s.fit === "card")) {
  const bg = s.src.replace(/\.(\w+)$/, "_bg.jpg");
  if (!exists(bg)) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(dir, s.src), "-vf",
    "scale=1350:2400:force_original_aspect_ratio=increase,crop=1350:2400,boxblur=40:3,eq=brightness=-0.08", "-q:v", "3", path.join(dir, bg)]);
  s.bg = bg;
}

// ---------- caption groups ----------
const groups = [];
let g = [];
for (let i = 0; i < toks.length; i++) {
  g.push(toks[i]);
  const chars = g.map((t) => t.text).join(" ").length;
  const next = toks[i + 1];
  const pause = next ? next.start - toks[i].end : 1;
  if (!next || toks[i].brk || pause >= 0.15 || g.length >= 3 || chars >= 18) { groups.push(g); g = []; }
}
groups.forEach((grp, k) => {
  grp.start = r3(Math.max(0.1, grp[0].start - 0.08));
  const nextStart = groups[k + 1] ? groups[k + 1][0].start - 0.08 : T;
  grp.end = r3(Math.min(nextStart, grp.at(-1).end + 0.35));
});

// ---------- index.html ----------
const pin = `<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path fill="${B.accent}" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"/></svg>`;
let z = 1;
// A shot with "clip" (Pexels footage or an AI-animated photo) plays that video, muted. HyperFrames times
// either a <video> or its wrapper, never both, so for clip shots the wrapper is untimed and each media
// element inside carries the shot's window itself.
for (const s of shots.filter((s) => s.clip)) {
  if (!exists(s.clip)) { console.warn(`! клипът ${s.clip} липсва — ползвам снимката`); delete s.clip; continue; }
  const len = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(dir, s.clip)]).toString());
  if (len < s.dur) console.warn(`! ${s.clip} е ${len.toFixed(1)} s, а кадърът е ${s.dur} s — последният кадър ще застине`);
}
const timed = (s) => `class="clip %C" data-start="${s.start}" data-duration="${s.dur}"`;
const shotHtml = shots.map((s) => {
  const t = (cls) => timed(s).replace("%C", cls);
  const media = s.clip
    ? s.bg
      ? `<img id="bg-${s.i}" ${t("cover")} src="${s.bg}" alt="" /><video id="v-${s.i}" ${t("card")} src="${s.clip}" muted playsinline></video>`
      : `<video id="v-${s.i}" ${t("cover")} src="${s.clip}" muted playsinline></video>`
    : s.bg ? `<img class="cover" src="${s.bg}" alt="" /><img class="card" src="${s.src}" alt="" />` : `<img class="cover" src="${s.src}" alt="" />`;
  const wrap = s.clip ? `class="shot" data-layout-allow-overflow` : `class="clip shot" data-start="${s.start}" data-duration="${s.dur}"`;
  return `
      <div id="shot-${s.i}" ${wrap} data-track-index="1" style="z-index:${z++}">
        <div class="fxout"><div class="fxin"><div class="kb">${media}</div></div></div>
      </div>`;
}).join("");
const labelShots = shots.filter((s) => s.label);
const labelHtml = labelShots.map((s) => {
  const st = r3(s.cut + (s.end - s.cut < 1.6 ? 0.08 : 0.25)), en = r3(Math.min(s.end - 0.2, s === shots.at(-2) ? endStart : Infinity));
  s.lst = st; s.len = en;
  return `
      <div id="label-${s.i}" class="clip label" data-start="${st}" data-duration="${r3(en - st)}" data-track-index="2" style="z-index:60">
        <div class="label-in">${pin}<span>${esc(s.label)}</span></div>
      </div>`;
}).join("");
const ec = spec.endcard;
const audio = [
  exists(spec.vo.file) ? `<audio id="vo" class="clip" data-start="${offset}" data-duration="${r3(Math.min(T - offset, Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(dir, spec.vo.file)]).toString())))}" data-track-index="6" data-volume="1" src="${spec.vo.file}"></audio>` : "",
  spec.music && exists(spec.music.file) ? `<audio id="bgm" class="clip" data-start="0" data-duration="${T}" data-track-index="7" data-volume="${spec.music.volume}" data-fade-in="0.3" data-fade-out="1.8" src="${spec.music.file}"></audio>` : "",
].filter(Boolean).join("\n      ");

const index = `<!doctype html>
<html lang="bg" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${esc(spec.title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root { --primary: ${B.primary}; --secondary: ${B.secondary}; --accent: ${B.accent}; --ink: #ffffff; --font: "${B.font}", sans-serif; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      #root { width: 100%; height: 100%; position: relative; font-family: var(--font); color: var(--ink); font-feature-settings: "locl" 0; }
      .shot, .label, #hook, #endcard, #scrim { position: absolute; inset: 0; overflow: hidden; }
      .fxout, .fxin, .kb { position: absolute; inset: 0; }
      .cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .card { position: absolute; left: 50px; right: 50px; top: 560px; width: 980px; height: 551px; object-fit: cover; border-radius: 36px; box-shadow: 0 30px 80px rgba(0,0,0,.45); border: 6px solid #fff; }
      #scrim { background: linear-gradient(180deg, rgba(0,0,0,.38) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 50%, rgba(0,0,0,.55) 78%, rgba(0,0,0,.35) 100%); }
      .label-in { position: absolute; left: 70px; top: 230px; display: flex; align-items: center; gap: 12px; padding: 16px 30px 16px 22px; border-radius: 999px; background: rgba(41,55,128,.82); font-size: 40px; font-weight: 700; letter-spacing: .01em; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
      .hook-in { position: absolute; left: 0; right: 0; top: 470px; text-align: center; }
      .hook-logo { display: inline-block; background: #fff; border-radius: 22px; padding: 18px 30px; margin-bottom: 40px; }
      .hook-logo img { display: block; width: 330px; height: auto; }
      .hook-title { font-size: 156px; font-weight: 900; letter-spacing: .01em; line-height: 1; text-shadow: 0 6px 0 rgba(20,28,70,.35), 0 10px 50px rgba(0,0,0,.6); }
      .hook-sub { display: inline-block; margin-top: 34px; padding: 18px 40px; border-radius: 999px; background: var(--accent); color: var(--primary); font-size: 54px; font-weight: 800; }
      .ec-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,28,70,.30) 0%, rgba(20,28,70,.78) 45%, rgba(20,28,70,.86) 100%); }
      .ec-in { position: absolute; left: 70px; right: 70px; top: 215px; text-align: center; }
      .ec-logo { display: inline-block; background: #fff; border-radius: 22px; padding: 18px 30px; }
      .ec-logo img { display: block; width: 360px; height: auto; }
      .ec-eyebrow { margin-top: 36px; font-size: 38px; font-weight: 700; letter-spacing: .08em; color: #dfe6ff; }
      .ec-price { margin-top: 10px; font-size: 150px; font-weight: 900; line-height: 1; color: var(--accent); text-shadow: 0 8px 40px rgba(0,0,0,.35); }
      .ec-note { margin-top: 10px; font-size: 36px; font-weight: 600; color: #dfe6ff; }
      .ec-line { margin-top: 14px; font-size: 38px; font-weight: 700; }
      .ec-badge { display: inline-block; margin-top: 30px; padding: 16px 34px; border-radius: 999px; background: #fff; color: var(--primary); font-size: 40px; font-weight: 800; }
      .ec-contact { margin-top: 28px; font-size: 52px; font-weight: 800; }
      .ec-url { margin-top: 8px; font-size: 40px; font-weight: 600; color: var(--accent); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${T}" data-width="${W}" data-height="${H}">${shotHtml}
      <div id="scrim" class="clip" data-start="0" data-duration="${T}" data-track-index="2" data-layout-ignore style="z-index:50"></div>
      <div id="flash" class="clip" data-start="0" data-duration="${T}" data-track-index="2" data-layout-ignore style="z-index:55; background:#fff; opacity:0"></div>${labelHtml}
      <div id="hook" class="clip" data-start="0" data-duration="${r3(hookEnd)}" data-track-index="3" style="z-index:70">
        <div class="hook-in">
          <div class="hook-logo"><img src="${B.logo}" alt="Ocean Travel" /></div>
          <div id="hook-title" class="hook-title">${esc(spec.hook.title)}</div>
          <div id="hook-sub" class="hook-sub">${esc(spec.hook.subtitle)}</div>
        </div>
      </div>
      <div id="endcard" class="clip" data-start="${endStart}" data-duration="${r3(T - endStart)}" data-track-index="3" style="z-index:80">
        <div class="ec-shade"></div>
        <div class="ec-in">
          <div class="ec-logo"><img src="${B.logo}" alt="Ocean Travel" /></div>
          <div class="ec-eyebrow">${esc(ec.eyebrow)}</div>
          <div class="ec-price">${esc(ec.price)}</div>
          <div class="ec-note">${esc(ec.priceNote)}</div>
          ${ec.lines.map((l) => `<div class="ec-line">${esc(l)}</div>`).join("\n          ")}
          <div class="ec-badge">${esc(ec.badge)}</div>
          <div class="ec-contact">${esc(ec.phone)}</div>
          <div class="ec-url">${esc(ec.url)}</div>
        </div>
      </div>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${T}" data-track-index="5" data-track-kind="captions" data-width="${W}" data-height="${H}" style="z-index:90"></div>
      ${audio}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      const SHOTS = ${JSON.stringify(shots.map((s) => ({ i: s.i, start: s.start, cut: s.cut, dur: s.dur, end: s.end, motion: s.motion, clip: !!s.clip })))};
      const LABELS = ${JSON.stringify(labelShots.map((s) => ({ i: s.i, st: s.lst, en: s.len })))};
      SHOTS.forEach((s, k) => {
        // Ken Burns: alternate slow zoom-in / zoom-out with a gentle drift
        const dx = k % 2 ? -24 : 24;
        // footage already moves: give it only a whisper of extra zoom
        const z = s.clip ? 1.05 : 1.17, d = s.clip ? 0 : dx, dy = s.clip ? 0 : -18;
        const from = s.motion === "out" ? { scale: z, x: d, y: dy } : { scale: 1.0, x: 0, y: 0 };
        const to = s.motion === "out" ? { scale: 1.0, x: 0, y: 0 } : { scale: z, x: d, y: dy };
        tl.fromTo("#shot-" + s.i + " .kb", from, { ...to, duration: s.dur, ease: "none" }, s.start);
        if (k > 0) {
          // zoom-punch transition: outgoing rushes in + blurs, incoming lands from a zoom and sharpens
          const prev = SHOTS[k - 1];
          tl.fromTo("#shot-" + prev.i + " .fxout", { scale: 1, filter: "blur(0px)" },
            { scale: 1.9, filter: "blur(26px)", duration: 0.32, ease: "power3.in", immediateRender: false }, s.cut - 0.32);
          tl.fromTo("#shot-" + s.i + " .fxin", { opacity: 0 }, { opacity: 1, duration: 0.05, ease: "none" }, s.cut - 0.02);
          tl.fromTo("#shot-" + s.i + " .fxin", { scale: 1.7, filter: "blur(22px)" },
            { scale: 1, filter: "blur(0px)", duration: 0.6, ease: "expo.out" }, s.cut - 0.02);
          tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.45, duration: 0.05, ease: "none", immediateRender: false }, s.cut - 0.05);
          tl.fromTo("#flash", { opacity: 0.45 }, { opacity: 0, duration: 0.22, ease: "power2.out", immediateRender: false }, s.cut);
        }
      });
      LABELS.forEach((l) => {
        const el = "#label-" + l.i + " .label-in";
        const inDur = Math.min(0.45, Math.max(0.15, (l.en - l.st) * 0.35));
        tl.fromTo(el, { opacity: 0, x: -40, filter: "blur(6px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: inDur, ease: "expo.out" }, l.st);
        tl.fromTo(el, { opacity: 1 }, { opacity: 0, x: 30, duration: 0.2, ease: "power2.in", immediateRender: false }, l.en - 0.22);
      });
      // hook: on screen at frame 0, subtitle lands, then the whole block zooms away into the first cut
      tl.fromTo("#hook-sub", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)" }, 0.35);
      tl.fromTo("#hook .hook-in", { opacity: 1, scale: 1, filter: "blur(0px)" },
        { opacity: 0, scale: 1.25, filter: "blur(12px)", duration: 0.35, ease: "power3.in", immediateRender: false }, ${r3(hookEnd - 0.4)});
      // end card
      const E = ${endStart};
      tl.fromTo("#endcard .ec-shade", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.inOut" }, E);
      gsap.utils.toArray("#endcard .ec-in > *").forEach((el, n) => {
        tl.fromTo(el, { opacity: 0, y: 26, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, ease: "expo.out" }, E + 0.15 + n * 0.09);
      });
      tl.fromTo("#endcard .ec-price", { scale: 0.7 }, { scale: 1, duration: 0.7, ease: "back.out(1.8)" }, E + 0.33);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync(path.join(dir, "index.html"), index);

// ---------- compositions/captions.html ----------
let wid = 0;
const capHtml = groups.map((grp, k) => `
    <div id="cg-${k}" class="clip cg" data-start="${grp.start}" data-duration="${r3(grp.end - grp.start)}">
      <div class="cg-line"><div class="cg-in">${grp.map((t) => { t.id = "w-" + wid++; return `<span id="${t.id}" class="w">${esc(t.text)}</span>`; }).join(" ")}</div></div>
    </div>`).join("");
const WORDS = groups.flatMap((grp) => grp.map((t, n) => ({ id: t.id, s: r3(t.start), e: r3(n < grp.length - 1 ? grp[n + 1].start : Math.min(grp.end, t.end + 0.25)) })));
const captions = `<template>
  <style>
    #root { position: absolute; inset: 0; font-family: "${B.font}", sans-serif; font-feature-settings: "locl" 0; }
    .cg { position: absolute; inset: 0; }
    .cg-line { position: absolute; left: 0; right: 0; top: 1130px; text-align: center; padding: 0 70px; }
    .cg-in { display: inline-block; line-height: 1.32; }
    .w { display: inline-block; padding: 2px 14px 6px; border-radius: 14px; font-size: 66px; font-weight: 800; color: #fff;
         text-shadow: 0 3px 0 rgba(0,0,0,.35), 0 0 22px rgba(0,0,0,.55); background-color: rgba(255,186,0,0); }
  </style>
  <div id="root" data-composition-id="captions" data-width="${W}" data-height="${H}">${capHtml}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    const GROUPS = ${JSON.stringify(groups.map((grp, k) => ({ id: "cg-" + k, s: grp.start })))};
    const WORDS = ${JSON.stringify(WORDS)};
    GROUPS.forEach((g) => {
      tl.fromTo("#" + g.id + " .cg-in", { opacity: 0, y: 24, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "back.out(1.6)" }, g.s);
    });
    // karaoke: the spoken word sits in a brand-yellow box with navy text
    WORDS.forEach((w) => {
      tl.fromTo("#" + w.id, { backgroundColor: "rgba(255,186,0,0)", color: "#ffffff", textShadow: "0 3px 0 rgba(0,0,0,.35), 0 0 22px rgba(0,0,0,.55)" },
        { backgroundColor: "rgba(255,186,0,1)", color: "${B.primary}", textShadow: "0 0 0 rgba(0,0,0,0), 0 0 0 rgba(0,0,0,0)", duration: 0.06, ease: "none", immediateRender: false }, w.s);
      tl.fromTo("#" + w.id, { backgroundColor: "rgba(255,186,0,1)", color: "${B.primary}" },
        { backgroundColor: "rgba(255,186,0,0)", color: "#ffffff", textShadow: "0 3px 0 rgba(0,0,0,.35), 0 0 22px rgba(0,0,0,.55)", duration: 0.06, ease: "none", immediateRender: false }, Math.max(w.s + 0.06, w.e - 0.06));
    });
    window.__timelines["captions"] = tl;
  </script>
</template>
`;
fs.mkdirSync(path.join(dir, "compositions"), { recursive: true });
fs.writeFileSync(path.join(dir, "compositions", "captions.html"), captions);
console.log(JSON.stringify({ duration: T, shots: shots.map((s) => [s.i, s.start, s.dur]), groups: groups.length, endStart }, null, 0));
