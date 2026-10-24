# Free portfolio backup

The owner selected **free portfolio/demo hosting** on 2026-10-24. No paid
Render/Vercel plan, PITR, persistent Redis or production availability objective
is required for this demo. This explicitly weaker operating profile is not a
production recovery certification.

## Implementation

`scripts/backup/portfolio-backup.ps1` supports Windows PowerShell 5.1. It calls
`scripts/backup/portfolio-backup.cjs` with Node.js 22+ and Docker Desktop using
Linux containers. No npm installation is needed for these backup scripts.

- Source is restricted to the current PostgreSQL 18 staging external host,
  database and user. Transactions are read-only, TLS is required. A replacement
  Free instance needs a reviewed guard change.
- The source URL is entered with hidden input, encrypted with Windows DPAPI and
  stored outside git. Only the same Windows user/machine can decrypt this URL.
- Custom-format pg_dump is encrypted using authenticated AES-256-GCM. A separate
  random recovery key is stored outside git. Keep an independent offline copy.
- Each backup is decrypted and restored into a fresh random local PostgreSQL 18
  container with **no network and no published ports**. No target URL, application,
  worker, relay or email is started. Restore must succeed and schema/migrations
  must pass before a `.verified.json` receipt is written.
- Temporary plaintext, environment files and restore containers are removed on
  normal success/failure. Power loss can interrupt cleanup; use a private Windows
  account and normal disk encryption where available.
- Encrypted archives are **never pruned automatically**. Keep at least seven
  distinct successful daily copies if disk space permits. Review older copies
  manually after confirming a newer restore and an offline key copy.

## Enable on your Windows PC

**Owner setup and initial end-to-end Windows acceptance completed on 2026-10-24.**
Requires Node.js 22+, Docker Desktop running, a local checkout containing the
scripts, free disk space and internet access. Preserve uncommitted work when
syncing. This is a best-effort PC schedule, not managed cloud backup.

1. Render → `triad-postgres-staging` → Networking: add **only your current public
   IPv4 `/32`**, preserving existing rules. Do not open `0.0.0.0/0`. Update the
   rule if your ISP changes your public IP. External access was disabled during
   implementation; the scripts never change this allow list.
2. Render → Connect: copy **External Database URL**. Run locally:

   ```powershell
   cd E:\DNEK
   .\scripts\backup\portfolio-backup.ps1 -Action Setup
   ```

   Choose an absolute directory outside the checkout, such as `D:\TriAD-Backups`.
   Paste the URL only into the hidden local prompt, never in chat/screenshots/git.
   Setup refuses to overwrite an existing configuration/key. Files:

   - `%LOCALAPPDATA%\TriAD-Backup\settings.json`: DPAPI-protected source URL.
   - `%LOCALAPPDATA%\TriAD-Backup\recovery.key`: separate AES recovery key.

   The configuration folder grants access to the current Windows user instead
   of inherited permissions. DPAPI does not defend against malicious code running
   as that same user. The key is not a password to send to the assistant.

3. Keep an independent offline copy of `recovery.key`, for example on a safely
   stored USB. Do not keep the only key copy with the only archive copy. The
   archive can be decrypted with `recovery-archive.cjs` and the key if the original
   Windows account is lost; DPAPI protects only the source URL.
4. Create the first real backup and require **PASS** plus its verification receipt:

   ```powershell
   .\scripts\backup\portfolio-backup.ps1 -Action Backup
   ```

   Earlier backups remain untouched on failure. The first real hosted backup is
   **not proven** by the synthetic CI test.

5. After the first PASS, install the daily **20:30 local time** task:

   ```powershell
   .\scripts\backup\portfolio-backup.ps1 -Action InstallTask
   Get-ScheduledTaskInfo -TaskName 'TriAD Portfolio Backup'
   ```

   This Windows Task Scheduler job runs only while the same user is logged on;
   Docker, internet and the allowed public IP are required. A missed trigger can
   run when available, but snapshots for days the PC was off are not backfilled.
   Keep this checkout at its current path. Check `LastTaskResult = 0` and the
   latest receipt: registration alone is not proof a backup ran.

## Windows acceptance evidence — 2026-10-24

Owner-provided PowerShell outputs for the **real Render Free staging PostgreSQL 18**
and their **own Windows PC** (not CI, no hosted restore):

- The owner added their public IPv4 `/32` to Render's allowlist and saved the
  External Database URL via DPAPI-protected Setup. TCP port 5432 was reachable.
