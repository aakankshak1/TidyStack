# TidyStack privacy

TidyStack works entirely on your device.

- **No servers, no accounts, no analytics.** The extension makes no network requests. This is enforced in `manifest.json` (`connect-src 'none'`), not just promised.
- **Everything stays in Chrome's local extension storage**: your settings, which tabs were recently active (tab numbers and timestamps only), your archived tabs (title and address), and a short undo list that is wiped when you restart Chrome.
- **Favicons come from Chrome's own local cache.** No site names are sent to Google or anyone else.
- **The font comes from the extension's own files** (or your system font), so opening the popup never contacts a font server.
- **Incognito tabs and browser pages** (`chrome://...`) are never read, saved or touched. The extension is set to `"incognito": "not_allowed"`, so Chrome won't even let it be switched on in Incognito windows.
- **Nothing can reach the extension from a website.** It has no content scripts, no website access, and doesn't accept messages from outside itself. Only its own popup can talk to its background worker, and every request is checked and size-limited.
- **Archived tabs are saved as you saw them.** If a page's address contains a private link or token, the saved copy contains it too. It stays on your device, and you can delete any entry or clear the Graveyard at any time.
- **You control your data.** Delete any archived tab, or clear the whole Graveyard, from the Graveyard tab. Removing the extension deletes everything.

## Why each permission is needed

| Permission | Why |
| --- | --- |
| `tabs` | See tab titles and addresses to find idle tabs and duplicates, and to close, archive and restore them |
| `tabGroups` | Group tabs by topic |
| `storage`, `unlimitedStorage` | Save settings and the Graveyard on your device, so a large Graveyard never runs out of space |
| `alarms` | Run the periodic idle check |
| `notifications` | The tab-count nudge and auto-archive messages |
| `favicon` | Show site icons from Chrome's local cache |
