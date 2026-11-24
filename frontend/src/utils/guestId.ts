// A private, per-browser id for visitors who aren't logged in. The backend
// only returns guest conversations saved under this id, so guests can never
// see anyone else's chats.
const GUEST_ID_KEY = "cerkyl-guest-id";

const randomPart = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

export const getGuestId = (): string => {
  try {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing && /^guest_[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const created = `guest_${randomPart()}`;
    localStorage.setItem(GUEST_ID_KEY, created);
    return created;
  } catch {
    // Storage blocked: fall back to an id that lasts for this page load only.
    return `guest_${randomPart()}`;
  }
};

export const guestHeaders = (): Record<string, string> => ({
  "X-Guest-Id": getGuestId(),
});
