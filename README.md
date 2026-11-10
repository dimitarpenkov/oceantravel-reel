# Ocean Travel Reel — skill за Codex

Прави вертикални видеа (Reels, TikTok, Shorts) за програмите на oceantravel.bg: снимки или видеа на мястото, глас на български, субтитри, краен екран с цена и телефон. После ги качва в социалните мрежи на агенцията.

## Инсталация (веднъж)

1. Инсталирай **Node.js 20+** (nodejs.org), **ffmpeg** (macOS: `brew install ffmpeg`, Windows: `winget install Gyan.FFmpeg`) и **Google Chrome**.
2. Свали skill-а и пусни инсталатора:
   - macOS:
     ```bash
     git clone https://github.com/dimitarpenkov/oceantravel-reel.git
     cd oceantravel-reel && bash install.sh
     ```
   - Windows (PowerShell):
     ```powershell
     git clone https://github.com/dimitarpenkov/oceantravel-reel.git
     cd oceantravel-reel; powershell -ExecutionPolicy Bypass -File install.ps1
     ```
   Без git: в GitHub → **Code → Download ZIP**, разархивирай и пусни `install.sh` / `install.ps1` от папката.

   **Обновяване:** `git pull` в същата папка и пак инсталатора. Думите, добавени в речника с ударения, се запазват.

   Инсталаторът:
   - копира skill-а в `~/.codex/skills/oceantravel-reel`;
   - създава папка `~/OceanTravel-videos` за видеата;
   - създава празен файл с ключове `~/.ocean-video/config.env`.
3. Отвори `~/.ocean-video/config.env` в текстов редактор и попълни ключовете (обяснено е в `references/setup.md`). Задължителен е само `ELEVENLABS_API_KEY` (платен план Starter). Останалите са по желание.
4. Разреши на Codex интернет. Скриптовете ползват сайта, ElevenLabs и т.н. Добави в `~/.codex/config.toml`:
   ```toml
   [sandbox_workspace_write]
   network_access = true
   ```
5. Рестартирай Codex.

## Ползване

```bash
cd ~/OceanTravel-videos
codex
```

После напиши например:

> $oceantravel-reel Направи видео за https://oceantravel.bg/product/petzvezdna-pochivka-ostrov-lefkada/

Codex ще:
1. прочете програмата от сайта;
2. намери снимки и видеа и ти покаже кои е избрал;
3. напише текста за гласа и **ще чака одобрението ти** (провери цената и датите);
4. провери ударенията, запише гласа и сглоби видеото;
5. покаже готовото видео в `<проект>/renders/final.mp4`;
6. качи го в социалните мрежи **само ако кажеш „да“**.

Ако гласът сбърка ударение, кажи му: „думата Итака е с ударение на И“. Той ще я добави в речника и следващите видеа ще са правилни.

## Проверка

```bash
node ~/.codex/skills/oceantravel-reel/scripts/doctor.mjs
```
