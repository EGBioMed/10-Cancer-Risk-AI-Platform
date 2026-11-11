function evaluateAttempt(entry, now, { windowMs, maxAttempts }) {
  if (!entry || now - entry.windowStart >= windowMs) {
    return { allowed: true, entry: { windowStart: now, count: 1 } };
  }
  if (entry.count >= maxAttempts) {
    return { allowed: false, entry };
  }
  return { allowed: true, entry: { windowStart: entry.windowStart, count: entry.count + 1 } };
}

// `check` is one step: it asks and it counts. That is right for a limiter
// metering something each call costs us regardless of outcome -- a
// submission, a billed model request.
//
// It is wrong for a credential. Counting every redemption means a code that
// works meters itself: on 2026-11-11 a partner's review link was fetched
// twenty times by link-preview crawlers, which filled the window, and for the
// rest of it nobody could redeem anything anywhere -- the typed form included,
// since they share this bucket. The limiter exists to make guessing expensive,
// and a redemption that succeeds is not a guess.
//
// So `allow` and `record` split the question from the answer, and the caller
// decides what counts. Both are kept: `check` is still what the submit and
// classify limiters want.
function createFixedWindowLimiter({ windowMs, maxAttempts }) {
  const buckets = new Map();
  const isOpen = (entry, now) =>
    !entry || now - entry.windowStart >= windowMs || entry.count < maxAttempts;

  return {
    check(key, now = Date.now()) {
      const result = evaluateAttempt(buckets.get(key), now, { windowMs, maxAttempts });
      buckets.set(key, result.entry);
      return result.allowed;
    },

    // Asks without counting. A caller that is about to do something it may or
    // may not want metered reads this first.
    allow(key, now = Date.now()) {
      return isOpen(buckets.get(key), now);
    },

    // Counts without asking. Called after the fact, for the outcomes the
    // caller decided were worth metering. Recording while already at the
    // ceiling leaves the window where it is rather than extending it, so a
    // blocked caller cannot hold itself blocked for ever by retrying.
    record(key, now = Date.now()) {
      const result = evaluateAttempt(buckets.get(key), now, { windowMs, maxAttempts });
      buckets.set(key, result.entry);
    },
    sweep(now = Date.now()) {
      for (const [key, entry] of buckets) {
        if (now - entry.windowStart >= windowMs) buckets.delete(key);
      }
    }
  };
}

module.exports = { evaluateAttempt, createFixedWindowLimiter };
