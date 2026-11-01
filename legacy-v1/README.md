# Tab Tamer

A Chrome extension that watches how many tabs you have open, groups them by topic (domain), and helps you bookmark-and-close or just close tabs you haven't touched in a while.

## How it works

- **Activity tracking**: `background.js` listens for tab activation/updates and stores a `lastActive` timestamp per tab in `chrome.storage.local`.
- **Staleness**: a tab is "stale" if it's unpinned and hasn't been active for longer than `staleHours` (default 3h, configurable in the popup's ⚙️ settings).
- **Threshold check**: every 15 minutes (via `chrome.alarms`), it checks total tab count against your `threshold` (default 30). If exceeded, it fires a notification and — if `autoGroup` is on — automatically groups tabs into native Chrome tab groups by domain (e.g. all `github.com` tabs get grouped and labeled "Github").
- **Popup actions**: click the extension icon any time to see your stale tabs sorted by idle time, and bookmark-and-close or close them individually or in bulk. Bookmarks go into a `Tab Tamer / Stale tabs — <date>` folder so nothing is lost.

## Load it in Chrome (unpacked, for development)

1. Open `chrome://extensions`
2. Toggle on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `tab-tamer` folder
5. Pin the extension for easy access (puzzle-piece icon → pin)

That's it — no build step, no API keys, no backend.

## Customize

- **Grouping logic**: `topicKeyForUrl()` in `background.js` currently groups by registrable domain (e.g. `docs.google.com` → `google.com`). Swap in keyword-based title clustering, or call an LLM to name/group topics more semantically if you want smarter clusters.
- **Threshold/stale hours**: adjustable live from the popup's settings panel, stored in `chrome.storage.local`.
- **Notification cadence**: change `periodInMinutes` in the `chrome.alarms.create` call in `background.js`.
- **Icons**: replace the files in `icons/` with your own branding (16/48/128px PNGs).

## Possible next steps

- Cross-window support polish (currently works across all windows already, since `chrome.tabs.query({})` isn't window-scoped)
- Smarter topic naming using an LLM call on tab titles instead of just domain
- A "snooze" option per tab so it's not flagged stale again for N hours
- Export stale-tab bookmarks as a shareable reading list
