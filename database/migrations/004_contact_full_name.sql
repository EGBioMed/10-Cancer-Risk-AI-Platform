ALTER TABLE contact.delivery_contacts
  ADD COLUMN IF NOT EXISTS full_name text;

ALTER TABLE contact.delivery_contacts
  DROP CONSTRAINT IF EXISTS delivery_contacts_full_name_nonempty;

ALTER TABLE contact.delivery_contacts
  ADD CONSTRAINT delivery_contacts_full_name_nonempty
  CHECK (full_name IS NULL OR length(btrim(full_name)) BETWEEN 1 AND 100);
