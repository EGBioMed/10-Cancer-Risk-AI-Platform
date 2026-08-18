# Payment-confirmation access gate

The questionnaire can be gated behind a credential instead of being fully
open. There are two credential types, sharing the same underlying
`access.grants` table and redemption logic:

| | Link | Code |
| --- | --- | --- |
| Who it's for | One paying individual | A venue/organization buying quota in bulk (e.g. a health-check center, 健檢中心) |
| Format | System-random, embedded in a URL | Staff-chosen or system-composed, typed into a form |
| Delivery | `https://.../access/<token>` — auto-redeems on click | Typed into the code-entry form on [access-denied.html](access-denied.html) |
| Limit | Time (`--ttl-hours`) + use count (usually 1) | Use count only (no expiry unless explicitly set) |
| Storage | Hash only — raw token never stored | Hash (for lookup) **and** plaintext `code` column (staff need to look it back up — see below) |

This document describes both mechanisms, how to operate them, and how to keep
developing locally without either getting in the way.

## Storage backend: Postgres or Azure MySQL

The gate's storage is now **selectable**, independent of everything else in
this document — links vs. codes, session cookies, rate limiting, and the
denial page all work identically no matter which backend answers
`redeemAccessGrant`/`createAccessGrant`/etc.

- `ACCESS_GATE_BACKEND=postgres` (default, unchanged production behavior) —
  talks directly to Postgres/Supabase, exactly as described in the rest of
  this document (`access.grants`, `operations.access_events`).
- `ACCESS_GATE_BACKEND=azure_mysql` — talks to `egbiomed-ai-data-api`'s
  `POST /api/access-gate/*` endpoints instead (`lib/azure-access-gate-client.js`),
  which do the real work against Azure Database for MySQL via Managed
  Identity. This process can never connect to that MySQL server directly —
  it's VNet-private — so this HTTPS layer is required, not optional.

New environment variables (only used when `ACCESS_GATE_BACKEND=azure_mysql`):

| Variable | Purpose |
| --- | --- |
| `AZURE_ACCESS_GATE_API_BASE_URL` | Base URL of `egbiomed-ai-data-api`, e.g. `https://egbiomed-ai-data-api-<suffix>.azurewebsites.net`. |
| `AZURE_ACCESS_GATE_API_KEY` | Shared secret sent as `x-egbiomed-access-gate-key`. Deliberately a **separate** secret from that API's `INGEST_API_KEY` — a leak of this one lets someone mint free paid access or drain a code's quota, a categorically more sensitive blast radius than a research-data-ingest key. |

