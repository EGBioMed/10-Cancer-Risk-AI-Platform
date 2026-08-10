BEGIN;

CREATE SCHEMA IF NOT EXISTS research;
CREATE SCHEMA IF NOT EXISTS contact;
CREATE SCHEMA IF NOT EXISTS operations;

CREATE TABLE IF NOT EXISTS research.assessments (
  record_id varchar(128) PRIMARY KEY,
  submitted_at timestamptz NOT NULL,
  language varchar(8) NOT NULL CHECK (language IN ('zh', 'en')),
  report_language varchar(16) NOT NULL CHECK (report_language IN ('zh-Hant', 'en')),
  contract_version text NOT NULL,
  processing_status text NOT NULL DEFAULT 'stored_postgresql',
  payload_hash char(64) NOT NULL,
  consent_record jsonb NOT NULL,
  answer_code_rows jsonb NOT NULL,
  answer_rows jsonb NOT NULL,
  model_input jsonb NOT NULL,
  research_row jsonb NOT NULL,
  rule_input jsonb NOT NULL,
  data_quality jsonb NOT NULL,
  submission_payload jsonb NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS assessments_submitted_at_idx
  ON research.assessments (submitted_at DESC);
CREATE INDEX IF NOT EXISTS assessments_processing_status_idx
  ON research.assessments (processing_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS assessments_model_input_gin_idx
  ON research.assessments USING gin (model_input);

CREATE TABLE IF NOT EXISTS contact.delivery_contacts (
  record_id varchar(128) PRIMARY KEY
    REFERENCES research.assessments(record_id) ON DELETE RESTRICT,
  email text NOT NULL,
  submitted_at timestamptz NOT NULL,
  language varchar(8) NOT NULL CHECK (language IN ('zh', 'en')),
  report_language varchar(16) NOT NULL CHECK (report_language IN ('zh-Hant', 'en')),
  delivery_status text NOT NULL DEFAULT 'pending_model_migration',
  payload_hash char(64) NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS delivery_contacts_submitted_at_idx
  ON contact.delivery_contacts (submitted_at DESC);
CREATE INDEX IF NOT EXISTS delivery_contacts_status_idx
  ON contact.delivery_contacts (delivery_status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS operations.submission_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id varchar(128) NOT NULL,
  event_type text NOT NULL,
  event_status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS submission_events_record_id_idx
  ON operations.submission_events (record_id, event_at DESC);

COMMIT;
