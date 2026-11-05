# TidyStack

**A pixel art Chrome extension for a clutter free browsing experience.**

TidyStack helps you manage tab overload by identifying idle tabs, safely archiving tabs for later, finding duplicates, and organizing tabs by topic.

With a playful pixel art interface, seasonal themes, and a tiny companion named Pip, tab management becomes a little more fun.

## Features

- **Idle Tab Detection:** Identifies tabs that haven't been used for a configurable period.
- **Smart Archiving:** Archive tabs without losing track of them. Their metadata is saved locally before the tabs are closed.
- **Graveyard:** Search, restore, or permanently delete archived tabs whenever you need.
- **Duplicate Detection:** Find duplicate URLs and choose whether to keep the newest or oldest tab.
- **Automatic Grouping:** Organize tabs by website using Chrome's native tab groups.
- **Automatic Archiving:** Optionally archive idle tabs on a periodic schedule.
- **Undo:** Reverse recent archive, close, duplicate cleanup, and grouping actions during the browser session.
- **Personalization:** Choose seasonal themes, enjoy pixel art animations, and interact with Pip.

## Installation

TidyStack requires **Google Chrome 114 or later**.

1. Clone this repository:
   ```bash
   git clone https://github.com/aakankshak1/TidyStack.git
   ```
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the cloned TidyStack folder.

## How to Use

TidyStack has four main sections:

**1. Overview**

View idle tabs and choose to archive or close them. You can also group open tabs by topic.

**2. Duplicates**

Find repeated pages and choose whether to keep the newest or oldest instance.

**3. Graveyard**

Browse and search archived tabs. Restore individual tabs or multiple tabs, or delete entries you no longer need.

**4. Settings**

Customize your idle threshold, excluded domains, automatic archiving, notifications, themes, Pip, and seasonal sounds.

## How It Works

TidyStack uses a metadata based archiving system instead of preserving entire webpages.

When you archive a tab:

1. The extension captures its URL and page title.
2. It creates a lightweight metadata entry containing the URL, title, timestamp, and archive reason.
3. The entry is saved in `chrome.storage.local`.
4. Only after the save succeeds does TidyStack close the original browser tab.

When restoring a tab, TidyStack reads its saved URL and opens it in a new Chrome tab. The archive entry is removed only after the tab is successfully opened.

**Important:** Archived tabs are restored as fresh page loads. Page contents, scroll position, and unsaved form data are not preserved.

## Technical Overview

TidyStack is built using:

- **JavaScript:** Core functionality and extension logic.
- **HTML & CSS:** Popup interface and styling.
- **Chrome Extension APIs:** Tab management, storage, notifications, alarms, and native tab grouping.
- **Canvas API:** Runtime generation of pixel art, custom icons, seasonal environments, and Pip.

### Architecture

TidyStack follows the **Manifest V3** extension architecture.

- **Background Service Worker:** Handles tab activity tracking, archiving, restoration, duplicate detection, grouping, and scheduled tasks.
- **Popup Interface:** Provides the user interface and communicates with the service worker through Chrome runtime messaging.
- **Chrome Storage:** Maintains archived tabs, settings, and activity information locally. Session storage is used for the undo stack.

### Key Technical Features

- **Safe Archiving:** Uses a save before close approach to prevent data loss when storage operations fail.
- **Idle Tracking:** Tracks tab activity through Chrome tab events and periodically checks idle status using `chrome.alarms`.
- **Duplicate Normalization:** Normalizes URLs by removing common tracking parameters before comparing tabs.
- **Serialized Storage Operations:** Uses promise based locks to prevent concurrent read and write operations from overwriting each other.
- **Service Worker Resilience:** Keeps important state in storage rather than relying on the service worker remaining active.
- **Custom Pixel Art:** Generates interface graphics and seasonal environments at runtime using Canvas instead of relying on pre-rendered image assets.

There is no build step or runtime dependency installation required.

## **Privacy & Security**

TidyStack is designed with a local first approach. All tab management and data processing happen within the browser, without relying on external servers or third party services.

**No External Communication:** TidyStack does not use accounts, analytics, trackers, or remote code. It has no host permissions or content scripts, and its extension page Content Security Policy explicitly sets `connect-src 'none'` to prevent external network connections.

**Local Data Storage:** Archived tab URLs, titles, settings, and activity timestamps are stored in Chrome's `chrome.storage.local`. The undo stack uses `chrome.storage.session`, keeping reversible actions limited to the browser session.

**Minimal Data Collection:** TidyStack stores tab metadata rather than webpage contents. It does not read page DOM elements, extract form data, or capture browsing content. Favicons are retrieved from Chrome's local favicon cache, and interface assets and fonts are bundled locally.

**User Control:** Archived entries can be individually deleted or cleared entirely from the Graveyard. Removing the extension also removes its locally stored extension data.

**A Note About Archived URLs:** TidyStack preserves the original URL when archiving a tab. Some URLs may contain private tokens or sensitive query parameters. These remain stored locally in Chrome and are never transmitted to an external server.

**Chrome Permissions:** TidyStack uses the `tabs`, `tabGroups`, `storage`, `unlimitedStorage`, `alarms`, `notifications`, and `favicon` permissions exclusively for its tab management, persistence, scheduling, notification, and interface functionality.

For additional details, see PRIVACY.md.
