// Thin HTTP client for the access gate backed by egbiomed-ai-data-api's
// Azure MySQL instead of Postgres/Supabase. Exposes the exact same
// function names/argument shapes/return shapes as
// lib/postgres-repository.js's access-gate functions, so server.js and the
// CLI scripts need no changes beyond swapping which module they import.
//
// The Azure MySQL server is VNet-private -- this process (Render) can never
// connect to it directly, so every call here goes over HTTPS to
// egbiomed-ai-data-api instead, which does the real Managed-Identity-backed
// database work.

function createAzureAccessGateClient({ baseUrl, apiKey, fetchImpl } = {}) {
  const resolvedBaseUrl = (
    baseUrl || process.env.AZURE_ACCESS_GATE_API_BASE_URL || ""
  ).replace(/\/+$/, "");
  const resolvedApiKey = apiKey || process.env.AZURE_ACCESS_GATE_API_KEY || "";
  const resolvedFetch = fetchImpl || fetch;

  async function postJson(pathname, body) {
    const response = await resolvedFetch(`${resolvedBaseUrl}${pathname}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-egbiomed-access-gate-key": resolvedApiKey
      },
      body: JSON.stringify(body)
    });

    let parsed;
    try {
      parsed = await response.json();
    } catch (parseError) {
      throw new Error(
        `Azure access-gate API returned invalid JSON from ${pathname} (status ${response.status})`
      );
    }

    if (!response.ok) {
      const error = new Error(
        `Azure access-gate API request to ${pathname} failed with status ${response.status}: ${parsed?.error || "unknown error"}`
      );
      error.statusCode = response.status;
      throw error;
    }

    return parsed;
  }

  async function health() {
    const response = await resolvedFetch(`${resolvedBaseUrl}/health`);
    let parsed;
    try {
      parsed = await response.json();
    } catch (parseError) {
      throw new Error(`Azure access-gate API /health returned invalid JSON (status ${response.status})`);
    }
    if (!response.ok || !parsed.ok) {
      throw new Error(`Azure access-gate API is not healthy (status ${response.status})`);
    }
    return parsed;
  }

  async function initialize() {
    await health();
  }

  async function createAccessGrant({
    tokenHash,
    paymentProvider = "manual",
    paymentReference = null,
    createdBy,
    notes = null,
    expiresAt = null,
    maxUses = 1,
    credentialType = "link",
    code = null
  }) {
    if (!createdBy) {
      throw new Error("createAccessGrant requires createdBy.");
    }
    if (credentialType === "code" && !code) {
      throw new Error("createAccessGrant requires code when credentialType is 'code'.");
    }
    if (credentialType === "link" && code) {
      throw new Error("createAccessGrant must not receive code when credentialType is 'link'.");
    }

    // Optional nullable fields are omitted entirely rather than sent as
    // explicit null -- the Azure API's create schema requires `code` to be
    // wholly ABSENT for link grants (not merely null), so this convention
    // is applied uniformly rather than special-cased just for `code`.
    const body = {
      token_hash: tokenHash,
      created_by: createdBy,
      payment_provider: paymentProvider,
      max_uses: maxUses,
      credential_type: credentialType
    };
    if (paymentReference != null) body.payment_reference = paymentReference;
    if (notes != null) body.notes = notes;
    if (expiresAt != null) body.expires_at = expiresAt;
    if (code != null) body.code = code;

    const result = await postJson("/api/access-gate/grants", body);
    return { grantId: result.grant_id, expiresAt: result.expires_at };
  }

  // Used identically for both personal-link and shared-code redemption --
  // the row itself already knows its credential_type. Expected denials
  // (not_found/expired/already_used/revoked) come back as {ok:false,
  // reason} with HTTP 200 from the API, and are returned as-is, never
  // thrown; only auth/validation/server failures (non-2xx) throw, via
  // postJson.
  async function redeemAccessGrant({ tokenHash }) {
    return postJson("/api/access-gate/redemptions", { token_hash: tokenHash });
  }

  // Returns the raw grant row in snake_case (unconverted) because
  // scripts/access-code-status.js reads grant.max_uses/grant.use_count
  // directly today -- keeping snake_case here means that script needs no
  // changes beyond its require line.
  async function getAccessGrantStatus({ tokenHash }) {
    const result = await postJson("/api/access-gate/grants/lookup", { token_hash: tokenHash });
    return result.grant;
  }

  async function topUpAccessCode({ tokenHash, addUses, actor }) {
    if (!Number.isInteger(addUses) || addUses <= 0) {
      throw new Error("topUpAccessCode requires a positive integer addUses.");
    }
    return postJson("/api/access-gate/grants/topup", {
      token_hash: tokenHash,
      add_uses: addUses,
      actor
    });
  }

  async function close() {
    // No persistent connection to release -- kept only so callers with an
    // existing `finally { await repository.close(); }` need no changes.
  }

  return {
    initialize,
    health,
    createAccessGrant,
    redeemAccessGrant,
    getAccessGrantStatus,
    topUpAccessCode,
    close
  };
}

module.exports = { createAzureAccessGateClient };
