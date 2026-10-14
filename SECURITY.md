# Security Policy

## Supported versions

Security fixes target the active `main` branch. Historical date-named
working branches and older releases are not independently supported unless a
specific maintenance notice states otherwise.

## Reporting vulnerabilities

**Do not disclose an unpatched vulnerability in a public issue or pull
request.** Prefer the repository's **Security** tab → **Report a
vulnerability** (GitHub private vulnerability reporting, when enabled).

When private reporting is unavailable, contact the repository maintainer
through an established **private** channel. Do not publish reproduction
secrets, personal data, credentials, or working exploits in an issue.

A useful private report includes the affected version or commit, entry
point, impact, minimum reproduction, environment, logs with secrets removed,
and any suggested mitigation. Submission is not a guarantee of a specific
response time or bounty.

## Project security practices

- Required CI: tests, lint/typecheck, architecture, production image smoke,
  FE↔BE E2E and dependency audit with a zero-critical production gate.
- The audit gate does **not** certify absence of high/moderate vulnerabilities
  across development dependencies or prove exploitability.
- Keep secrets out of Git history and CI artifacts. Use staging credentials
  and rotate any leaked credential immediately.
- Security-sensitive changes need staged regression tests and explicit
  maintainer review; keep pull requests in Draft until checks pass.

See [Dependency Security](docs/DEPENDENCY_SECURITY_AUDIT.md),
[Threat Model](docs/THREAT_MODEL.md) and [Operations](docs/OPERATIONS.md)
for the project's current limitations and response guidance.
