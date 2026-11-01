const PLAYFUL_THRESHOLD_LINES = [
  (n: number) => `You've adopted ${n} tabs. They miss you.`,
  (n: number) => `${n} tabs and counting -- someone's popular.`,
  (n: number) => `Your tabs are starting a small retirement home. ${n} residents so far.`
];

const PLAIN_THRESHOLD_LINE = (n: number) => `You have ${n} tabs open.`;

const PLAYFUL_CLEANUP_LINES = [
  (n: number) => `Archived ${n} tab${n === 1 ? "" : "s"} that had officially graduated.`,
  (n: number) => `Tucked ${n} idle tab${n === 1 ? "" : "s"} into the Graveyard for you.`
];

const PLAIN_CLEANUP_LINE = (n: number) =>
  `Archived ${n} idle tab${n === 1 ? "" : "s"}. Nothing was deleted -- find it in the Graveyard.`;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function thresholdMessage(count: number, playful: boolean): string {
  return playful ? pick(PLAYFUL_THRESHOLD_LINES)(count) : PLAIN_THRESHOLD_LINE(count);
}

export function cleanupMessage(count: number, playful: boolean): string {
  return playful ? pick(PLAYFUL_CLEANUP_LINES)(count) : PLAIN_CLEANUP_LINE(count);
}

export async function notify(id: string, title: string, message: string): Promise<void> {
  try {
    await chrome.notifications.create(id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message,
      priority: 0
    });
  } catch (e) {
    // Notifications permission can be revoked by the user at any time --
    // fail silently rather than break the underlying feature.
    console.warn("Tab Tamer: notification failed", e);
  }
}
