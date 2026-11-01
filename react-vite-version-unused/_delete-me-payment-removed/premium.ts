import ExtPay from "../lib/ExtPay";

// Sign up at https://extensionpay.com, register an extension there, and
// replace this id with the one you're given. It's a slug, not a secret.
export const EXTPAY_ID = "tab-tamer";

export const extpay = ExtPay(EXTPAY_ID);

export async function isPremiumUser(): Promise<boolean> {
  try {
    const user = await extpay.getUser();
    return !!user.paid;
  } catch (e) {
    console.warn("Tab Tamer: premium status check failed, defaulting to free tier", e);
    return false;
  }
}
