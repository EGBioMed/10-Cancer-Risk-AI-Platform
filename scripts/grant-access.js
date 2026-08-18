const crypto = require("crypto");
const { generateRawToken, hashToken, normalizeCode, MIN_CODE_LENGTH, MAX_CODE_LENGTH } = require("../lib/access-gate");
const { argument, createAccessGateRepository } = require("./cli-helpers");

const USAGE = "Usage: node scripts/grant-access.js --created-by <name> "
  + "[--type link|code] [--provider <name>] [--reference <text>] [--notes <text>] "
  + "[--ttl-hours <n>] [--max-uses <n>] [--confirm-remote-host]\n"
  + "  --type link (default): personal one-time link.\n"
  + "  --type code: shared quota code. Requires --max-uses, and either\n"
  + "    --code <string> (use exactly as given) or --institution <code>\n"
  + "    [--quota-label <code>] (system-composes institutionQuotaLabelQ<maxUses><random>,\n"
  + "    e.g. --institution SCH --quota-label B1 --max-uses 100 -> SCHB1Q100XXXXXX).";

// Avoids visually ambiguous characters (0/O, 1/I/L) since front-desk staff
// read this off a screen or printout to type or hand over.
const RANDOM_SUFFIX_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateRandomSuffix(length = 6) {
  let suffix = "";
  for (let i = 0; i < length; i += 1) {
    suffix += RANDOM_SUFFIX_ALPHABET[crypto.randomInt(RANDOM_SUFFIX_ALPHABET.length)];
  }
  return suffix;
}

// Parses and validates all DB-independent input up front, so a bad flag
// combination fails immediately instead of after initiating a (possibly
// slow) database connection.
function prepareLinkGrant() {
  const ttlHours = Number(argument("--ttl-hours") || 1);
  const maxUses = Number(argument("--max-uses") || 1);
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error("--ttl-hours must be a positive number.");
  }
  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    throw new Error("--max-uses must be a positive integer.");
  }

  const publicBaseUrl = process.env.PUBLIC_BASE_URL || "";
  if (!publicBaseUrl) {
    console.error("Warning: PUBLIC_BASE_URL is not set. Printing a path-only link.");
  }

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  return {
    grantInput: { tokenHash: hashToken(rawToken), expiresAt, maxUses },
    printResult(grant) {
      console.log("Access link created. This is the only time the raw token is shown:");
      console.log(`${publicBaseUrl}/access/${rawToken}`);
      console.log(`grant_id: ${grant.grantId}`);
      console.log(`expires_at: ${grant.expiresAt}`);
    }
  };
}

function prepareCodeGrant() {
  const maxUsesArg = argument("--max-uses");
  if (!maxUsesArg) {
    throw new Error("--max-uses is required for --type code.");
  }
  const maxUses = Number(maxUsesArg);
  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    throw new Error("--max-uses must be a positive integer.");
  }

  let expiresAt = null;
  const ttlHoursArg = argument("--ttl-hours");
  if (ttlHoursArg) {
    const ttlHours = Number(ttlHoursArg);
    if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
      throw new Error("--ttl-hours must be a positive number.");
    }
    expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  }

  const exactCode = argument("--code");
  const institution = argument("--institution");
  const quotaLabel = argument("--quota-label") || "";

  let rawCode;
  if (exactCode) {
    rawCode = exactCode;
  } else if (institution) {
    // Generated production codes are English/alphanumeric only, with no
    // separator between segments -- avoids relying on non-ASCII text
    // surviving every layer between minting and typing (terminals, printed
    // slips, kiosk keyboards) intact. The purchased quota is always baked
    // in as "Q<maxUses>", derived directly from --max-uses rather than
    // left for the operator to type (and possibly mistype or forget) into
    // --quota-label, so the visible number always matches the real quota.
    const ALPHANUMERIC_ONLY = /^[A-Za-z0-9]*$/;
    if (!ALPHANUMERIC_ONLY.test(institution) || !ALPHANUMERIC_ONLY.test(quotaLabel)) {
      throw new Error("--institution and --quota-label must be English letters/digits only.");
    }
    rawCode = `${institution}${quotaLabel}Q${maxUses}${generateRandomSuffix()}`;
  } else {
    throw new Error(
      "--type code requires either --code <string> or --institution <code> (optionally with --quota-label <code>)."
    );
  }

  const normalized = normalizeCode(rawCode);
  if (!normalized) {
    throw new Error(
      `--code failed normalization (min ${MIN_CODE_LENGTH}, max ${MAX_CODE_LENGTH} chars after trimming/lowercasing/whitespace collapse).`
    );
  }

  return {
    grantInput: {
      tokenHash: hashToken(normalized),
      expiresAt,
      maxUses,
      credentialType: "code",
      code: normalized
    },
    printResult(grant) {
      console.log("Access code created:");
      console.log(normalized);
      console.log(`grant_id: ${grant.grantId}`);
      console.log(`max_uses: ${maxUses}`);
      console.log(`expires_at: ${grant.expiresAt || "never"}`);
    }
  };
}

async function main() {
  const type = argument("--type") || "link";
  if (!["link", "code"].includes(type)) {
    throw new Error("--type must be 'link' or 'code'.");
  }
  const createdBy = argument("--created-by");
  if (!createdBy) {
    throw new Error(USAGE);
  }
  const provider = argument("--provider") || "manual";
  const reference = argument("--reference") || null;
  const notes = argument("--notes") || null;

  const prepared = type === "code" ? prepareCodeGrant() : prepareLinkGrant();

  const repository = createAccessGateRepository();
  try {
    await repository.initialize();
    const grant = await repository.createAccessGrant({
      ...prepared.grantInput,
      paymentProvider: provider,
      paymentReference: reference,
      createdBy,
      notes
    });
    prepared.printResult(grant);
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
