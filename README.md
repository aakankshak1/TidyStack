# TidyStack

A local first Chrome extension for tab overload. It detects idle and duplicate tabs, and **archives** tabs instead of discarding them: the tab is closed to free browser memory, and a record of about 0.25 KB is kept so it can be reopened in one click.

Built on Manifest V3 with vanilla JavaScript, no runtime dependencies, and no network access. Requires Chrome 114 or later.

## Why

Heavy tab users keep 50+ tabs open because closing one means losing it. Every open tab keeps a live page in memory, so the cost of that fear grows with each one. TidyStack removes the trade off: a tab can be closed without being lost, and the browser gets its memory back.

## Features

* **Archive (Graveyard).** Saves a tab's title and URL to local storage, then closes it. Searchable, with restore for one tab or many.
* **Idle detection.** Flags tabs unused for a configurable period. They stay open until you archive them. Scheduled automatic archiving is optional.
* **Duplicate merge.** Normalizes URLs, groups tabs that point to the same page, and keeps the newest or the oldest.
* **Topic grouping.** Groups ungrouped tabs by site using native Chrome tab groups, scoped to each window.
* **Undo.** Archive, close, merge and group actions can be reversed through an undo stack that lasts for the browser session.
* **Nudges.** One notification when you pass your tab limit, then at most one reminder every 6 hours.

## How archiving works

Archiving converts a live tab, which holds a page's memory for as long as it is open, into a small serialized record.

### The memory trade

An open tab:

* Lives in a running page: renderer, DOM, JavaScript heap, media.
* Typically uses tens to hundreds of MB, depending on the site.
* 1,000 of them can take several GB.
* Keeps memory and CPU allocated even while idle.

An archived tab:

* Lives as one JSON object in `chrome.storage.local`.
* Takes about **0.25 KB**. A typical entry measures 235 bytes.
* 1,000 of them take about **230 KB**.
* Costs nothing while it waits.

The saving comes from closing the tab. The record is what makes closing it safe.

### Archive flow

1. The popup sends `ARCHIVE_TABS` with the selected tab IDs to the service worker.
2. The worker keeps only `http`, `https`, `ftp` and `file` URLs. Browser internal pages are never touched.
3. It builds one entry per tab: `id`, `title`, `url`, `archivedAt`, `reason`.
4. It writes the entries to `chrome.storage.local` under the graveyard lock.
5. Only after the write succeeds, it calls `chrome.tabs.remove`.
6. It pushes an undo action and returns the entries to the popup.

### Design decisions

* **Save, then close.** Entries are written before any tab is removed. If the write throws, the tabs stay open, so a failed archive never loses a tab.
* **Metadata only.** An entry stores `id`, `title` (clipped to 300 characters), `url`, `archivedAt` and `reason` (`manual` or an automatic trigger). Page contents are never stored. Favicons are not stored either: they are resolved at render time from Chrome's favicon cache.
* **Serialized writes.** Every read, modify, write cycle on the graveyard goes through a promise lock per storage key. Many tab events arrive at once, and without the lock two writers could overwrite each other's changes.
* **Safe restore.** Restore opens the URL in a new tab and removes an entry only if its tab actually opened. A failed open leaves the entry in place. A single request restores at most 50 tabs.
* **Known trade off.** A restored tab is a fresh page load. Scroll position, unsent form input and other state that lived inside the page is not preserved.

```jsonc
// One graveyard entry
{
  "id": "<random uuid>",
  "title": "How to design a REST API: a practical guide | Example Docs",
  "url": "https://docs.example.com/guides/api?section=versioning",
  "archivedAt": 1762315200000,
  "reason": "manual"
}
```

## Architecture

**The service worker owns all state and logic.** The popup is a thin client that talks to it through typed runtime messages:

* `ARCHIVE_TABS`, `CLOSE_TABS`
* `GET_GRAVEYARD`, `RESTORE_ENTRY`, `RESTORE_MANY`, `DELETE_GRAVEYARD_ENTRY`, `CLEAR_GRAVEYARD`
* `GET_DUPLICATES`, `RESOLVE_DUPLICATES`
* `GROUP_BY_TOPIC`, `UNGROUP_ALL`
* `GET_UNDO_STACK`, `UNDO_LAST`
* `GET_SETTINGS`, `SET_SETTINGS`

