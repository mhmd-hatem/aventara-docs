---
title: The audit log
description: "What Access records, the table or sink, the event shapes, and how anonymous floods are folded."
order: 15
section: guides
---

# The audit log

`audit` records sign-ins, refused sign-ins, sign-outs, tokens issued and decisions. It works the same under
`createAccess` and the Better Auth plugin.

| `audit` | Where events go |
|---|---|
| `true` | The `accessAudit` table |
| `{ sink }` | Your function. No table is declared. |
| `false`, or left out | Nowhere |

## The table

`npx auth@~1.7.12 generate --yes` writes the table into an ORM's schema (Prisma: `model AccessAudit`), and
`npx auth@~1.7.12 migrate` creates it, beside Better Auth's tables. Better Auth refuses to start while the table is
missing.

Read the log through your app's ORM, for example `prisma.accessAudit.findMany({ orderBy: { at: "desc" } })`. It is not
reachable through the framework's API: Access's own tables stay closed to every request. A read of `AccessAudit` is
refused `403 A4002`.

## A sink

```ts
// src/audit.sink.ts
import type { AccessAuditEvent } from "@aventara/access/auth";

/** Logs every refusal with the rule that refused it. */
export const auditSink = (event: AccessAuditEvent): void => {
	if (event.kind === "decision" && !event.allowed) {
		console.warn(
			`${event.userId ?? "anonymous"} refused ${event.action} on ${event.resource}: ${event.reason}`,
		);
	}
};
```

Then `audit: { sink: auditSink }`.

## The events

```text
{ at, kind: "sign-in", userId, origin, impersonatedBy? }
{ at, kind: "sign-in-failed", userId: null, route, reason, target?, deviceId?, origin, suppressed?, windowStart?, windowEnd? }
{ at, kind: "sign-out", userId, origin, impersonatedBy? }
{ at, kind: "token", userId, origin, impersonatedBy? }
{ at, kind: "kiosk-switch", userId, previousUserId, deviceId, origin }
{ at, kind: "kiosk-lock", userId, deviceId, reason, origin }
{ at, kind: "kiosk-device", userId, deviceId, reason, origin }
{ at, kind: "kiosk-pin", userId, origin }
{ at, kind: "decision", userId, resource, action, allowed, reason, origin, suppressed?, windowStart?, windowEnd? }
```

| Kind | What it is |
|---|---|
| `sign-in` | A session Better Auth created. `origin` is `client` through Access's routes and `application` when your server calls Better Auth's API. `impersonatedBy` is the admin's id for an impersonation. |
| `sign-in-failed` | A route that starts a session refusing the caller. `route` is Better Auth's endpoint, `reason` the code it refused with. A failed kiosk PIN is one on `/kiosk/switch-user`, with the device's `deviceId`. |
| `sign-out` | A session ended through `/sign-out` |
| `token` | A JWT issued for a session by `GET /token` |
| `kiosk-*` | The kiosk profile's events ([The kiosk profile](/docs/kiosk)) |
| `decision` | A `can` answer |

- `reason` on a decision names the deciding rule: `grant:<id>`, `deny:<id>`, or `no grant`. A guardrail reads
  `deny:guardrail:<id>`.
- `userId` is the `sub` of the token or session the principal came from, or `null` for an anonymous caller.
- `target` on a refused sign-in is an HMAC-SHA-256 of the identifier the route reads (the email, the username, the phone
  number), keyed by Better Auth's secret. Every attempt on one identifier has the same target. The identifier itself is
  never kept.
- A request's admission is one decision event, however many rows it reads or writes. A row question adds an event only
  when the rules refuse that row. `scopeOf`, `fieldsOf` and `explain` log nothing.
- An event holds no token, password, cookie, key or header.

## Anonymous floods

Anonymous refusals (a refused decision with no `userId`, and every refused sign-in) are logged once a minute for each
origin and reason, and for each route and `target` on a sign-in. The first is logged. The repeats in the minute are
counted, and when the minute closes the count is logged as a summary: the first event's fields with `suppressed` (the
count), `windowStart` and `windowEnd`.

A flood of anonymous requests writes two rows a minute, not one per request. At most 10,000 windows are open at once;
past that, the oldest is closed early.

## Failures

The request waits for the write or the sink. A sink that throws, or a write that fails, does not fail the request:
Better Auth's logger warns and the request goes on. Queue slow work in the sink.
