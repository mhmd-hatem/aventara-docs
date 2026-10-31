---
title: "Troubleshooting"
description: "Fixes for startup refusals, version errors, locks, registry keys, refused requests and kiosk and agent problems, by the message you see."
order: 26
section: reference
---

# Troubleshooting

Access fails closed and early. Most problems show up as an `AccessError` when the instance is built, with a message that says what to change. Look the message up here, or find its code on [Error codes](/docs/error-codes).

## Startup

### The wrong Better Auth version

```text
Aventara Access: createAccess runs on better-auth ~1.7.12, which is not installed: npm install better-auth@~1.7.12
Aventara Access: createAccess runs on better-auth ~1.7.12 (1.7.12 or a later 1.7 patch), and this app has better-auth 1.8.0: npm install better-auth@~1.7.12
```

Code `ACCESS_BETTER_AUTH_VERSION`. Install Better Auth in the range: `npm install --save-exact better-auth@~1.7.12`. Under `mcp` or `audience` the OAuth provider and `cimd()` must be in the same range: `npm install @better-auth/oauth-provider@~1.7.12 @better-auth/cimd@~1.7.12`. A prerelease is refused too.

### Node.js cannot load Better Auth

```text
Aventara Access: createAccess loads better-auth through Node.js's module loader, which this runtime does not provide; run it on Node.js ^22.23.4 || >=24.22.1.
```

