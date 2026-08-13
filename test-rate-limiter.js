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

test("createFixedWindowLimiter sweep removes expired buckets", () => {
  const limiter = createFixedWindowLimiter({ windowMs: 1000, maxAttempts: 1 });
  limiter.check("a", 0);
  limiter.sweep(500);
  assert.equal(limiter.check("a", 500), false);
  limiter.sweep(2000);
  assert.equal(limiter.check("a", 2000), true);
});
