import { ObjectId } from "mongodb";

const OBJECT_ID_HEX = /^[a-fA-F0-9]{24}$/;

/**
 * Canonical string representation for `user_id` on all new writes.
 * Keeps guest IDs ("guest_..."), "anonymous", and ObjectId hex strings as strings.
 */
export function normalizeUserId(id) {
  if (id == null) return "";
  if (typeof id === "string") return id.trim();
  if (typeof id.toHexString === "function") return id.toHexString();
  return String(id).trim();
}

/**
 * Backward-compatible MongoDB query filter matching both string and ObjectId
 * forms of `user_id` during the migration window.
 */
export function userIdFilter(id, field = "user_id") {
  const canonical = normalizeUserId(id);
  if (!canonical) return { [field]: "" };

  const candidates = [canonical];
  if (OBJECT_ID_HEX.test(canonical)) {
    try {
      candidates.push(new ObjectId(canonical));
    } catch {
      // keep string candidate only
    }
  }

  return candidates.length > 1
    ? { [field]: { $in: candidates } }
    : { [field]: canonical };
}

