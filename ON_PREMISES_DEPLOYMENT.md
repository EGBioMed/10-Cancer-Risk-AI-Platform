# On-premises PostgreSQL deployment runbook

## Migration status

The on-premises branch uses PostgreSQL for durable submissions. Development data
is stored as readable PostgreSQL columns and JSONB so authorized developers can
inspect it with `psql`, pgAdmin, or another approved SQL client.

| Component | Current on-premises implementation |
| --- | --- |
| Questionnaire web UI | Local Node.js service |
| Submission API | Local Node.js service |
| Research/health storage | `research.assessments` |
| Contact/email storage | `contact.delivery_contacts` |
| Operational events | `operations.submission_events` |
| Excel-compatible export | Separate research/contact CSV scripts |
| Backup | PostgreSQL custom-format dump plus SHA-256 manifest |
| AI model inference | Blocked: model source/weights are not in this repository |
| PDF and email | Blocked: implementations and approved mail route are absent |
| HTTPS/Windows service | Pending internal hostname and certificate decision |

## Development security boundary

Application-level field encryption is intentionally disabled during development.
Protection currently depends on PostgreSQL credentials, PostgreSQL roles, Windows
account permissions, firewall rules, and restricting the database to localhost or
the approved development network.

The database is divided into three schemas:

```text
research   questionnaire, coded answers, model input and research payload
contact    email address and report delivery state
operations append-only submission events
```

Do not grant all developers the PostgreSQL administrator account. Apply
`database/development-roles.sql` and assign each named developer only the research,
contact, or operations group roles needed for their work.

## Runtime configuration

```text
SUBMISSION_MODE=postgres
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=cancer_risk
PGUSER=cancer_app_writer
PGPASSWORD=<local secret, never commit>
PGPOOL_MAX=20
HOST=127.0.0.1
PORT=3000
```

Supported transition modes:

- `postgres`: store only in PostgreSQL; do not call Power Automate.
- `dual`: commit to PostgreSQL, then temporarily forward to Power Automate.
- `power-automate`: use the existing cloud flow for rollback.

The development machine stores the generated runtime connection settings in the
Git-ignored `runtime` directory. Start the PostgreSQL-backed site with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-postgres-local.ps1
```

The local development login details for pgAdmin are stored in
`runtime\developer-connection.txt`. Do not send this file by email or commit it.

## Developer queries

Research records:

```sql
SELECT record_id, submitted_at, processing_status, model_input
FROM research.assessments
ORDER BY submitted_at DESC
LIMIT 100;
```

Inspect one answer from the preserved submission JSON:

```sql
SELECT record_id, submission_payload -> 'rows' AS answers
FROM research.assessments
WHERE record_id = 'WEB-EXAMPLE';
```

Contact delivery state (contact-authorized developers only):

```sql
SELECT record_id, email, delivery_status, submitted_at
FROM contact.delivery_contacts
ORDER BY submitted_at DESC;
```

## Operations

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

CSV exports:

```powershell
npm run export:research
npm run export:contacts
```

Create a PostgreSQL custom-format backup:

```powershell
npm run backup:local
```

Set `PG_DUMP_PATH` if `pg_dump` is not in `PATH`. Set `LOCAL_BACKUP_DIR` to a
different disk or NAS before production. The development backup is not encrypted;
the destination must therefore have restricted Windows permissions.

## Production cutover prerequisites

1. Obtain the cancer-risk model source, weights, preprocessing code, response
   schema, runtime requirements, and verified test vector.
2. Select an approved mail route and provide a non-personal service account.
3. Approve an internal DNS name and trusted TLS certificate.
4. Use a restricted Windows service account for the application.
5. Keep PostgreSQL bound to localhost unless remote development access is explicitly
   approved; use VPN/SSH tunneling rather than exposing port 5432 publicly.
6. Select an off-host backup destination and test restoration.
7. Before real participant data is collected, review whether BitLocker, backup
   encryption, column encryption, and stricter data-retention controls are required.
