# Payment-confirmation access gate

The questionnaire can be gated behind a one-time, payment-confirmation link
instead of being fully open. This document describes the mechanism, how to
operate it, and how to keep developing locally without it getting in the way.

## Status

Payment gateway integration itself is **not implemented yet** (no provider is
chosen). Today, access links are minted manually via a CLI script, after a
staff member confirms payment out-of-band (bank transfer, manual gateway
dashboard check, etc.). The mechanism is designed so that a future payment
webhook can mint links the exact same way, automatically.

## How it works

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
   httpOnly session cookie valid for **30 minutes**
   (`ACCESS_GATE_SESSION_TTL_HOURS=0.5`) and redirects to `/`. Revisiting the
   same link afterward is denied.
5. Every other route (`/`, static assets, `POST /api/submit`) requires that
   session cookie once the gate is `enforced`. `GET /api/health` and
   `GET /access/<token>` are always reachable.
6. Any denial (expired / already used / unknown / revoked) shows the same
   styled page, [access-denied.html](access-denied.html) — the response never
   reveals which specific reason applied. The real reason is recorded
   server-side in `operations.access_events`.

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

```powershell
npm run access:grant -- --created-by "Jane" --reference "bank-transfer-2026-08-13" --ttl-hours 1
```

Flags: `--created-by <name>` (required), `--provider <name>` (default
`manual`), `--reference <text>`, `--notes <text>`, `--ttl-hours <n>` (default
`1`), `--max-uses <n>` (default `1`), `--confirm-remote-host` (required if
`PGHOST` is not `127.0.0.1`/`localhost` — a safety guard against accidentally
minting grants against the wrong database).

The raw token is printed exactly once. If it's lost, mint a new grant — it
cannot be recovered from the database.

## Future: real payment gateway webhook

Not built yet (no provider chosen). It will be a new route that, after
verifying the provider's own webhook signature, calls the same
`postgresRepository.createAccessGrant({ paymentProvider, paymentReference,
createdBy: "webhook:<provider>", ... })` used by `scripts/grant-access.js`
today, then emails the resulting link instead of printing it to a console. No
schema or repository changes are anticipated for that step.

## Explicitly deferred

- Real payment gateway integration.
- A manual-revoke tool (the schema already allows `status = 'revoked'`;
  nothing sets it yet).
- Per-IP rate limiting on `/access/*` (256-bit token entropy already makes
  brute-forcing infeasible; revisit if abuse is observed).
