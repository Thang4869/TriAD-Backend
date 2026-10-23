# Production Compose acceptance

`docker-compose.prod.yml` uses externally managed PostgreSQL and Redis URLs.
It deliberately does not provision an unused local Redis. Required configuration
is checked during Compose interpolation. Keep secrets in an untracked env file
or deployment secret store. `API_EDGE_SECRET` is optional for direct local use;
when set, `/api` is restricted to the authenticated proxy and `TRUST_PROXY=0`.

The API binds to loopback by default (`TRIAD_API_BIND=127.0.0.1`,
`TRIAD_API_PORT=3000`). Put an HTTPS reverse proxy in front; choose an explicit
bind only after reviewing exposure. The migration service uses the same
production image and must exit successfully before API startup. The collector
bind-mount fails if its config file is missing instead of creating a directory.
The API has an init process and a 15-second shutdown allowance.

## Disposable CI drill

`.github/workflows/production-compose-acceptance.yml` invokes
`scripts/acceptance/production-compose.sh` with `ops/compose.acceptance.yml`.
The override supplies disposable PostgreSQL/Redis on an isolated Compose network
and waits for their health checks. It does not change production dependency URLs.
The guard rejects any project name outside `triad-acceptance-<digits>`, external
database/Redis targets, non-loopback API binds and enabled edge credentials.
Cleanup removes only that disposable project's containers and volumes.

The drill runs Compose config validation, builds the production image, runs
migrations, starts the actual production stack, checks DB/cache/queue readiness,
catalog HTTP success, protected docs/metrics, collector startup, and SIGTERM
exit code 0 plus the application shutdown marker. Sanitized JSON evidence is
uploaded with the tested commit SHA. No SMTP/Cloudinary real delivery, hosted
TLS, backup durability, or production recovery result is implied.

Run the workflow on the reviewed commit and record its successful URL before
closing #102. A normal production-image smoke alone does not execute Compose.
