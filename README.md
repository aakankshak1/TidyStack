# TidyStack

A calm, privacy-first Chrome extension for tab management. Plain JavaScript, HTML, and CSS -- **no build step, no npm, no node_modules.** Chrome loads these files directly, exactly like any other extension.

## Load it

1. Open `chrome://extensions`
2. Toggle on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (`TidyStack`)
5. Done -- it just runs.

To make a change later: edit the files directly, then click the reload icon on the TidyStack card in `chrome://extensions`.

## What it does

- **Tab Graveyard, not deletion.** "Archiving" a tab saves its title/URL/favicon/date locally and closes it. Searchable, with Restore and Restore All.
- **Undo.** Archiving, closing, merging duplicates, and grouping all push onto a session-scoped undo stack, surfaced via a toast.
- **Duplicate detection.** URLs are normalized (tracking params, trailing slashes stripped).
- **Grouping**, scoped per-window. "Ungroup all" is always one click away.
- **Privacy-first.** Everything lives in `chrome.storage.local`/`chrome.storage.session`. No analytics, no trackers. The extension can't be turned on in Incognito windows at all.
- **Nudges.** One notification when you go past your tab limit (checked a few seconds after tabs open or finish loading, and every 15 minutes as a backup), then at most one reminder every 6 hours while you stay over. Settings save as you change them. **Settings > Send a test notification** shows whether Chrome and your system will actually display one.

## Pip and the pixel world

TidyStack has a little companion called **Pip** who lives in the header. Not a chatbot: just a character who reacts.

- **Pip's mood follows your tabs.** Calm and happy when things are tidy, worried when you pass your tab limit, shaking when you're far past it, napping when there's nothing to do. Click Pip for a boop (poke too fast and Pip gets dizzy).
- **Pip dresses for the season:** a flower in spring, sunglasses in summer, a scarf in autumn, a beanie and scarf in winter.
- **Archiving is satisfying.** The tab folds into a little card, flies to the Graveyard tab and lands in a burst of pixels. Grouping by topic or reaching "nothing idle" makes the whole scene glow and rain petals, glints, leaves or snow.
- **Empty states have little scenes:** Pip napping on a cushion (nothing idle), celebrating (no duplicates), peeking out of a crate (empty Graveyard).
- **Notifications are messages from Pip**, with a pixel picture of Pip in your current season. Turn on or off in Settings > Playful notifications.
- **Season changes dissolve into chunky pixels.** Season swatches in Settings animate when you hover them.
- **Custom pixel icons** throughout, recoloured by whichever theme you're in.
- **Seasonal sounds** (Settings > Seasonal sounds): off by default. Each season has its own timbre (soft triangle chimes, bright marimba-ish square, a warmer minor key in autumn, glassy bells in winter). Synthesised live, no audio files.
- Pip can be hidden any time in Settings > Pixel companion. Everything respects your OS "reduce motion" setting.

## Themes

Pick one in **Settings > Theme**. Spring is the default.

- **Spring, Summer, Autumn, Winter** -- each has its own pixel-art scene (parallax, drifting clouds, falling petals/leaves/snow, butterflies, waves, aurora...) and a matching pixel-style UI with notched corners.
- **Light, Dark** -- the original clean look, no scenery.

The scenes are drawn at runtime onto tiny canvases in `themes.js`, so there are no image files. If you've enabled "reduce motion" in your OS, scenes stay but stop moving.

Typography: Manrope everywhere, bundled locally so the popup never contacts a font server. One-time setup, run this in the TidyStack folder:

```
curl -L -o fonts/manrope.woff2 https://cdn.jsdelivr.net/npm/@fontsource-variable/manrope@5.3.0/files/manrope-latin-wght-normal.woff2
```

Until that file exists the popup quietly uses your system font. See `PRIVACY.md` for what the extension stores and why it needs each permission.

## File map

```
manifest.json    -- MV3 manifest
background.js    -- service worker: activity tracking, graveyard, duplicates, undo, grouping, notifications
popup.html       -- popup structure
popup.css        -- palettes for every theme + base styling
world.css        -- Pip, pixel icons, particles, empty scenes, and the shared motion system
themes.js        -- pixel-art scene engine, season-change wipe, theme switching
pixel.js         -- pixel icon set, Pip sprites, empty-state scenes, notification picture (also used by background.js)
critter.js       -- Pip's behaviour, particle effects, archive animation, seasonal sound effects
popup.js         -- renders every panel, messaging, tab switching, undo toast
fonts/           -- manrope.woff2 (see Typography above)
PRIVACY.md       -- what is stored, and why each permission is needed
icons/           -- extension icons
```

Storage keys start with `tidyStack...`. Data saved before the rename (settings and the Graveyard) is moved across automatically the first time this version runs; the `LEGACY_KEYS` block at the top of `background.js` does that and can be deleted in a later release.

## Packaging for the Chrome Web Store

Run `sh package.sh` to build `tidystack.zip` with only the files the extension needs. The `legacy-v1/` and `react-vite-version-unused/` folders are not included, and shouldn't be uploaded.

## Other folders here

- `legacy-v1/` -- the very first vanilla-JS draft, kept for reference. Not used.
- `react-vite-version-unused/` -- the React/Vite rebuild. Not used anymore. Safe to delete.

## Roadmap (not built yet)

- Focus Mode ("One Tab at a Time")
- Context Switcher (named workspaces)
- Tab Debt gamification
- Weekly analytics (local-only)