Run on a supported Node.js ([Installation](/docs/installation#requirements)).

### No base URL

```text
Aventara Access: Access issues its tokens with a fixed issuer and audience, the app's base URL, and Better Auth has none: set ... (or `BETTER_AUTH_URL`), or give a dynamic `baseURL` its `fallback`.
```

Code `ACCESS_OPTIONS_INVALID`. Set `baseURL` in the `betterAuth` block or `BETTER_AUTH_URL` in the environment ([The base URL](/docs/create-access#the-base-url)). Commands that load `src/access.ts` (`npx auth@~1.7.12 generate --yes`, and on Next.js the build) need the variable too, so set it in the environment they run in.

### Argon2 on Node.js 22

```text
Aventara Access: argon2id needs Node.js's `crypto.argon2` (Node.js 24.7.0 and later), which this runtime does not have: on Node.js 22, install @node-rs/argon2 (npm install --save-exact @node-rs/argon2@2.2.2); or set `...password` to hash passwords yourself.
```

Install `@node-rs/argon2@2.2.2` exactly. The kiosk's PIN hashing says the same ([Passwords](/docs/passwords#nodejs-22)).

### A claim comes from a field a user can set

```text
Aventara Access: the claim `role` is read from the user's field `role`, which a user can set themselves (at sign-up, or with `/update-user`): a claim from it would be the user's own choice. Give the field `input: false` in Better Auth's options, or return the claim from `policies.claimsOf`.
```

Add `input: false` to the field in `user.additionalFields` ([Claims](/docs/create-access#claims)).

### The rules read an undeclared claim

Code `ACCESS_CLAIMS_UNDECLARED`. A rule, a guardrail or a token uses a claim `policies.claims` does not list, or compares it with the wrong type. Declare it with its type: `{ role: "string", banned: "boolean" }`.

### A plugin duplicates one Access installs

Code `ACCESS_PLUGIN_DUPLICATE`. `createAccess` installs `jwt()` and the Access plugin itself. Remove them from `betterAuth.plugins`. With the Better Auth plugin, call `aventaraAccess()` once per `betterAuth({...})` and do not add `jwt()` beside it. A plugin with its own `/me` endpoint, (kiosk) anything under `/kiosk/`, or (registry on) a registry route is refused too.

### Two users share one principal object

Code `ACCESS_OPTIONS_INVALID`. `principal` must return a new object for each user. One cached per user is fine ([The principal](/docs/create-access#the-principal)).

### Better Auth is not on Prisma's adapter

Code `ACCESS_OPTIONS_INVALID`. Without `prismaAdapter`, nothing ties a table to a Resource by name. Give `resources.authTables` a map of every table Better Auth is built with ([Which Resource is which table](/docs/auth-tables#which-resource-is-which-table)).

### A table `resources` opens is missing

Code `ACCESS_RESOURCE_MISSING`. Add the Better Auth plugin that owns the table, or run `npx auth@~1.7.12 generate --yes`, migrate, and run `aventara:prepare` again so the rules' schema has it. The organization bridge needs `organization()` in `plugins`.

### AVENTARA_PREBUILT_STALE on Next.js

The framework warns this when `access` is given only in `server.ts`. Put `access` in `aventaraConfig` in `src/aventara/config.ts` ([Hosts](/docs/hosts#nextjs)).

## Schema and tables

### prisma validate fails after auth generate

`User.id` is an `Int`, and Better Auth's ids are strings. Make it `id String @id @default(cuid())`, delete the models `generate` wrote (and Access's), and run it again ([User ids](/docs/create-access#user-ids)). Numeric ids (`generateId: "serial"`) are refused.

### auth generate says the schema is already up to date

It only adds what the schema lacks. If its models were written against an older schema, delete them (and Access's) and run it again.

### A Babel note about AvComputedFields

```text
... "is not declared in Babel's scope tracker"
```

Harmless. It comes from a type the discovery artifact re-exports, and the schema is written all the same.

### Better Auth refuses to start: the audit table is missing

With `audit: true`, run `npx auth@~1.7.12 generate --yes` and migrate, then `aventara:prepare` ([The audit log](/docs/audit-log#the-table)).

### A rule on User is refused

Once Better Auth's tables are in the schema, `User` is Better Auth's `user` table. Open it with `resources: { users: true }` ([Better Auth tables as Resources](/docs/auth-tables)).

## Requests

### 403 A4002 on a request that should work

`A4002` means the policy refused. Check, in this order:

1. Is there a grant for this role, action and Resource? Nothing is allowed until one allows it.
2. Does a deny match? Any deny wins.
3. Is the caller signed in? The `Authorization: Bearer` header is read first. If it is present and invalid, `me` is `null`, and the session cookie is not tried.
4. Does the request select a field governed for reading that no grant opens, or set a field governed for writing
   (Better Auth's `role` included, which Access governs as `"write"`) that the grant does not name? That is refused,
   not dropped.
5. Is the Resource one of Better Auth's tables? They are closed until `resources` opens them.

In development, `engine.explain(question)` says which rules took part in a `can` decision. It throws when `NODE_ENV` is `production`. In production, turn on [the audit log](/docs/audit-log): a decision's `reason` names the rule.

### Everything is refused for a user after a ban or a role change

A token carries the claims it was issued with. The change reaches the user's next token, within `policies.tokenTtl` (15 minutes at most). A token issued before a ban keeps working until it expires; only new tokens are refused. A token is not revoked: one issued before a sign-out keeps verifying until it expires. A service that must see a sign-out at once reads the session instead.

### A missing value fails closed

A grant that reads a `me` value the principal lacks never matches. A deny that reads one matches. An anonymous principal lacks them all ([Missing values fail closed](/docs/rules#missing-values-fail-closed)).

### 403 on a rule that compares a date, decimal or bigint in a scope

The framework cannot yet use a `datetime`, `decimal` or `bigint` comparison in a scope or an `exists` question. It answers `A3000` and refuses the request. `can` on a row compares them correctly ([Typed comparisons](/docs/rules#typed-comparisons)).

### Rows appear that can does not keep

A column with a case- or accent-insensitive collation can match rows `can` would not keep. Give the fields your rules compare a binary or deterministic collation.

### 403 MISSING_OR_NULL_ORIGIN or INVALID_ORIGIN

Better Auth's origin check. A request that carries a cookie needs an `Origin` header that matches Better Auth's base URL or one of its `trustedOrigins` ([Hosts](/docs/hosts#sign-up-and-sign-in)).

### 400 PASSWORD_TOO_LONG

The password is longer than `emailAndPassword.maxPasswordLength` (128 by default).

### An update is refused, or it works when it should not

Updates are checked twice: the rows before, and the row after ([Updates](/docs/updates)). A grant whose `where` reads a relation is judged on the row as the database held it before the update. If you use a generated client, run the update inside your transaction and roll back on `false`.

### Sign-in routes answer 404

You are on the `service` profile. It hands no caller a session: `/sign-in/*`, `/sign-up/*`, the OAuth callbacks and the plugins' sign-in routes answer `404` ([Profiles](/docs/create-access#profiles)).

## Passwords

### Sign-ins fail for users created before Access

Better Auth stored their passwords with scrypt. Add `passwords: { legacyScrypt: true }` beside `betterAuth`. Each account moves to argon2id at its next sign-in. Turn the option off when none is left ([Moving off scrypt](/docs/passwords#moving-off-scrypt)).

### Both passwords and emailAndPassword.password are set

Code `ACCESS_OPTIONS_INVALID`. Use one: a named profile in `passwords`, or your own hook in Better Auth's options.

## The registry and the CLI

### avaccess: no registry

```text
no registry: pass --registry <url> or set AVACCESS_REGISTRY_URL to the Access server's URL (such as https://access.example.com)
```

Set the URL and the key (`AVACCESS_KEY`). The URL is `https:`; `http:` is taken only on a loopback address. The CLI follows no redirect, so give it the registry's own URL.

### 401 ACCESS_KEY_REFUSED

The key is wrong, revoked, rotated out or another namespace's. A missing key reads `the request carries no registry key: send the namespace's key in the x-access-key header`. Another namespace's key gets the same answer as a namespace the registry does not have. A pull key cannot push (`403`).

### 403 ACCESS_OWNERSHIP at push

The file grants, denies or governs on a Resource another namespace owns, or one the operator has not assigned under `ownership: "assigned"`. Grant only on your own Resources ([Who owns a Resource](/docs/registry-and-cli#who-owns-a-resource)).

### ACCESS_LOCK_MISMATCH

```text
<file> is pinned in avAccess.lock.json under sha256:..., and is no longer ... : it was changed after it was pulled. Pull it again with `avaccess pull`; a pulled file is never edited by hand
```

A pulled file was edited, or `requireLock` is set and the lock was not passed. Run `avaccess pull` and commit the files and the lock. `avaccess verify` finds this offline, so put it first in `aventara:prepare`.

### avaccess keys cannot connect

`avaccess keys` reads no `.env`. Give it the environment the server runs with: `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.

### Push refused: ACCESS_FOREIGN_CROSS_DATABASE

The rules read another namespace's Resources, and this service is not on the owner's database. Run both on one database, or carry the fact in a JWT claim ([Beacons](/docs/beacons-and-foreign)).

### Every route answers 500 A3000

The server log shows an `AccessError` saying the beacons were not checked. The rules read another namespace's Resources as foreign, and nothing has called `await access.policy.checkBeacons(beacon, beaconPins, environment)` yet. Call it in `main.ts` before `app.listen` ([Beacons and `foreign`](/docs/beacons-and-foreign#at-startup)). The message names this call.

### ACCESS_BEACON_MISMATCH at startup

Await `access.policy.checkBeacons(beacon, beaconPins, environment)` before the service takes requests. It also fails when the pins are another environment's (`avaccess pull --env <environment>`) or when the service reached another database.

## The standalone server

### avaccess serve exits 1 listing missing tables

Without `--migrate`, a database Better Auth migrates itself is checked first. Run `avaccess serve --migrate` once, or `npx auth@~1.7.12 migrate`.

### --migrate exits 2

The database is behind an ORM's adapter (Prisma, Drizzle). Run `npx auth@~1.7.12 generate --yes`, then the ORM's migration. `--migrate` refuses it.

### 413 from the server

The body is over `maxBodyBytes` (1 MiB). A registry push has its key checked before its body is read.

## Agents over MCP

### The issuer is refused

Under `mcp` the issuer must be https, or `http://127.0.0.1` or `http://[::1]`. `localhost` is refused. Set `baseURL` to that address.

### The OAuth provider cannot register its resource

Better Auth's OAuth provider (1.7.12 to 1.7.14) cannot register its resource on Better Auth's Prisma adapter. Run Better Auth on a `pg` `Pool`. The tables can still live in your Prisma schema ([Agents over MCP](/docs/agents-mcp#better-auth-on-prismas-adapter)).

### An authorization request is refused 400 invalid_request

Every authorization request must use PKCE with SHA-256 and carry its own parameters. A request by reference (`request_uri`) is refused.

### An agent keeps working after a revoke

`POST /oauth2/revoke` does not revoke a JWT access token. Revoke the user's consent to the client, disable the client or end the session, and keep the provider's `accessTokenExpiresIn` short.

## The kiosk

### KIOSK_DEVICE_NOT_ENROLLED right after a switch

A `call` of `switchUser`, `lock` or `enrollDevice` from a Server Action must set the cookies through your cookie plugin (`nextCookies()`, last in `plugins`). Without it the browser keeps the replaced credential, and the next switch is refused. Call the route from the device instead.

### KIOSK_DEVICE_BUSY

Two requests changed the device's credential at once, or a request brought the credential the last switch replaced within 30 seconds. Try again.

### The kiosk refuses a configuration

Cookie cache, `bearer()`, `multiSession()`, `crossSubDomainCookies`, `SameSite=None` and an http: base URL are each a way around the device binding ([What the kiosk refuses](/docs/kiosk#what-the-kiosk-refuses)).
