-- Run as a PostgreSQL administrator after replacing role ownership decisions
-- with organization-approved accounts. Passwords are intentionally not included.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cancer_app_writer') THEN
    CREATE ROLE cancer_app_writer LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cancer_research_developer') THEN
    CREATE ROLE cancer_research_developer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cancer_contact_developer') THEN
    CREATE ROLE cancer_contact_developer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cancer_operations_developer') THEN
    CREATE ROLE cancer_operations_developer NOLOGIN;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA research, contact, operations FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA research, contact, operations FROM PUBLIC;

GRANT USAGE ON SCHEMA research, contact, operations TO cancer_app_writer;
GRANT SELECT, INSERT ON research.assessments TO cancer_app_writer;
GRANT SELECT, INSERT, UPDATE ON contact.delivery_contacts TO cancer_app_writer;
GRANT SELECT, INSERT ON operations.submission_events TO cancer_app_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA operations TO cancer_app_writer;

GRANT USAGE ON SCHEMA research TO cancer_research_developer;
GRANT SELECT ON ALL TABLES IN SCHEMA research TO cancer_research_developer;

GRANT USAGE ON SCHEMA contact TO cancer_contact_developer;
GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA contact TO cancer_contact_developer;

GRANT USAGE ON SCHEMA operations TO cancer_operations_developer;
GRANT SELECT ON ALL TABLES IN SCHEMA operations TO cancer_operations_developer;

ALTER DEFAULT PRIVILEGES IN SCHEMA research
  GRANT SELECT ON TABLES TO cancer_research_developer;
ALTER DEFAULT PRIVILEGES IN SCHEMA contact
  GRANT SELECT, UPDATE ON TABLES TO cancer_contact_developer;
ALTER DEFAULT PRIVILEGES IN SCHEMA operations
  GRANT SELECT ON TABLES TO cancer_operations_developer;