**Local development and testing never use the real production key.** There's
no harmless "local" Azure MySQL to point at the way `PGHOST=127.0.0.1` works
for Postgres — it's one private instance reachable only by API key. Instead:
use `ACCESS_GATE_MODE=open` (the existing bypass, no backend call at all —
see [Developer bypass](#developer-bypass)), or point unit tests at the
stubbed `fetchImpl` in `test-azure-access-gate-client.js`.

Rollback is a single env var: flip `ACCESS_GATE_BACKEND` back to `postgres`
(or unset it) and restart — no code deploy needed, since Postgres/Supabase
stays untouched throughout the migration and any rollback window after
cutover.

Once Azure MySQL has been the live backend through a full rollback-window
soak with no issues, the sections below describing direct Postgres operation
(migrations 002/003, `database/development-roles.sql` grants,
`guardAgainstAccidentalRemoteHost`) become legacy/rollback-reference only.
Decommissioning Supabase itself is a separate, later decision — it also
retires `SUBMISSION_MODE=postgres/dual` and the Postgres export/backup
scripts, which are unrelated to the gate.

## Status

Payment gateway integration itself is **not implemented yet** (no provider is
chosen). Today, both links and codes are minted manually via CLI scripts,
after a staff member confirms payment out-of-band (bank transfer, manual
gateway dashboard check, a venue's purchase order, etc.). The mechanism is
designed so that a future payment webhook can mint links the exact same way,
automatically.

## How links work

1. A staff member (or, later, a payment webhook) mints a link with
   `npm run access:grant`. The link looks like
   `https://192.168.12.22/access/<random-token>`.
2. Only a SHA-256 **hash** of the token is ever stored in the database
   (`access.grants.token_hash`). The raw token is shown once, at creation
   time, and never logged or stored anywhere else.
3. The link is valid, unused, for **1 hour** from creation
   (`--ttl-hours`, default `1`).
4. When the link is visited, the server hashes the token, looks it up, and
   redeems it (single use by default). On success, it sets a signed,
   httpOnly session cookie and redirects to `/`. Revisiting the same link
   afterward is denied. The cookie is a **browser session cookie** (no
   Max-Age) — closing the browser clears it, so the next visitor on a shared
   computer must enter their own credential rather than riding an earlier
   visitor's session. Server-side, the signed payload still carries a real
   expiry (`ACCESS_GATE_SESSION_TTL_HOURS=0.5`, i.e. 30 minutes) as a hard
   ceiling even if the cookie somehow outlives the browser session (e.g. tab
   restore).
5. Every other route (`/`, static assets, `POST /api/submit`) requires that
   session cookie once the gate is `enforced`. `GET /api/health` and
   `GET /access/<token>` are always reachable.
6. Any denial (expired / already used / unknown / revoked) shows the same
   styled page, [access-denied.html](access-denied.html) — the response never
   reveals which specific reason applied. The real reason is recorded
   server-side in `operations.access_events`.

## How codes work

1. A staff member mints a code with `npm run access:grant -- --type code`,
   either as an exact string (`--code`) or system-composed from parts
   (`--institution` + `--quota-label`, plus a random suffix). See
   [Staff CLI](#staff-cli-scriptsgrant-accessjs) below.
2. Codes are looked up the same way as links — hashed with SHA-256 into
   `access.grants.token_hash` — so the redemption transaction
   (`redeemAccessGrant`) needed **zero changes** to support codes. Unlike
   links, the normalized plaintext is *also* stored in `access.grants.code`,
   because staff need to look a code back up later (which venue does this
   belong to, how much quota is left) — a one-time-reveal model like links
   use would actively break that workflow. Treat the `code` column the same
   way as any other plaintext operational data in this database (e.g.
   `contact.delivery_contacts.email`) — not a secret on the level of a
   password hash.
3. Codes have **no time expiry by default** — only a usage quota
   (`--max-uses`, required for `--type code`). Many different people can
   redeem the same code, each incrementing `use_count`, until the quota is
   exhausted. Running out is answered by **topping up**
   (`npm run access:topup`), not minting a new code — this keeps one venue's
   whole usage history under a single `grant_id`.
4. A visitor without a session sees [access-denied.html](access-denied.html),
   which now has a code-entry form. It submits to
   `POST /api/access/redeem-code` (JSON body `{code}`) and, on success, sets
   the same kind of session cookie as link redemption and redirects to `/`.
5. `normalizeCode` (in `lib/access-gate.js`) trims, lowercases, and collapses
   whitespace before hashing — so `"Health-Check A1"` and `"health-check a1"`
   hash identically. Codes must be **6–64 characters** after normalization.
   Not restricted to ASCII — venue names may be Chinese.
6. `POST /api/access/redeem-code` has its **own rate limiter** (60 attempts
   per 10 minutes, per IP) — codes are much lower entropy than a 256-bit link
   token and are the more attractive brute-force target. The limit is
   deliberately generous because the real usage pattern is one front-desk
   computer, staff typing on behalf of many patients over a business day —
   not one person per device. State resets on process restart; that's fine,
   since a restart isn't something a caller can trigger through this
   endpoint. Link redemption is unaffected — no rate limiter there, unchanged
   justification (256-bit entropy makes brute force infeasible).

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `ACCESS_GATE_MODE` | `enforced` or `open`. Code default (unset) is `enforced` — fail closed. | `enforced` |
| `ACCESS_GATE_SESSION_SECRET` | HMAC key for signing session cookies. **Required** when `enforced`; the server refuses to start without it. | — |
| `ACCESS_GATE_SESSION_TTL_HOURS` | How long a redeemed session lasts. | `0.5` (30 min) |
| `ACCESS_GATE_COOKIE_SECURE` | Set `false` only for local HTTP testing without TLS. | `true` |
| `PUBLIC_BASE_URL` | Base URL `scripts/grant-access.js` prints links against. | — |

Generate a session secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## ⚠ Upgrading an existing deployment

Because the code fails closed, **an existing runtime that does not set
`ACCESS_GATE_MODE`/`ACCESS_GATE_SESSION_SECRET` will refuse to start** after
this change is deployed. Before restarting the `EGBioMedCancerRisk` Windows
service, update its runtime env file with one of:

- `ACCESS_GATE_MODE=open` — keeps today's fully-open behavior, no gate.
- `ACCESS_GATE_MODE=enforced` plus a generated `ACCESS_GATE_SESSION_SECRET` —
  turns the gate on immediately.

Also run the new migration (`database/migrations/002_access_gate.sql`) once,
the same way `001_initial.sql` was applied
(`RUN_DATABASE_MIGRATIONS=true`, see [ON_PREMISES_DEPLOYMENT.md](ON_PREMISES_DEPLOYMENT.md)),
and extend `database/development-roles.sql` grants if a database
administrator manages roles separately from the migration.

Adding shared codes (`database/migrations/003_access_codes.sql`) is purely
additive — every new column is nullable or defaulted, and no new required env
var or startup check was introduced — so it does **not** need the same
fail-closed care. Run it any time before or alongside deploying the updated
code.

## Developer bypass

For day-to-day development, `.env.example` ships `ACCESS_GATE_MODE=open`,
which fully disables the gate (today's fully-open behavior, no database
dependency for the gate itself).

To test the real gate flow locally end-to-end:

1. In your local `.env`, set `ACCESS_GATE_MODE=enforced`, a throwaway
   `ACCESS_GATE_SESSION_SECRET`, and `ACCESS_GATE_COOKIE_SECURE=false` (no TLS
   on plain `localhost`).
2. Run migrations once (`RUN_DATABASE_MIGRATIONS=true`, via
   `scripts/start-postgres-local.ps1`) so `access.grants` and
   `operations.access_events` exist.
3. Mint a token: `npm run access:grant -- --created-by <your-name>`.
4. Visit the printed URL in a browser. It should redirect to `/`; the
   questionnaire should load and submit normally. Revisiting the same link
   afterward should show the denial page.

## Staff CLI: `scripts/grant-access.js`

Mint a link (default `--type`, unchanged from before codes existed):

```powershell
npm run access:grant -- --created-by "Jane" --reference "bank-transfer-2026-08-13" --ttl-hours 1
```

Flags: `--created-by <name>` (required), `--provider <name>` (default
`manual`), `--reference <text>`, `--notes <text>`, `--ttl-hours <n>` (default
`1`), `--max-uses <n>` (default `1`), `--confirm-remote-host` (Postgres
backend only — required if `PGHOST` is not `127.0.0.1`/`localhost`, a safety
guard against accidentally minting grants against the wrong database; not
applicable when `ACCESS_GATE_BACKEND=azure_mysql`, see
[Storage backend](#storage-backend-postgres-or-azure-mysql)).

The raw token is printed exactly once. If it's lost, mint a new grant — it
cannot be recovered from the database.

Mint a code (`--type code`), either as an exact string (English/alphanumeric
recommended — non-ASCII text is technically accepted but not recommended,
since it has to survive terminals, printed slips, and kiosk keyboards intact
all the way to redemption):

```powershell
npm run access:grant -- --type code --created-by "Jane" --max-uses 500 --code "SCHB1TEST"
```

or system-composed from parts (recommended for real venue sales — concatenates
`institution + quotaLabel + "Q" + maxUses + randomSuffix` with **no
separator**, and **requires English letters/digits only** for
`--institution`/`--quota-label`). The purchased quota is always baked into
the code itself as `Q<maxUses>`, taken directly from `--max-uses` — not left
for the operator to type into `--quota-label` and risk it drifting from the
real number. `--quota-label` is optional, for a batch/plan name if useful.
The 6-character random suffix uses an alphabet that avoids visually ambiguous
characters like `0`/`O`/`1`/`I`/`L`, since staff read it off a screen or
printout:

```powershell
npm run access:grant -- --type code --created-by "Jane" --max-uses 500 --institution "SCH" --quota-label "B1"
```

This prints something like `SCHB1Q500M5HS7Z` — anyone reading the code can
see at a glance it's for `SCH`, batch `B1`, 500 uses. `--max-uses` is
**required** for `--type code` (quota sizing is the entire point — there's no
sensible default). `--ttl-hours` is optional for codes (omit it for no
expiry, the normal case; pass it if a specific code should also expire by
date). `--confirm-remote-host` behaves identically to link mode.

Check remaining quota:

```powershell
npm run access:status -- --code "SCHB1Q500M5HS7Z"
```

Top up when a venue buys more:

```powershell
npm run access:topup -- --code "SCHB1Q500M5HS7Z" --add-uses 200 --created-by "Jane"
```

## Future: real payment gateway webhook

Not built yet (no provider chosen). It will be a new route that, after
verifying the provider's own webhook signature, calls the same
`createAccessGrant({ paymentProvider, paymentReference,
createdBy: "webhook:<provider>", ... })` used by `scripts/grant-access.js`
today (via whichever backend `ACCESS_GATE_BACKEND` selects), then emails the
resulting link instead of printing it to a console. No schema or repository
changes are anticipated for that step.

## Explicitly deferred

- Real payment gateway integration.
- A manual-revoke tool (the schema already allows `status = 'revoked'`;
  nothing sets it yet).
- Per-IP rate limiting on `/access/*` (link redemption) — 256-bit token
  entropy already makes brute-forcing infeasible; revisit if abuse is
  observed. This is unrelated to the rate limiter that codes now have on
  `POST /api/access/redeem-code` (see "How codes work" above) — that limiter
  was added because codes are lower entropy by design.
