import type { Message } from "./types";

export function send<T = any>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
