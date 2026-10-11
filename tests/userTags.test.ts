import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  addTag,
  clearUser,
  getTags,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_USER,
  removeTag,
  serverKeyFromBaseUrl,
  setTags,
  STORAGE_KEY,
  tagsMatchQuery,
} from "../src/lib/userTags.ts";

const mem = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mem.set(key, value);
    },
    removeItem: (key: string) => {
      mem.delete(key);
    },
    clear: () => mem.clear(),
  },
});

beforeEach(() => {
  mem.clear();
});

test("server key is the origin, and tags stay on that server", () => {
  assert.equal(
    serverKeyFromBaseUrl("https://Admin.Example:443/admin"),
    "https://admin.example",
  );
  addTag("https://a.example", "Ada@A.Example", "Family");
  addTag("https://b.example", "ada@a.example", "Other");
  assert.deepEqual(getTags("https://a.example", "ada@a.example"), ["Family"]);
  assert.deepEqual(getTags("https://b.example", "ada@a.example"), ["Other"]);
});

test("tags are trimmed, deduped, capped, and never stored empty", () => {
  const server = "https://relay.example";
  const user = "ada@relay.example";
  assert.deepEqual(addTag(server, user, "   "), []);
  assert.deepEqual(addTag(server, user, "  family   friend  "), [
    "family friend",
  ]);
  assert.deepEqual(addTag(server, user, "FAMILY FRIEND"), ["family friend"]);
  const long = "x".repeat(MAX_TAG_LENGTH + 20);
  const stored = addTag(server, user, long);
  assert.equal(stored[1].length, MAX_TAG_LENGTH);
  for (let i = 0; i < MAX_TAGS_PER_USER + 3; i++) {
    addTag(server, user, `tag-${i}`);
  }
  const tags = getTags(server, user);
  assert.equal(tags.length, MAX_TAGS_PER_USER);
  assert.equal(tagsMatchQuery(server, user, "tag-0"), true);
  assert.equal(tagsMatchQuery(server, user, "missing"), false);
  removeTag(server, user, tags[0]);
  assert.equal(getTags(server, user).length, MAX_TAGS_PER_USER - 1);
  clearUser(server, user);
  assert.deepEqual(getTags(server, user), []);
  assert.equal(mem.has(STORAGE_KEY), false);
});

test("corrupt storage is ignored and a failed delete does not depend on the server", () => {
  mem.set(STORAGE_KEY, "{not json");
  assert.deepEqual(getTags("https://a.example", "ada@a.example"), []);
  setTags("https://a.example", "ada@a.example", ["Alex"]);
  const raw = mem.get(STORAGE_KEY) ?? "";
  assert.equal(raw.includes("Alex"), true);
  assert.equal(raw.includes("password"), false);
});
