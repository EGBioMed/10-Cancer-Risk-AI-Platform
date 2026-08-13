BEGIN;

ALTER TABLE access.grants
  ADD COLUMN IF NOT EXISTS credential_type text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grants_credential_type_check'
  ) THEN
    ALTER TABLE access.grants
      ADD CONSTRAINT grants_credential_type_check
      CHECK (credential_type IN ('link', 'code'));
  END IF;
END
$$;

ALTER TABLE access.grants
  ALTER COLUMN expires_at DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grants_code_matches_type'
  ) THEN
    ALTER TABLE access.grants
      ADD CONSTRAINT grants_code_matches_type CHECK (
        (credential_type = 'code' AND code IS NOT NULL)
        OR (credential_type = 'link' AND code IS NULL)
      );
  END IF;
END
$$;

-- An exhausted-but-not-revoked code still blocks reuse of that literal
-- string -- running out is answered by topping up max_uses on the same
-- row (scripts/topup-access-code.js), not reissuing the same string under a
-- new grant_id, which would split one venue's audit trail across two rows
-- for no benefit. Only 'revoked' frees a code string for reuse.
CREATE UNIQUE INDEX IF NOT EXISTS grants_code_active_idx
  ON access.grants (code)
  WHERE code IS NOT NULL AND status <> 'revoked';

ALTER TABLE operations.access_events
  DROP CONSTRAINT access_events_event_type_check;

ALTER TABLE operations.access_events
  ADD CONSTRAINT access_events_event_type_check CHECK (event_type IN (
    'grant_created',
    'redeemed',
    'redeem_denied_not_found',
    'redeem_denied_expired',
    'redeem_denied_already_used',
    'redeem_denied_revoked',
    'grant_topped_up'
  ));

COMMIT;