- `prisma migrate status` reported **16 migrations, schema up to date**.
  The actual physical tables include `users`, `orders` and `outbox_events`
  (Prisma `@@map`), rather than the model names `User`, `Order`,
  `OutboxEvent`. The original backup restore check used the incorrect model
  names; it was corrected and the synthetic CI fixture aligned.
- Manual **Backup PASS**: encrypted archive
  `triad-portfolio-20261024T092754679Z-8e96c460.dump.enc`, restored and
  schema-verified in a disposable PostgreSQL 18 container.
- `InstallTask` registered **TriAD Portfolio Backup** daily at **20:30 local**.
  A manual **Start-ScheduledTask** trigger ran at 16:29:29 local;
  `LastTaskResult = 0` and the fresh archive
  `triad-portfolio-20261024T092936861Z-e27a3f3d.dump.enc`
  (50,898 bytes, 16:29:36 local) has a receipt containing
  `result: PASS`, `verifiedAt: 2026-10-24T09:29:40.465Z` and
  `disposableRestore: true`.
- These observations prove a successful **user-triggered Task Scheduler run**,
  not yet an unattended 20:30 trigger across multiple days. Retention/off-device
  archive copies and an independent offline recovery-key copy remain to be
  confirmed by the owner.
- PostgreSQL Free expiration is still **2026-11-20**; a replacement/export
  plan is not yet confirmed. No hosted recovery cutover or guaranteed RTO/RPO.

Evidence is limited to owner-shared command output. Neither encrypted archives
nor passwords, DPAPI settings, or recovery keys are committed or uploaded.

## Rehearse recovery safely

Select an actual archive, replacing the example filename:

```powershell
.\scripts\backup\portfolio-backup.ps1 -Action Verify -Archive 'D:\TriAD-Backups\triad-portfolio-YYYYMMDDTHHMMSSmmmZ-xxxxxxxx.dump.enc'
```

This decrypts/restores/checks a disposable local PostgreSQL database, then removes
it. No hosted database is overwritten or switched. The receipt contains a
checksum/time, not records or credentials. Full application worker/relay/rollback
acceptance is separately covered by `recovery-runtime-acceptance.yml`; this local
check does not prove a hosted application cutover. A real disaster still needs a
reviewed hosted restore and service connection update, avoiding blind email replay.

To remove only the schedule and keep archives/keys:

```powershell
.\scripts\backup\portfolio-backup.ps1 -Action RemoveTask
```

## Accepted demo limits

| Item              | Free portfolio behavior                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost              | Existing PC/disk and Docker Desktop personal/student tooling; no paid cloud resource or GitHub artifact storage provisioned.                                                        |
| Cadence           | Daily best-effort attempt while logged in; no cloud backup agent.                                                                                                                   |
| Retention         | Owner-managed local copies; no automatic pruning. Keep at least seven known-good daily copies if possible.                                                                          |
| Data loss         | Measured from the latest **successful** snapshot. Successful daily runs normally leave about 24 hours between snapshots; missed/failed runs make the gap longer. No guaranteed RPO. |
| Recovery time     | Real hosted recovery has not been timed; provisioning, network and manual reconfiguration are excluded from CI timing. No guaranteed RTO.                                           |
| Redis             | Free persistence remains off; waiting jobs and ephemeral auth/cache state can disappear on restart. PostgreSQL backup does not preserve Redis.                                      |
| Availability      | Free API can sleep; workers/relay have no always-on guarantee.                                                                                                                      |
| Database lifetime | Current Free PG expires **2026-11-20**. Backup does not extend its life or create a replacement. Export before expiry and plan a new demo instance/reconfiguration.                 |
| Independent copy  | PC storage is outside Render, but disk loss can still destroy archives. Copy encrypted archives to another owned disk/USB when available; keep the key independently.               |
| Scope             | PostgreSQL only; Cloudinary files, provider configuration, secrets and OAuth settings need their own recoverable setup.                                                             |

CI tests a synthetic PostgreSQL source and the Windows parser/DPAPI without live
credentials. No archive/key/plaintext is uploaded. The initial **real** backup
and user-triggered scheduled run were separately accepted on the owner's PC
(see dated evidence above). Issue #143 remains open for offline key custody and
the Free PostgreSQL replacement/export plan. Unattended daily reliability and
hosted recovery are not guaranteed; paid production targets are not imposed.

References: [Render external access](https://render.com/docs/postgresql-creating-connecting#restricting-external-access),
[Free hosting limits](https://render.com/docs/free).
