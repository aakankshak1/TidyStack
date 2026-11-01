# Tab Tamer

A calm, privacy-first Chrome extension for tab management. Built on React + TypeScript + Tailwind CSS, following the `tab-tamer` skill's product and design direction: nothing is ever silently deleted, every destructive action is reversible, and the copy never shames you for having a lot of tabs open.

Fully free -- no payment, no premium tier, no third-party payment library. Every feature (auto-archive on a schedule, per-site "never mark stale" exceptions, grouping, duplicate detection, the Graveyard) is available to everyone.

## Design notes (why it doesn't look templated)

The first pass technically followed the skill's stack and color rules but still read as generic AI output: stock shadcn components with a palette swap, and a three-segment progress bar for the health indicator -- a very common "AI dashboard" cliché. This pass fixes that:

- **Signature element**: a small hand-drawn-feeling "fan" of tab shapes (`TabFan.tsx`) built from your actual tab mix, replacing the generic progress bar. It's the one deliberate visual risk; everything else stays quiet around it.
- **Custom wordmark**: a small two-tab "knot" mark next to the title instead of an emoji or plain bold text.
- **Empty states have small line-art illustrations** (an archive-box-with-arrow for the Graveyard, two overlapping squares with a check for Duplicates) instead of plain gray placeholder text.
- **Motion tied to meaning**: archiving/closing a tab now visibly "settles" (fade + slight downward rotate) rather than an instant disappear or generic fade.
- **Tab indicator** uses a small dot rather than the default full-width underline every shadcn tab bar has.
- **Richer, more deliberate palette** (moss/honey/clay) rather than a pastel earth-tone set -- avoids all three flagged AI-design clichés (warm-cream+terracotta, near-black+neon, broadsheet hairlines).

## What changed from the original vanilla-JS version (see `legacy-v1/`)

- **Tab Graveyard, not deletion.** "Archiving" a tab saves its title/URL/favicon/date locally and closes it -- it never disappears. The Graveyard tab is searchable, with Restore and Restore All.
- **Undo, everywhere.** Archiving, closing, merging duplicates, and grouping all push onto a session-scoped undo stack, surfaced via a toast with one-click Undo. (Stored in `chrome.storage.session`, so it honestly stops offering undo after a browser restart instead of pretending to.)
- **Duplicate detection.** URLs are normalized (tracking params, trailing slashes stripped) so `example.com/?utm_source=x` and `example.com` are recognized as the same page. Resolve by keeping the newest or oldest copy.
- **Non-shaming language** throughout -- no "stale tabs" alarm copy.
- **Grouping fixed at the architecture level.** Scoped per-window so it can't regress into merging separate windows together (a real bug in v1). "Ungroup all" is always one click away.
- **Privacy-first by default.** Everything lives in `chrome.storage.local`/`chrome.storage.session`. No analytics, no third-party trackers. Incognito tabs are skipped entirely.
- **Accessibility basics.** Visible focus rings, `prefers-reduced-motion` respected, dark mode (system-matched or manual).
- **No payment system.** Everything is free; there's no ExtPay, no Stripe, no Razorpay, no gated features anywhere.

## Roadmap (intentionally not built yet)

Per the skill's own "favor polished fundamentals over feature sprawl":

- **Focus Mode ("One Tab at a Time")** -- gentle nudge before opening a new tab
- **Context Switcher** -- named workspaces (Work / Coding / Research) you can save and restore
- **Tab Debt gamification** -- a satisfying-not-punishing score for reducing unread tabs
- **Weekly analytics** -- tabs archived, time saved, most-visited/most-ignored domains, all local-only

## Project structure

```
src/
  background/     -- MV3 service worker: activity tracking, graveyard, duplicates,
                     undo, grouping, notifications, message router
  components/      -- React UI (ui/ has the shadcn-style primitives)
  lib/             -- types, cn() utility, typed messaging wrapper
  popup/           -- popup entry (App.tsx, main.tsx, index.html)
  styles/          -- design tokens + Tailwind entry
manifest.config.ts -- MV3 manifest (built with @crxjs/vite-plugin)
public/icons/      -- extension icons (currently reused from v1 -- see note below)
```

`_delete-me-payment-removed/` holds the old ExtPay/premium files that are no longer wired into anything -- safe to delete that whole folder whenever you like.

## One manual step: icons

`public/icons/` currently still has the old v1 icon colors (indigo), since binary files can't be written directly through this tool. If you want the icons to match the new moss-green palette, ask and new ones can be generated for you to drop in -- same filenames, so no code changes needed.

## Develop

```bash
npm install
npm run dev     # watches and rebuilds into dist/ for chrome://extensions "Load unpacked"
npm run build   # one-off production build
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode on).
