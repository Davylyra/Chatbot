import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

import { normalizeUserId, userIdFilter } from "../src/utils/userId.js";
import { loadSharedUniversities, clearUniversityCache } from "../src/utils/universityDataLoader.js";
import { parseCliArgs, TARGET_COLLECTIONS } from "../src/scripts/migrateUserIds.js";
import { matchUniversitiesToProfile } from "../src/utils/universityMatcher.js";
import authMiddleware from "../src/middleware/authMiddleware.js";
import { validateChatPayload } from "../src/middleware/inputValidation.js";

test("userId helpers normalize ObjectIds and build backward-compatible filters", () => {
  const oid = new ObjectId();
  const hex = oid.toHexString();
  assert.equal(normalizeUserId(oid), hex);
  assert.equal(normalizeUserId(`  ${hex}  `), hex);
  assert.equal(normalizeUserId("guest_abc12345"), "guest_abc12345");

  const oidFilter = userIdFilter(hex);
  assert.ok(Array.isArray(oidFilter.user_id.$in));
  assert.equal(oidFilter.user_id.$in[0], hex);
  assert.equal(oidFilter.user_id.$in[1].toHexString(), hex);

  const guestFilter = userIdFilter("guest_abc12345");
  assert.deepEqual(guestFilter, { user_id: "guest_abc12345" });
});

test("universityDataLoader loads shared JSON universities and matcher scores profiles", () => {
  clearUniversityCache();
  const unis = loadSharedUniversities();
  assert.ok(unis.length >= 10, `Expected >= 10 universities, got ${unis.length}`);
  assert.equal(unis[0].source, "shared_json");

  const matches = matchUniversitiesToProfile({
    subjects: ["Mathematics", "Physics", "Chemistry"],
    shsProgram: "General Science",
    wassceGrade: "10",
    interests: ["Computer Science", "Engineering"],
    careerGoals: "Software Engineering",
    preferredLocation: "Kumasi",
  });
  assert.ok(matches.length > 0, "Expected at least one university match");
});

test("migrateUserIds defaults to dry-run and requires explicit --apply", () => {
  assert.deepEqual(parseCliArgs([]), { apply: false, dryRun: true });
  assert.deepEqual(parseCliArgs(["--dry-run"]), { apply: false, dryRun: true });
  assert.deepEqual(parseCliArgs(["--apply"]), { apply: true, dryRun: false });
  assert.deepEqual(parseCliArgs(["--apply", "--dry-run"]), { apply: false, dryRun: true });
  assert.ok(TARGET_COLLECTIONS.includes("messages"));
  assert.ok(TARGET_COLLECTIONS.includes("user_profiles"));
});

test("authMiddleware rejects missing/invalid JWT and accepts valid JWT", () => {
  const prevSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "unit-test-jwt-secret";
  try {
    const makeRes = () => {
      const res = { statusCode: 200, body: null };
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.body = data;
        return res;
      };
      return res;
    };

    // Missing header -> 401
    const res1 = makeRes();
    let nextCalled = false;
    authMiddleware({ headers: {} }, res1, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res1.statusCode, 401);

    // Valid token -> calls next and populates req.user
    const token = jwt.sign({ id: "user-123", email: "test@gmail.com" }, process.env.JWT_SECRET);
    const req2 = { headers: { authorization: `Bearer ${token}` } };
    const res2 = makeRes();
    authMiddleware(req2, res2, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req2.user.id, "user-123");
  } finally {
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  }
});

test("validateChatPayload rejects empty message and accepts valid payload", () => {
  const makeRes = () => {
    const res = { statusCode: 200, body: null };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.body = data;
      return res;
    };
    return res;
  };

  const resBad = makeRes();
  let nextCalled = false;
  validateChatPayload({ body: { message: "", conversation_id: "c1" } }, resBad, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(resBad.statusCode, 400);

  const resOk = makeRes();
  validateChatPayload(
    { body: { message: "What is UG cut-off for CS?", conversation_id: "c1" } },
    resOk,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, true);
});

test("Paystack HMAC-SHA512 signature verification matches raw body", () => {
  const secret = "sk_test_paystack_secret";
  const rawBody = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "ref_1" } }));
  const validSig = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const forgedSig = crypto.createHmac("sha512", "wrong").update(rawBody).digest("hex");

  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  assert.equal(validSig, expected);
  assert.notEqual(forgedSig, expected);
});

