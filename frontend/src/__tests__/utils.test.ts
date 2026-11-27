// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { getGuestId, guestHeaders } from "../utils/guestId";
import {
  generateConversationTitle,
  shouldUpdateConversationTitle,
} from "../utils/conversationTitles";
import { AcademicYearCycle } from "../utils/academicYearHelper";

const storageMap = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
    setItem: (k: string, v: string) => storageMap.set(k, String(v)),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  },
  configurable: true,
});

describe("guestId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates and persists a valid per-browser guest id", () => {
    const first = getGuestId();
    expect(first).toMatch(/^guest_[A-Za-z0-9_-]{8,64}$/);
    expect(getGuestId()).toBe(first);
    expect(guestHeaders()).toEqual({ "X-Guest-Id": first });
  });

  it("replaces malformed stored guest ids", () => {
    localStorage.setItem("cerkyl-guest-id", "bad-id");
    const regenerated = getGuestId();
    expect(regenerated).toMatch(/^guest_[A-Za-z0-9_-]{8,64}$/);
    expect(regenerated).not.toBe("bad-id");
  });
});

describe("generateConversationTitle", () => {
  it("builds a clean title from the first user message", () => {
    const title = generateConversationTitle(
      "What is the cut-off point for Computer Science at UG?",
    );
    expect(title.length).toBeGreaterThan(5);
    expect(title.toLowerCase()).toContain("computer science");
  });

  it("uses university context when provided", () => {
    expect(generateConversationTitle("", "KNUST")).toBe("KNUST Admissions");
  });

  it("uses assessment interests when assessmentData is given", () => {
    expect(
      generateConversationTitle("", undefined, {
        interests: ["Medicine", "Biology", "Chemistry"],
      }),
    ).toBe("Assessment: Medicine, Biology");
  });

  it("replaces General Greeting once the student asks a real question", () => {
    expect(shouldUpdateConversationTitle("New Conversation", "hi")).toBe(false);
    expect(shouldUpdateConversationTitle("New Conversation", "hello there")).toBe(false);
    expect(
      shouldUpdateConversationTitle("General Greeting", "What is KNUST CS cut-off?"),
    ).toBe(true);
    expect(
      shouldUpdateConversationTitle("KNUST Computer Science", "What about fees?"),
    ).toBe(false);
  });
});

describe("AcademicYearCycle", () => {
  it("returns consecutive academic year strings", () => {
    const current = AcademicYearCycle.getCurrentYear();
    const [start, end] = current.split("/").map(Number);
    expect(end).toBe(start + 1);
    expect(AcademicYearCycle.getPreviousYear()).toBe(`${start - 1}/${end - 1}`);
    expect(AcademicYearCycle.getNextYear()).toBe(`${start + 1}/${end + 1}`);
  });
});

