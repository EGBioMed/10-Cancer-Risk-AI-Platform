# On-premises deployment runbook

## Migration status

The web application and submission API can run on the Windows host. In `local`
mode, validated submissions are stored in two encrypted SQLite databases and are
not sent to Power Automate.

| Component | Current on-premises implementation |
| --- | --- |
| Questionnaire web UI | Runs locally in Node.js |
| Submission API | Runs locally in Node.js |
| Research/health storage | `research.sqlite`, encrypted payloads |
| Contact/email storage | `contacts.sqlite`, encrypted payloads |
| Excel-compatible export | Local CSV export scripts |
| Backup | Consistent encrypted SQLite backups plus SHA-256 manifest |
| AI model inference | Blocked: model source/weights are not in this repository |
| PDF report generation | Blocked: specification exists, implementation is absent |
| Email delivery | Blocked: approved SMTP service and credentials are not supplied |
| HTTPS | Pending internal hostname/certificate decision |
| Windows service | Pending production service account and HTTPS decision |

Local submissions return `202 Accepted` with a durable `record_id`. Until the AI,
report, and mail components are migrated, the UI explicitly says that no report
email has been generated.

## Storage separation

The data directory contains:

```text
research.sqlite  - questionnaire, coded answers, features, consent and quality data
contacts.sqlite  - record ID and report delivery contact data
```

Sensitive payloads are encrypted with AES-256-GCM. The encryption key is never
stored in the repository or the database. Loss of this key makes the records and
backups unrecoverable, so the production key must have a separate protected backup.

## Runtime configuration

Required environment variables for local mode:

```text
SUBMISSION_MODE=local
LOCAL_DATA_DIR=C:\ProgramData\EGBioMed\CancerRisk\data
LOCAL_DATA_ENCRYPTION_KEY=<32-byte base64 or 64-character hex key>
PORT=3000
```

Supported migration modes:

- `local`: store only on this host; do not contact Power Automate.
- `dual`: store locally, then forward to Power Automate as a temporary transition.
- `power-automate`: retain the existing cloud behavior for rollback.

`dual` and `power-automate` also require `POWER_AUTOMATE_WEBHOOK_URL`.

## Operations

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Create a consistent encrypted backup:

```powershell
npm run backup:local
```

The backup destination defaults to `local-backups`. Production must set
`LOCAL_BACKUP_DIR` to an approved different disk or NAS. Keeping backups only on
the RAID volume does not protect against host failure, theft, or ransomware.

Export research and contact data separately for authorized staff:

```powershell
npm run export:research
npm run export:contacts
```

Exports are decrypted CSV files. They must be written only to an access-controlled
destination and deleted according to the organization's retention policy.

## Production cutover prerequisites

1. Obtain the exact cancer-risk model source, weights, preprocessing code, response
   schema, runtime requirements, and a verified test vector.
2. Select an approved mail route (internal SMTP, Microsoft 365, or another service)
   and provide a service account without placing credentials in Git.
3. Approve an internal DNS name and issue a trusted TLS certificate.
4. Select a restricted Windows service account and grant it access only to the app,
   data, logs, and backup destinations it requires.
5. Enable Windows Firewall and expose HTTPS only; keep Node bound behind the reverse
   proxy.
6. Select an off-host backup destination and test restoration on a separate folder.
7. Complete Chinese/English report, duplicate submission, model failure, mail
   failure, backup, restore, and restart tests before disabling the cloud flow.