Messages are checked against the extension's own origin and every payload is validated: ID lists must be integers and are capped at 500, settings are sanitized and clamped, and graveyard listings return at most 200 rows.

**Built for an ephemeral service worker.** An MV3 service worker can be stopped at any time, so nothing important lives in memory. State is kept in storage, periodic work uses `chrome.alarms`, and the alarm is created only if it does not already exist. Creating it again on every wake up would reset its timer, so it might never fire.

**Event sources.** Tab events (activated, updated, created, removed) feed idle tracking and the nudge check. A 15 minute alarm acts as a backup for both.

### Idle detection

Chrome does not expose how long it has been since you used a tab, so TidyStack tracks it:

* A map of `tabId → { firstSeen, lastActive }` lives in `chrome.storage.local`.
* `tabs.onActivated` updates `lastActive`. Writes are throttled to one per 5 seconds for each tab.
* When you switch away from a tab, it is stamped as active at that moment, so a tab you read for hours does not look idle the second you leave it.
* A background tab finishing a load, such as an inbox that refreshes itself, does **not** count as use.
* A tab is idle only if it is not pinned, not the active tab, not playing audio, not on an excluded domain, and past the threshold.

### Duplicate detection

URLs are reduced to host, path and query before comparison:

* Known tracking parameters are removed: `utm_*`, `fbclid`, `gclid`, `msclkid`, `mc_cid`, `mc_eid`, `igshid`. Generic parameters such as `ref` are kept, because they can change which page you get.
* The fragment and any trailing slash are dropped.
* The port is part of the host, so `localhost:3000` and `localhost:5173` are never merged.

### Undo

The undo stack lives in `chrome.storage.session`, which is cleared when the browser restarts, on purpose. It holds the last 10 actions. Undoing an archive restores the same entries, and undoing a grouping ungroups the same tabs.

### Topic grouping

Tabs are keyed by registrable domain, with handling for second level suffixes such as `bbc.co.uk`. Grouping runs per window and never moves tabs across windows. Existing groups are reused by title, and pinned or already grouped tabs are skipped.

## Storage model

* `tidyStackGraveyard` (`local`): archived entries, newest first.
* `tidyStackSettings` (`local`): thresholds, exclusions and toggles.
* `tidyStackActivity` (`local`): `firstSeen` and `lastActive` for each tab.
* `tidyStackNudge` (`local`): last notification state, used for rate limiting.
* `tidyStackUndoStack` (`session`): the last 10 reversible actions.

Migration from the earlier `tabTamer*` keys runs once, and every storage operation waits for it to finish.

## Permissions and privacy

* `tabs`: read titles, URLs and activity; create and remove tabs.
* `tabGroups`: topic grouping with native Chrome groups.
* `storage`: graveyard, settings and activity (local); undo stack (session).
* `unlimitedStorage`: removes the storage quota as a safeguard. At about 0.25 KB per entry, the default quota already fits tens of thousands of archived tabs.
* `alarms`: the 15 minute periodic check, which survives worker restarts.
* `notifications`: the over the limit nudge.
* `favicon`: site icons from Chrome's own cache, with no network requests.

Beyond the permissions:

* No `host_permissions` and no content scripts. TidyStack never reads page contents.
* Extension pages ship a strict Content Security Policy that disallows every network connection, so the UI cannot make network requests.
* No analytics, no accounts, no remote code.
* `incognito: "not_allowed"` keeps the extension out of private windows.

See `PRIVACY.md` for the full statement.

## Install and develop

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. After editing files, press the reload icon on the TidyStack card.

There is no build step and there are no runtime dependencies.

Typography is bundled locally so the popup never contacts a font server. To fetch the font once:

```bash
curl -L -o fonts/manrope.woff2 \
  https://cdn.jsdelivr.net/npm/@fontsource-variable/manrope@5.3.0/files/manrope-latin-wght-normal.woff2
```

Until the file exists the popup falls back to the system font.

## Project structure

```
manifest.json            MV3 manifest, permissions, CSP
background.js            Service worker: all state, storage and tab logic
popup.html, .js, .css    Popup UI, a thin client over runtime messages
themes.js, pixel.js,
critter.js, world.css    UI rendering, drawn at runtime on canvas (no image assets)
PRIVACY.md               What is stored and why
package.sh               Packaging script
```
