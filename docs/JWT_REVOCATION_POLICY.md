# JWT Revocation Policy

## Purpose

Define JWT validation, revocation, rotation, and Redis failure
behavior for the TriAD Backend authentication system.

## Token Classification

JWTs must be validated using the expected token category.

| Token    | Required claims                                 | Usage                     |
| -------- | ----------------------------------------------- | ------------------------- |
| Access   | jti, iss, aud, tokenType, exp, sub, email, role | API authentication        |
| Refresh  | jti, iss, aud, tokenType, exp, sub, familyId    | Token rotation            |
| Pre-auth | jti, iss, aud, tokenType, exp, sub, purpose     | Two-factor authentication |

Tokens must not be accepted across categories.

Validation must reject malformed, expired, incorrectly signed,
or incorrectly classified tokens.

## Access Token Revocation

- Every access token must have a unique `jti`.
- Redis revocation keys must not contain raw JWT values.
- Revocation identifiers are derived from SHA-256 hashes of `jti`.
- Revocation records must remain valid until the associated
  access token expires.
- Token validation must check revocation before authorizing
  a protected request.

## Redis Failure Policy

Authentication revocation checks use a fail-closed policy.

| Failure                                      | Required behavior                             |
| -------------------------------------------- | --------------------------------------------- |
| Redis read failure                           | Reject protected authentication with HTTP 503 |
| Redis write failure during logout            | Reject the operation with HTTP 503            |
| Revoked access token                         | Reject authentication                         |
| Redis successfully reports token not revoked | Continue normal JWT validation                |

An infrastructure failure must not be interpreted as a valid
or non-revoked token.

Logout must not report successful revocation when persistence
of the revocation marker has failed.

## Refresh Token Rotation

- Refresh tokens are tracked through token families.
- Token rotation must prevent concurrent reuse of the same
  refresh token.
- Competing rotation requests must not produce multiple
  successful replacements.
- Revocation and rotation must preserve database consistency.

## Two-Factor Pre-Authentication

Pre-authentication tokens:

- Must use the dedicated token category and audience.
- Must include `purpose: "2fa"`.
- Must not authorize normal API access.
- Must be consumed at most once.

## Operational Requirements

- Monitor Redis availability and revocation failures.
- Preserve sufficient Redis durability for revocation records.
- Avoid eviction policies that silently discard revocation markers.
- Investigate repeated HTTP 503 authentication failures.
- Never log raw JWT values or signing secrets.

## Deployment Compatibility

Changes to JWT claims, audiences, or signing requirements
may invalidate previously issued tokens.

A migration to stricter JWT validation may require existing
users to authenticate again.

## Verification

Required automated checks include:

- Access, refresh, and pre-auth token classification.
- Token-class confusion rejection.
- Access token revocation.
- Redis read and write failures.
- Concurrent refresh-token rotation.
- Authentication middleware failure handling.

Production rollout additionally requires successful CI,
runtime smoke verification, and operational monitoring.

## Remaining Considerations

Redis data loss can remove revocation records. Operational
durability, persistence, backup, and failover behavior must
be assessed separately before claiming complete protection
against infrastructure data loss.
