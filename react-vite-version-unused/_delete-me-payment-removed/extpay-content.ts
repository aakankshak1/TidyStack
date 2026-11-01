// Required by ExtPay: this content script runs on extensionpay.com pages
// and relays "payment complete" events back to our background service worker.
// It does not run anywhere else and has no access to your browsing data.
import "../lib/ExtPay";
