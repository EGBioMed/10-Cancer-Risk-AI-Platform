function evaluateAttempt(entry, now, { windowMs, maxAttempts }) {
  if (!entry || now - entry.windowStart >= windowMs) {
    return { allowed: true, entry: { windowStart: now, count: 1 } };
  }
  if (entry.count >= maxAttempts) {
    return { allowed: false, entry };
  }
  return { allowed: true, entry: { windowStart: entry.windowStart, count: entry.count + 1 } };
}

function createFixedWindowLimiter({ windowMs, maxAttempts }) {
  const buckets = new Map();
  return {
    check(key, now = Date.now()) {
      const result = evaluateAttempt(buckets.get(key), now, { windowMs, maxAttempts });
      buckets.set(key, result.entry);
      return result.allowed;
    },
    sweep(now = Date.now()) {
      for (const [key, entry] of buckets) {
        if (now - entry.windowStart >= windowMs) buckets.delete(key);
      }
    }
  };
}

module.exports = { evaluateAttempt, createFixedWindowLimiter };
