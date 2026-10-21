import test from "node:test";
import assert from "node:assert/strict";
import { pickNextDay } from "./nextDay.js";

const day = (deck_index, status = "available") => ({ deck_index, status });

test("returns the next published day when one follows", () => {
  const next = pickNextDay([day(9, "completed"), day(10)], 9);
  assert.equal(next?.deck_index, 10);
});

test("returns null when every later day is completed", () => {
  assert.equal(pickNextDay([day(9, "completed"), day(10, "completed")], 9), null);
});

test("returns null when no day follows the current one", () => {
  assert.equal(pickNextDay([day(8, "completed"), day(9, "completed")], 9), null);
});

test("skips completed days and picks the nearest unread one", () => {
  assert.equal(pickNextDay([day(10, "completed"), day(11)], 9)?.deck_index, 11);
  assert.equal(pickNextDay([day(11), day(10)], 9)?.deck_index, 10);
});

test("returns null for a missing or non-integer deck index", () => {
  assert.equal(pickNextDay([day(10)], null), null);
  assert.equal(pickNextDay([day(10)], undefined), null);
});

test("ignores malformed day entries", () => {
  assert.equal(pickNextDay([{ status: "available" }, day(10)], 9)?.deck_index, 10);
  assert.equal(pickNextDay(null, 9), null);
});
