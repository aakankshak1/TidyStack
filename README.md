# Tab Tamer

A calm, privacy-first Chrome extension for tab management. Plain JavaScript, HTML, and CSS -- **no build step, no npm, no node_modules.** Chrome loads these files directly, exactly like any other extension.

## Load it

1. Open `chrome://extensions`
2. Toggle on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (`tab-tamer 2`)
5. Done -- it just runs. No `npm install`, no `npm run dev`, no build command, ever.

To make a change later: edit `background.js`, `popup.html`, `popup.css`, or `popup.js` directly, then click the reload icon (⟳) on the Tab Tamer card in `chrome://extensions`.

## What it does

- **Tab Graveyard, not deletion.** "Archiving" a tab saves its title/URL/favicon/date locally and closes it -- it never disappears. Searchable, with Restore and Restore All.
- **Undo.** Archiving, closing, merging duplicates, and grouping all push onto a session-scoped undo stack, surfaced via a toast with one-click Undo. (Clears on browser restart on purpose, rather than pretending to still work.)
- **Duplicate detection.** URLs are normalized (tracking params, trailing slashes stripped) so `example.com/?utm_source=x` and `example.com` are recognized as the same page.
- **Grouping**, scoped per-window so it never merges separate windows together. "Ungroup all" is always one click away.
- **No payment, no premium tier, no third-party library.** Everything is free.
- **Privacy-first.** Everything lives in `chrome.storage.local`/`chrome.storage.session`. No analytics, no trackers. Incognito tabs are skipped entirely.
- Non-shaming language, dark mode, "Stormy morning" blue-gray color scheme, Source Sans Pro title / Satoshi body / JetBrains Mono for numbers.

## File map

```
manifest.json    -- MV3 manifest
background.js    -- service worker: activity tracking, graveyard, duplicates, undo, grouping, notifications, message router
popup.html       -- popup structure
popup.css        -- design tokens + all styling
popup.js         -- renders every panel, handles messaging, tab switching, undo toast
icons/           -- extension icons
```

Everything is plain JS -- no JSX, no TypeScript, no Tailwind, no build tool. If you want to hand this off to someone else or check it into git, this folder is the whole thing.

## Other folders here

- `legacy-v1/` -- the very first vanilla-JS draft, kept for reference
- `react-vite-version-unused/` -- the React/TypeScript/Vite rebuild that came in between. Not used anymore since it needed a build step (`npm install` + `npm run build`). Safe to delete if you don't want to keep it around.

## Roadmap (not built yet)

- Focus Mode ("One Tab at a Time")
- Context Switcher (named workspaces)
- Tab Debt gamification
- Weekly analytics (local-only)
