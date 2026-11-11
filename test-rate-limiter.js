const assert = require("node:assert/strict");
const test = require("node:test");
const { evaluateAttempt, createFixedWindowLimiter } = require("./lib/rate-limiter");

test("evaluateAttempt allows attempts under the limit and starts a fresh window", () => {
  const config = { windowMs: 1000, maxAttempts: 3 };
  const first = evaluateAttempt(undefined, 0, config);
  assert.equal(first.allowed, true);
  assert.deepEqual(first.entry, { windowStart: 0, count: 1 });

  const second = evaluateAttempt(first.entry, 100, config);
  assert.equal(second.allowed, true);
  assert.deepEqual(second.entry, { windowStart: 0, count: 2 });
});

test("evaluateAttempt denies once the limit is reached within the window", () => {
  const config = { windowMs: 1000, maxAttempts: 2 };
  let entry = evaluateAttempt(undefined, 0, config).entry;
  entry = evaluateAttempt(entry, 100, config).entry;
  const third = evaluateAttempt(entry, 200, config);
  assert.equal(third.allowed, false);
  assert.deepEqual(third.entry, entry);
});

test("evaluateAttempt allows again once the window has elapsed", () => {
  const config = { windowMs: 1000, maxAttempts: 1 };
  const entry = evaluateAttempt(undefined, 0, config).entry;
  const denied = evaluateAttempt(entry, 500, config);
  assert.equal(denied.allowed, false);
  const allowedAgain = evaluateAttempt(entry, 1000, config);
  assert.equal(allowedAgain.allowed, true);
  assert.deepEqual(allowedAgain.entry, { windowStart: 1000, count: 1 });
});

test("createFixedWindowLimiter tracks independent buckets per key", () => {
  const limiter = createFixedWindowLimiter({ windowMs: 1000, maxAttempts: 2 });
  assert.equal(limiter.check("a", 0), true);
  assert.equal(limiter.check("a", 100), true);
  assert.equal(limiter.check("a", 200), false);
  assert.equal(limiter.check("b", 200), true);
});

// The 2026-11-11 split. `check` asks and counts in one step, which is right
// for something every call costs us. For a credential it is wrong: a code
// that works would meter itself, and on that day twenty link-preview fetches
// of one working link filled the window for everybody, the typed form
// included, because they share a bucket.
test("allow asks without counting", () => {
  const limiter = createFixedWindowLimiter({ windowMs: 1000, maxAttempts: 2 });
  for (let i = 0; i < 50; i += 1) assert.equal(limiter.allow("a", 0), true);
  // Fifty questions later the bucket is still empty, so two real attempts
  // remain -- which is the whole point.
  assert.equal(limiter.check("a", 0), true);
  assert.equal(limiter.check("a", 0), true);
  assert.equal(limiter.allow("a", 0), false);
});

test("record counts without asking, and stays per key", () => {
  const limiter = createFixedWindowLimiter({ windowMs: 1000, maxAttempts: 2 });
  limiter.record("a", 0);
  assert.equal(limiter.allow("a", 0), true);
  limiter.record("a", 0);
  assert.equal(limiter.allow("a", 0), false);
  assert.equal(limiter.allow("b", 0), true, "one key's failures blocked another key");
});

// A caller that is already blocked keeps knocking. If each knock extended the
// window, the window would never empty and the block would be permanent.
test("recording while blocked does not extend the window", () => {
  const limiter = createFixedWindowLimiter({ windowMs: 1000, maxAttempts: 1 });
  limiter.record("a", 0);
  assert.equal(limiter.allow("a", 0), false);
  for (const t of [100, 300, 600, 900]) limiter.record("a", t);
  assert.equal(limiter.allow("a", 999), false);
  assert.equal(limiter.allow("a", 1000), true, "the window did not end on time");
});

test("allow after the window has elapsed sees a fresh bucket", () => {
  const limiter = createFixedWindowLimiter({ windowMs: 1000, maxAttempts: 1 });
  limiter.record("a", 0);
  assert.equal(limiter.allow("a", 500), false);
  assert.equal(limiter.allow("a", 1500), true);
});

test("createFixedWindowLimiter sweep removes expired buckets", () => {
  const limiter = createFixedWindowLimiter({ windowMs: 1000, maxAttempts: 1 });
  limiter.check("a", 0);
  limiter.sweep(500);
  assert.equal(limiter.check("a", 500), false);
  limiter.sweep(2000);
  assert.equal(limiter.check("a", 2000), true);
});
