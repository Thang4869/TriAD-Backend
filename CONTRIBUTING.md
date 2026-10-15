# Contributing to TriAD Backend

TriAD is maintained as a portfolio-focused, production-oriented
TypeScript backend. Contributions should preserve existing contracts,
Clean Architecture boundaries, transactional invariants and tests.

## Local development

Use the Node.js version configured by CI (`22`), PostgreSQL and Redis.
Copy `.env.example` to a **local** `.env` file and provide the required
secrets locally; never commit secrets.

```powershell
npm ci
npx prisma generate
npx prisma migrate dev
npm run typecheck
npm run lint
npm run architecture:check
npm run test:unit
npm run test:integration
npm run build
```

Integration tests expect an isolated PostgreSQL database and Redis; do not
run them on a production database. Review project docs for fullstack E2E,
Docker smoke and sensitive environment variables.

## Branch and commit workflow

Use **one shared date branch per calendar day**, formatted
`commit-DDMMYYYY` (example: `commit-15102026`). Reuse the existing
date branch and add logical commits; do **not** create
`commit-DDMMYYYY-2`, feature branches or suffix branches for additional
stages. Refresh from `main` before starting and never force-push a
diverged branch without maintainer approval.

Write Conventional Commit subjects:

```text
fix(auth): preserve verification intent on failed update
refactor(orders): clarify repository boundary
docs: update durability runbook
test(checkout): cover same-key concurrent retries
```

GitHub Actions maps the **commit types present in the PR** to labels,
removes stale managed labels, and keeps manually maintained unrelated labels.

Stage separate concerns into separate commits. Keep PRs in **Draft**
until all relevant CI checks pass. The maintainer owns review, decisions
and merging. Do not merge automatically.

## Quality and release

- Add unit tests for pure logic and real database/HTTP integration tests
  for data consistency and transaction boundaries.
- Use `npm install` to regenerate `package-lock.json` with any dependency
  change; commit manifest and lockfile together. Never hand-edit integrity
  hashes or bypass npm peer compatibility with `--force`.
- Preserve existing frontend/API compatibility or document migration and
  provide a tested deprecation plan.
- Do not mark staging/production recovery claims DONE based on mocks or
  test-container timing alone.
- Link relevant PRs, GitHub Issues, acceptance criteria, and observed CI
  evidence in updated docs. Review [Improvement Checklist](docs/TriAD-Backend-Improvement-Checklist.md).

## License

The project is available under the [MIT License](LICENSE); preserve its
copyright and permission notice when redistributing substantial portions.
Respect the separate terms governing third-party libraries, trademarks and
assets. Meaningful contributions should include a focused use case, tests
and documentation of the trade-offs rather than extra abstractions alone.
