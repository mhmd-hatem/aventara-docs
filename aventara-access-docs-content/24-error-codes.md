---
title: "Error codes"
description: "Every AccessError code with its meaning and fix, every case of ACCESS_OPTIONS_INVALID, and the codes Access's routes answer with."
order: 24
section: reference
---

# Error codes

`createAccess`, its instance, `aventaraAccess()`, `accessOf(auth)`, the registry, and an engine checking its lock or a question throw `AccessError`, exported from `@aventara/access`. Its `code` says which refusal it is. Its message starts `Aventara Access:` and says what to change. The registry answers with Better Auth's `{ code, message }` body.

```ts
import { AccessError } from "@aventara/access";

try {
	// createAccess(...), access.policy, access.registry.rotateKey(...)
} catch (error) {
	if (error instanceof AccessError && error.code === "ACCESS_LOCK_MISMATCH") {
		// pull again
	}
}
```

## AccessError codes

| Code | Meaning | Fix |
|---|---|---|
| `ACCESS_BETTER_AUTH_VERSION` | `better-auth` is missing, or outside `~1.7.12` (1.7.12 or a later 1.7 patch). Under `mcp` or `audience`, `@better-auth/oauth-provider` or `@better-auth/cimd` outside it. | `npm i better-auth@~1.7.12`. Under `mcp` or `audience`, also `npm i @better-auth/oauth-provider@~1.7.12 @better-auth/cimd@~1.7.12`. |
| `ACCESS_CLAIMS_UNDECLARED` | The rules or the guardrails read a claim, or a token carries one, that `policies.claims` does not declare | Declare the claim in `policies.claims` |
| `ACCESS_PLUGIN_DUPLICATE` | `betterAuth.plugins` holds `jwt()` or `aventaraAccess()`, which `createAccess` installs itself. Or a second Access plugin beside `aventaraAccess()`. Or one `aventaraAccess()` in two Better Auth instances whose options differ. Or a plugin that defines `jwt()`'s endpoints, Access's `/me`, or (registry on) a registry route. | Remove it from the plugins |
| `ACCESS_OPTIONS_INVALID` | An option Access does not take or cannot accept. [Every case is below.](#access_options_invalid) | Follow the message |
| `ACCESS_KIOSK_UNSUPPORTED` | Better Auth's plugins hold the kiosk plugin (`@aventara/better-auth-kiosk`) with facts of a version this Access does not read | Install the `@aventara/better-auth-kiosk` release that matches this `@aventara/access` |
| `ACCESS_RESOURCE_MISSING` | A table `resources` opens is missing: Better Auth lacks its plugin, or the rules' schema lacks its Resource. Or the organization bridge without `organization()`. | Add the plugin, or run `npx auth@~1.7.12 generate --yes` and regenerate the model |
| `ACCESS_LOCK_MISMATCH` | A pulled file no longer hashes to its pin in `avAccess.lock.json`, the engine was given files the lock does not pin, or `requireLock` is set and no lock was given | Run `avaccess pull` again. Never edit a pulled file. Pass the lock. |
| `ACCESS_KEY_REFUSED` | A registry key that is wrong, revoked, rotated out or another namespace's (`401`), or a pull key that pushes (`403`). Also a `rotateKey` (or `avaccess keys rotate`) that another rotation or revocation of the same key overtook; it issues nothing. | Use the namespace's current key of the right kind |
| `ACCESS_OWNERSHIP` | A pushed file names a Resource another namespace owns, or one the operator has not assigned it (`ownership: "assigned"`), or the org's guardrails grant (`403`) | Grant only on your own Resources. Ask the owner or the operator, or add a guardrail. |
| `ACCESS_POLICIES_INVALID` | A pushed file is not a file the engine would run from (`400`), or is over 1 MiB (`413`). That includes a rule with `null` inside an `in` or `notIn` list, and an empty condition below a rule's root ([Rules](/docs/rules)). | Push the `.contract()` of your rules, or the pulled file unchanged |
| `ACCESS_NAMESPACE` | A namespace name that is not one, one the registry does not have, or one it has already | Check the name. Use `keys rotate` for an existing namespace. |
| `ACCESS_REVISION_CHANGED` | A stored revision no longer hashes to its key: it was changed outside the registry (`500`) | Restore the registry's tables, and push the file again |
| `ACCESS_FOREIGN_CROSS_DATABASE` | The rules read another namespace's Resources as foreign, and this service is on another database: the owner's beacon as its connection reads it is missing or not the one the owner pushed, or the owner pushed none (`403`) | Run the service on the owner's database, or carry the fact in a JWT claim (`policies.claims`) |
| `ACCESS_BEACON_MISMATCH` | At startup, an owner's row in `_aventara_beacon` is missing or does not hash to this environment's pin, the pins are another environment's, a check failed before, or `checkBeacons` was not awaited. At push, a beacon the namespace replaced comes back (`409`), or the namespace's row is one the registry does not hold. | Point the service at the owner's database. Pull this environment's pins. Await `access.policy.checkBeacons(beacon, beaconPins, environment)` before serving. Have an operator verify or delete a row the push did not write. |
| `ACCESS_QUESTION_INVALID` | A `fieldsOf` question without `access: "read"` or `access: "write"`, or with an `action` that does not fit it; or a `hosted` call whose `held` is not a list of Resource names | Ask `{ access: "read" }`, or `{ access: "write", action? }` with `create` or `update`; call `hosted({ held: ["User", ...] })` |

## ACCESS_OPTIONS_INVALID

One code, many causes. The message names the option and the reason. The cases, by area:

| Area | Refused |
|---|---|
| Options | An option or block `createAccess` does not take, or cannot read. `accessOf` given an instance without `aventaraAccess()`. |
| Base URL and cookies | No base URL to fix the tokens' issuer. A session cookie with `sameSite: "none"` and no `trustedOrigins`. |
| Origin and CSRF checks | `advanced.disableOriginCheck` or `advanced.disableCSRFCheck`, or the same checks turned off in Better Auth's context. Better Auth's test mode (the `TEST` environment variable) outside NODE_ENV=test. A `trustedOrigins` entry whose host is a wildcard alone (`"*"`, `"http://*"`). See [Instead of turning the CSRF check off](/docs/hosts#instead-of-turning-the-csrf-check-off) and [Trusted origins and wildcards](/docs/hosts#trusted-origins-and-wildcards). |
| Claims and principal | A claim read from a user field a user can set (no `input: false`). A `principal` object shared by two users. |
| User ids | Better Auth's numeric ids (`advanced.database.generateId: "serial"`) and ids the database makes (`advanced.database.generateId: false`, or `advanced.generateId: false`), in every app and in `avaccess serve` and `avaccess keys` ([User ids](/docs/create-access#user-ids)). |
| Passwords | `passwords` set beside your own `emailAndPassword.password`. Node.js 22 without `@node-rs/argon2`. |
| Better Auth tables | A grant on a table `resources` leaves closed. Better Auth off its Prisma adapter without `resources.authTables`. An opened table whose secret column is not found. |
| Organizations | An organization plugin without `requireEmailVerificationOnInvitation: true` under `resources.members` or the bridge. Under the bridge: one that lets any user create an organization, or that maps a role dynamic access control lets admins name. |
| MCP and `audience` | No OAuth provider, or two. One listed before `aventaraAccess()`. `disableJwtPlugin`. A resource missing from its `resources`. No `aventara:read` among its `scopes`. A `refreshTokenReuseInterval` other than 0. A `validateRedirectUri`, an `allowInsecureRedirectUri`, a `requestUriResolver` or a `postLogin.consentReferenceId`. `allowUnauthenticatedClientRegistration` without `mcp.openRegistration` (never under `audience` alone). A resource that is the provider's UserInfo URL. The `service` profile. Under `mcp`, an http issuer off `127.0.0.1` and `[::1]`. Under `audience`, `enforcePerClientResources: false`, and, beside `mcp`, the audience in `clientRegistrationDefaultResources` or `clientRegistrationAllowedResources`. |
| Profiles | A `profile` that is not `web` or `service`: `kind: "kiosk"` and the kiosk's keys included, since kiosk mode moved to `@aventara/better-auth-kiosk` ([Upgrading](/docs/upgrading)). |
| Kiosk plugin | The kiosk plugin under the `service` profile. Beside the kiosk plugin, a plain http: IPv4 base URL written in another form than dotted decimal (`http://3232235786`). The plugin refuses the rest of the Better Auth options that break a device-bound session itself, with `KIOSK_OPTIONS_INVALID` ([Kiosk mode](/docs/kiosk#what-the-kiosk-refuses)). |
| Onboarding plugin | The onboarding plugin with facts of a version this Access does not read. Off Better Auth's Prisma adapter, a `resources.authTables` that does not name the plugin's tables. |
| Registry | The registry on Better Auth's memory adapter, or with no `database` (which Better Auth runs on that adapter): the registry's keys, owners and heads rest on unique indexes the memory adapter does not enforce. |

## Plugin and password codes

These are Better Auth `APIError` codes. The kiosk plugin's codes (`KIOSK_*`, `INVALID_USER_OR_PIN`, `PIN_TOO_WEAK` and
the rest) are on [Kiosk mode](/docs/kiosk#tables-and-codes), and the onboarding plugin's on
[Onboarding](/docs/onboarding#tables-and-codes).

| Code | Status | When |
|---|---|---|
| `PASSWORD_TOO_LONG` | 400 | A password longer than Better Auth's `emailAndPassword.maxPasswordLength` (128 by default) |
| `BANNED_USER` | 403 | `GET /token` for a user Better Auth's admin plugin holds banned ([createAccess](/docs/create-access)) |

## Framework codes you will see

Access does not define these, but it causes them.

| Code | Status | Why |
|---|---|---|
| `A4002` | 403 | The policy refused the request: no grant allowed it, a deny matched, or it selected a field governed for reading, or set one governed for writing, that no grant opened. A read of one of Access's own tables ends here too. See [Error codes](https://aventara.razor34.dev/framework/docs/error-codes#a4002) in the framework docs. |
| `A3000` | 500 | A rule compares a `datetime`, `decimal` or `bigint` field in a scope or an `exists` question. The request is refused. See [Rules](/docs/rules#typed-comparisons). |

Better Auth's own origin codes also appear on sign-in: `MISSING_OR_NULL_ORIGIN` and `INVALID_ORIGIN` (both `403`). Send an `Origin` header that matches Better Auth's base URL or one of its `trustedOrigins`.

## Warnings

Node.js warnings (`process.emitWarning`, type `AventaraAccessWarning`), printed when Aventara hosts the engine
(`@aventara/core` `1.0.0-rc.10` or later), each once per process and namespace. They change no decision. Node's
`--disable-warning=<code>` silences one.

| Code | Why | Fix |
|---|---|---|
| `ACCESS_READ_GOVERNED_UNIQUE` | A field governed as `"read"` is unique (one of its Resource's identifiers): a write that sends a value another row holds fails on the duplicate, which tells the writer the value exists. Warned when the rules compile and when the engine is built. | Govern it as `"both"`, or accept that writers learn which values exist. |
| `ACCESS_REFERENCE_UNREADABLE` | A role may create or update a reference to a Resource the app serves that no read grant reaches for it. Aventara refuses each such write (`A4002`). See [Rules](/docs/rules#writing-a-reference-needs-read-on-its-target). | Grant read on the target to that role, or leave the reference out of the write (`write: { except }`). For Better Auth's `User`, open it first with `resources: { users: true }` in `createAccess`; the warning names that key |
| `ACCESS_FOREIGN_REFERENCE_UNCHECKED` | A role's create or update grant may write a reference to a foreign Resource with no condition through that relation, so any row of it can be linked by its identifier. See [Rules](/docs/rules#a-reference-to-a-foreign-resource). | Constrain the link through the relation (a `where` on a create grant, an `after` on an update grant), or leave the reference out of the write |

## Audit reasons

A `decision` event's `reason` names the deciding rule ([The audit log](/docs/audit-log)).

| Reason | Meaning |
|---|---|
| `grant:<id>` | A grant allowed it |
| `deny:<id>` | A deny matched |
| `deny:guardrail:<id>` | A guardrail matched |
| `better-auth:<Resource>` | A built-in deny closed one of Better Auth's tables |
| `better-auth:<Resource>/<actions>` | A write an opened table never takes |
| `deny:mcp-scope` | An agent's token lacks the scope for the question |
| `deny:mcp-audience` | An agent's token used under an origin other than `agent` |
| `no grant` | Nothing allowed it |
