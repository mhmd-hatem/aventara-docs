---
title: "Limits and defaults"
description: "Every default, bound and timing in one place: tokens, passwords, the server, the registry, the kiosk and the audit log."
order: 25
section: reference
---

# Limits and defaults

Each value was checked against the package. Where an option sets it, the option is named.

## Tokens and sessions

| What | Value | Set by |
|---|---|---|
| Token lifetime | 900 seconds (15 minutes). Whole seconds from 300 to 900. | `policies.tokenTtl` |
| Clock skew allowed on a token | 5 seconds | fixed |
| Key set (`GET /api/auth/jwks`) refresh | Every 5 minutes, and at once (at most every 5 seconds) for a key it does not hold | fixed |
| Token issuer and audience | The origin of Better Auth's base URL | `baseURL`, `BETTER_AUTH_URL` |
| Default profile | `web` | `profile` |
| Audit | off | `audit` |
| Registry | off, ownership `"first-push"` | `registry` |
| Resources opened from Better Auth's tables | none | `resources` |

## Passwords

| What | Value | Set by |
|---|---|---|
| Hash | argon2id, `"owasp-minimum"` (19 MiB, 2 passes, 1 lane) | `passwords.argon2id` |
| Other profile | `"rfc9106-low-memory"` (64 MiB, 3 passes, 4 lanes) | `passwords.argon2id` |
| Salt and tag | 16 bytes and 32 bytes | fixed |
| Largest hash cost a check will compute | 64 MiB, 3 passes, 4 lanes | fixed |
| Longest password | 128 (Better Auth's default) | `emailAndPassword.maxPasswordLength` |
| Scrypt hashes | refused | `passwords.legacyScrypt: true` accepts them |

## The standalone server

| What | Value | Set by |
|---|---|---|
| Port | `3000` (`0` picks a free one) | `port`, `--port`, `PORT` |
| Interface | `127.0.0.1` | `hostname`, `--hostname` |
| Largest request body | 1 MiB (`1048576`) | `maxBodyBytes`, `--max-body-bytes` |
| Drain on `close()` | 10 seconds, then the rest are ended | fixed |
| Health check | `GET /health` answers `200 {"status":"ok"}` | fixed |
| Better Auth's rate limit under `avaccess serve` | on when `NODE_ENV=production` (Better Auth's own default) | `betterAuth.rateLimit.enabled` |
| Migration on start | off | `--migrate`, `AVACCESS_MIGRATE` |

## Server-side verb calls

| What | Value |
|---|---|
| Rate limit scope | `signIn`, `signUp`, `resetPassword` calls, with Better Auth's own `rateLimit` options |
| Failures per target before a refusal | 10, each within 5 minutes of the one before. A success clears the count. |
| Refusal lasts | Until 5 minutes have passed |

## The registry

| What | Value |
|---|---|
| Namespace name | `^[a-z][a-z0-9_-]{0,62}$` |
| Key format | `avk_push_…` or `avk_pull_…`: 32 random bytes, base64url |
| Key header | `x-access-key` |
| Largest policies file | 1 MiB (`413` over it) |
| Largest push body read | 2 MiB (`413` for a declared length over it, unread) |
| Redirects followed by the CLI | none |

## The kiosk

| What | Value | Set by |
|---|---|---|
| Idle timeout | 300 seconds. Whole seconds from 60 to 3600. | `profile.idleTimeout` |
| Device credential | 32 random bytes, HTTP-only cookie, kept 400 days, `SameSite=Lax` | fixed |
| Freshness of an enrolling session | Better Auth's `session.freshAge` (one day by default) | `session.freshAge` |
| PIN length | 6 to 12 digits | fixed |
| Wrong PINs free per user per device | 5, then one try per backoff that doubles from 1 minute to 1 hour (`429`) | fixed |
| PIN disabled on a device after | 100 wrong PINs in a row (`403`) | fixed |
| Device limit | 10 wrong PINs at once for any users, then one more every 90 seconds | fixed |
| Replaced credential grace | 30 seconds (`409 KIOSK_DEVICE_BUSY`) | fixed |
| Replaced credentials kept (as hashes) | 400 days | fixed |

## The audit log

| What | Value |
|---|---|
| Anonymous refusal repeats | Folded once a minute for each origin and reason (and each route and target on a sign-in) |
| Open windows at once | 10,000. Past that, the oldest is closed early. |
| A failing sink or write | Does not fail the request. Better Auth's logger warns. |
