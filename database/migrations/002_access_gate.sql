BEGIN;

CREATE SCHEMA IF NOT EXISTS access;

CREATE TABLE IF NOT EXISTS access.grants (
  grant_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'redeemed', 'revoked')),
  payment_provider text NOT NULL DEFAULT 'manual',
  payment_reference text,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0 AND use_count <= max_uses),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  notes text
);

CREATE UNIQUE INDEX IF NOT EXISTS grants_token_hash_idx
  ON access.grants (token_hash);
CREATE INDEX IF NOT EXISTS grants_status_expires_idx
  ON access.grants (status, expires_at);

CREATE TABLE IF NOT EXISTS operations.access_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grant_id bigint REFERENCES access.grants(grant_id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'grant_created',
    'redeemed',
    'redeem_denied_not_found',
    'redeem_denied_expired',
    'redeem_denied_already_used',
    'redeem_denied_revoked'
  )),
  event_status text NOT NULL CHECK (event_status IN ('success', 'denied')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS access_events_grant_id_idx
  ON operations.access_events (grant_id, event_at DESC);

COMMIT;
