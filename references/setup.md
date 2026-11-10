# Първоначална настройка (веднъж на компютър)

## 1. Програми

- **Node.js 20+**: https://nodejs.org (бутон LTS)
- **ffmpeg**: macOS `brew install ffmpeg` · Windows `winget install Gyan.FFmpeg`
- **Google Chrome**: HyperFrames го ползва за рендер.

## 2. Къде се слага skill-ът

Цялата папка `oceantravel-reel` се копира тук:

| Агент       | Папка                                  |
| ----------- | -------------------------------------- |
| Codex       | `~/.codex/skills/oceantravel-reel/`    |
| Claude Code | `~/.claude/skills/oceantravel-reel/`   |

След това агентът се рестартира. Извиква се с „направи видео за …“ или с `$oceantravel-reel` (Codex) / `/oceantravel-reel` (Claude Code).

## 3. Ключове

Създай файла `~/.ocean-video/config.env` (на Windows: `C:\Users\<име>\.ocean-video\config.env`):

```
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=...
POSTFORME_API_KEY=pfm_live_...
POSTFORME_ACCOUNTS=spc_...,spc_...
PEXELS_API_KEY=...
HF_API_KEY_ID=...
HF_API_KEY_SECRET=...
```

- **Pexels** (истински видеа от мястото, безплатно): pexels.com/api → Your API Key.
- **Higgsfield API** (оживяване на снимки): console.higgsfield.ai → API keys (ID + secret, secret-ът се вижда само веднъж) и зареди баланс в USD. Това е отделно от абонамента на higgsfield.ai. Един 6-секунден клип с LTX-2.5 Fast струва няколко десетки цента (точната цена я показва `animate.mjs`).

- **ElevenLabs** (глас): elevenlabs.io → Profile → API Keys. **Нужен е платен план (Starter или по-висок)**: безплатният не позволява българските гласове от библиотеката през API (грешка 402). При създаване на ключа отметни права за Text to Speech и Voices.
- **Гласът**: `node scripts/elevenlabs.mjs voices` показва българските гласове. Избраният `voice_id` отива в `ELEVENLABS_VOICE_ID`, за да звучи всяко видео с един и същ глас. Ако гласът е от споделената библиотека, при първото ползване трябват и `voiceOwner` в spec.json, или гласът се добавя ръчно в „My Voices“.
- **Postforme** (автоматично качване в Instagram, Facebook, TikTok, YouTube): postforme.dev → свържи профилите на агенцията → API key. `node scripts/post.mjs accounts` показва ID-тата за `POSTFORME_ACCOUNTS`.

Ключовете не се пращат в чата и не се слагат в проекта, само в този файл.

## 4. Проверка

```
node ~/.codex/skills/oceantravel-reel/scripts/doctor.mjs
```
Всички редове трябва да са с ✓ (без Postforme видеото пак се прави, само се качва ръчно).
