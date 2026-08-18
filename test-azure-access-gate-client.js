const assert = require("node:assert/strict");
const test = require("node:test");
const { createAzureAccessGateClient } = require("./lib/azure-access-gate-client");

function stubResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

// Records every call made through it and answers with whatever `handler`
// returns, so each test can assert both the returned value AND (when it
// matters) exactly what was sent over the wire.
function createRecordingFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: options?.body ? JSON.parse(options.body) : undefined });
    return handler(url, options);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function makeClient(handler) {
  const fetchImpl = createRecordingFetch(handler);
  const client = createAzureAccessGateClient({
    baseUrl: "https://egbiomed-ai-data-api.example",
    apiKey: "test-key",
    fetchImpl
  });
  return { client, fetchImpl };
}

test("createAccessGrant throws synchronously for invalid args without ever calling fetch", async () => {
  const { client, fetchImpl } = makeClient(() => {
    throw new Error("fetch should not have been called");
  });

  await assert.rejects(() => client.createAccessGrant({}), /requires createdBy/);
  await assert.rejects(
    () => client.createAccessGrant({ createdBy: "tester", credentialType: "code" }),
    /requires code/
  );
  await assert.rejects(
    () => client.createAccessGrant({ createdBy: "tester", credentialType: "link", code: "whatever" }),
    /must not receive code/
  );

  assert.equal(fetchImpl.calls.length, 0);
});

test("createAccessGrant sends code only for credentialType 'code', omitting it entirely for 'link'", async () => {
  const { client, fetchImpl } = makeClient(() =>
    stubResponse(201, { ok: true, grant_id: 1, expires_at: "2026-01-01T00:00:00.000Z" })
  );

  await client.createAccessGrant({ createdBy: "tester", expiresAt: "2026-01-01T00:00:00.000Z" });
  assert.equal("code" in fetchImpl.calls[0].body, false);

  const { client: codeClient, fetchImpl: codeFetch } = makeClient(() =>
    stubResponse(201, { ok: true, grant_id: 2, expires_at: null })
  );
  await codeClient.createAccessGrant({ createdBy: "tester", credentialType: "code", code: "abc123", maxUses: 10 });
  assert.equal(codeFetch.calls[0].body.code, "abc123");
  assert.equal(codeFetch.calls[0].body.credential_type, "code");
});

test("createAccessGrant returns camelCase fields from the snake_case wire response", async () => {
  const { client } = makeClient(() =>
    stubResponse(201, { ok: true, grant_id: 42, expires_at: "2026-02-02T00:00:00.000Z" })
  );

  const result = await client.createAccessGrant({ createdBy: "tester" });
  assert.deepEqual(result, { grantId: 42, expiresAt: "2026-02-02T00:00:00.000Z" });
});

test("topUpAccessCode throws synchronously for a non-positive-integer addUses without calling fetch", async () => {
  const { client, fetchImpl } = makeClient(() => {
    throw new Error("fetch should not have been called");
  });

  await assert.rejects(() => client.topUpAccessCode({ tokenHash: "a", addUses: 0, actor: "x" }));
  await assert.rejects(() => client.topUpAccessCode({ tokenHash: "a", addUses: 1.5, actor: "x" }));
  await assert.rejects(() => client.topUpAccessCode({ tokenHash: "a", addUses: -3, actor: "x" }));

  assert.equal(fetchImpl.calls.length, 0);
});

test("redeemAccessGrant passes an expected denial through as a return value, never throwing", async () => {
  const { client } = makeClient(() => stubResponse(200, { ok: false, reason: "expired" }));

  const result = await client.redeemAccessGrant({ tokenHash: "a".repeat(64) });
  assert.deepEqual(result, { ok: false, reason: "expired" });
});

test("redeemAccessGrant returns a successful redemption as-is", async () => {
  const { client } = makeClient(() => stubResponse(200, { ok: true, grantId: 7 }));

  const result = await client.redeemAccessGrant({ tokenHash: "a".repeat(64) });
  assert.deepEqual(result, { ok: true, grantId: 7 });
});

test("redeemAccessGrant throws on a non-2xx response (auth/validation/server failure)", async () => {
  const { client } = makeClient(() => stubResponse(401, { ok: false, error: "Unauthorized" }));

  await assert.rejects(() => client.redeemAccessGrant({ tokenHash: "a".repeat(64) }), /status 401/);
});

test("redeemAccessGrant throws when the response body is not valid JSON", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    }
  });
  const client = createAzureAccessGateClient({
    baseUrl: "https://egbiomed-ai-data-api.example",
    apiKey: "test-key",
    fetchImpl
  });

  await assert.rejects(() => client.redeemAccessGrant({ tokenHash: "a".repeat(64) }), /invalid JSON/);
});

test("getAccessGrantStatus returns the grant in snake_case, unconverted, for CLI compatibility", async () => {
  const { client } = makeClient(() =>
    stubResponse(200, {
      ok: true,
      grant: { grant_id: 5, credential_type: "code", max_uses: 10, use_count: 3 }
    })
  );

  const grant = await client.getAccessGrantStatus({ tokenHash: "a".repeat(64) });
  assert.equal(grant.max_uses, 10);
  assert.equal(grant.use_count, 3);
  assert.equal("maxUses" in grant, false);
});

test("getAccessGrantStatus returns null when no grant is found", async () => {
  const { client } = makeClient(() => stubResponse(200, { ok: true, grant: null }));

  const grant = await client.getAccessGrantStatus({ tokenHash: "a".repeat(64) });
  assert.equal(grant, null);
});

test("topUpAccessCode returns the successful result as-is", async () => {
  const { client, fetchImpl } = makeClient(() =>
    stubResponse(200, { ok: true, grantId: 9, maxUses: 15, useCount: 3 })
  );

  const result = await client.topUpAccessCode({ tokenHash: "a".repeat(64), addUses: 5, actor: "tester" });
  assert.deepEqual(result, { ok: true, grantId: 9, maxUses: 15, useCount: 3 });
  assert.equal(fetchImpl.calls[0].body.add_uses, 5);
  assert.equal(fetchImpl.calls[0].body.actor, "tester");
});

test("health resolves when the API reports ok:true on a 2xx response", async () => {
  const { client } = makeClient(() => stubResponse(200, { ok: true, database_ready: true }));
  await assert.doesNotReject(() => client.health());
});

test("health throws when the API is unreachable or reports not-ok", async () => {
  const { client: downClient } = makeClient(() => stubResponse(503, { ok: false }));
  await assert.rejects(() => downClient.health());

  const { client: falseOkClient } = makeClient(() => stubResponse(200, { ok: false }));
  await assert.rejects(() => falseOkClient.health());
});

test("initialize delegates to health and throws under the same conditions", async () => {
  const { client } = makeClient(() => stubResponse(503, { ok: false }));
  await assert.rejects(() => client.initialize());
});

test("every request includes the access-gate API key header, not the ingest key header", async () => {
  const { client, fetchImpl } = makeClient(() => stubResponse(200, { ok: true, grant: null }));

  await client.getAccessGrantStatus({ tokenHash: "a".repeat(64) });

  const headers = fetchImpl.calls[0].options.headers;
  assert.equal(headers["x-egbiomed-access-gate-key"], "test-key");
  assert.equal("x-egbiomed-ingest-key" in headers, false);
});
