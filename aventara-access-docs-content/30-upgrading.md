---
title: Upgrading
description: "What to change in your app when you move to a newer Access, one release at a time."
order: 30
section: get-started
---

# Upgrading

What to change in your app when you move to a newer Access. Each section takes you one release forward; to skip a
release, follow every section in between. The package's `CHANGELOG.md` lists everything a release changed. This page
keeps the steps.

From 1.0.0-rc.3 on, after any upgrade, run `npx --no-install avaccess skill` again so the agent skill in your project
matches the new release ([the CLI](/docs/registry-and-cli#a-services-commands)). The command does not exist in
1.0.0-rc.2 and earlier: on the way from 1.0.0-rc.1 to 1.0.0-rc.2, copy the skill out of
`node_modules/@aventara/access/skill/` by hand, as that release's README says.

## 1.0.0-rc.3 to 1.0.0-rc.4

Access 1.0.0-rc.4 ships beside `@aventara/better-auth-kiosk` and `@aventara/better-auth-onboarding` 1.0.0-rc.4. It is
tested with `better-auth` 1.7.17 and `@aventara/core` 1.0.0-rc.13, and still works with `better-auth` `~1.7.12` and
`@aventara/core` 1.0.0-rc.10 or later. Move the plugins you use to the same release:

```sh
npm install --save-exact @aventara/access@1.0.0-rc.4
npm install --save-exact @aventara/better-auth-kiosk@1.0.0-rc.4
npm install --save-exact @aventara/better-auth-onboarding@1.0.0-rc.4
```

Then run `npx --no-install avaccess skill` again.

### A till that is a native app (opt in)

A browser till and an Expo till change nothing. A till that is a native app with no cookie jar (a Capacitor or Cordova
WebView, an Electron app's main process, a native HTTP client) can now carry its PIN session in `Authorization: Bearer`
and its device credential in a `kiosk-device` header
([A till that is a native app](/docs/kiosk#a-till-that-is-a-native-app-headers)). To use it:

1. Put `bearer({ requireSignature: true })` (from `better-auth/plugins`) in `plugins` before `kiosk()`. With the
   onboarding plugin the order is `onboarding()`, then `bearer()`, then `kiosk()`. 1.0.0-rc.3 refused `bearer()`
   beside the kiosk outright; now the kiosk refuses it (`KIOSK_OPTIONS_INVALID`) only without
   `requireSignature: true` or when it is listed after `kiosk()`.
2. Answer CORS for the app's origins, allowing the `authorization` and `kiosk-device` request headers and exposing the
   `set-auth-token` and `set-kiosk-device` answer headers, with no credentials.
3. Give the app an origin of its own (never `capacitor://localhost`, `https://localhost` or the server's host), list it
   in `trustedOrigins`, and send it as `Origin` when the app's HTTP stack adds Fetch Metadata (Node's `fetch` sends
   `Sec-Fetch-Mode: cors`). Without it Better Auth refuses a redeem or a sign-in with `403 MISSING_OR_NULL_ORIGIN`.
4. Such a till calls `switch-user` and `enroll-device` itself: `access.client.verbs.switchUser.call` and
   `enrollDevice.call` refuse (`400`) a request that carries its credentials in headers.

### Everything else

- **A signed bearer token is a credential.** With `bearer({ requireSignature: true })` among Better Auth's plugins, on
  the `web` profile and without `audience`, a signed session token in `Authorization: Bearer` now makes the request
  its user's in the framework, kiosk or not. Such a principal is refused every question under origin `agent`. If your
  app lists signed `bearer()`, check that its tokens should reach your rules. Without `requireSignature: true`, a
  bearer token is read only as Access's own token, as before.
- **`KIOSK_DEVICE_BUSY` on SQLite.** A kiosk write SQLite refuses because another connection holds the file now
  answers `409 KIOSK_DEVICE_BUSY` (and `kioskOf(auth)` throws it as Better Auth's `APIError`) instead of a `500`. Retry
  once on it.
- **`ACCESS_POLICIES_INVALID`.** A rule or a guardrail the engine cannot run is refused with an `AccessError` whose
  `code` is `ACCESS_POLICIES_INVALID` (`.contract()`, `.engine()`, `createAccessEngine`, `createAccess`,
  `defineGuardrails`, `policiesHash`). It was a plain `Error` with no code; the messages are the same. Code that
  tells these apart by class or by a missing `code` should read the code.
- **`TS2883` under pnpm with `declaration: true`.** An exported `createAccess` instance with `admin()`, `twoFactor()`
  or `passkey()` fails with `TS2883` (or `TS2742`). Annotate the export with
  `Access<BetterAuthOptions, typeof claims, Governed, Principal>`, which now takes any `createAccess` instance, or set
  `"declaration": false` ([Better Auth's tables](/docs/create-access#better-auths-tables)).
- **`avaccess verify --client`** with a file that is not a `.ts` file inside the project exits `2` (the command could
  not run), not `1`. A script that reads exit `1` as a stale client should treat `2` as a broken call.
- **`access.client.verbs.me.call` no longer counts as a till's use** of its session (the `idleTimeout` timer),
  whatever the method of the request it stands for. A till kept open only by calls to `me` now locks when idle.
- **Fixed, and a reason to move:** with the kiosk and the onboarding plugins together, a till's framework requests
  other than reads answered `500` from about 15 seconds after each PIN switch.

## 1.0.0-rc.2 to 1.0.0-rc.3

Access 1.0.0-rc.3 ships beside two new Better Auth plugins, `@aventara/better-auth-kiosk` and
`@aventara/better-auth-onboarding` (both 1.0.0-rc.3). It is tested with `better-auth` 1.7.17 and `@aventara/core`
1.0.0-rc.12, audited through `better-auth` 1.7.20, and still works with `better-auth` `~1.7.12` and `@aventara/core`
1.0.0-rc.10 or later.

```sh
npm install --save-exact @aventara/access@1.0.0-rc.3
```

### Kiosk mode moved to `@aventara/better-auth-kiosk`

Only for apps that ran `profile: { kind: "kiosk" }`. There is no shim: `createAccess` refuses the old profile with a
sentence that names the plugin.

1. Install the plugin: `npm install --save-exact @aventara/better-auth-kiosk@1.0.0-rc.3`.
2. Move the profile's keys into `kiosk({ canEnrollDevice, idleTimeout?, insecureLan? })` in `betterAuth.plugins`, and
   set `profile` back to `{ kind: "web" }` (or leave it out).
3. `canEnrollDevice` is now asked with Better Auth's rows, `({ user, session })`, not `({ sub, claims })`: read the role
   from `user` (`user.role === "admin"`), or look it up by `user.id` in your own tables ([Kiosk](/docs/kiosk)).
4. Replace the removed names:

   | 1.0.0-rc.2 | 1.0.0-rc.3 |
   |---|---|
   | `AccessKioskProfile` (from `@aventara/access/auth`) | `KioskOptions` from `@aventara/better-auth-kiosk` |
   | `AccessKiosk` | `KioskOperator` |
   | `AccessKioskDevice` | `KioskDevice` |
   | `AccessProfileOptions<C>` | `AccessProfileOptions` (no type parameter) |
   | `access.kiosk.listDevices()`, `access.kiosk.revokeDevice()` | `kioskOf(access).listDevices()`, `kioskOf(access).revokeDevice()` |
   | `access.api.kioskSetUserPin({ body: { userId, pin } })` | `kioskOf(access).setUserPin(userId, pin)`; the PIN it sets must be changed at the till before it opens a session |

5. The tables are renamed: `accessKioskDevice`, `accessKioskPin`, `accessKioskLockout` and `accessKioskRetiredSecret`
   become `kioskDevice`, `kioskPin`, `kioskLockout` and `kioskRetiredSecret`. Keep your table names with the plugin's
   `schema` option (`schema: { kioskDevice: { modelName: "accessKioskDevice" }, … }`) or rename them. Either way run
   Better Auth's migration: `kioskPin.mustChange`, `kioskDevice.enrollmentCodeId` and the `kioskDeviceEnrollmentCode`
   table are new. Off Prisma's adapter, name the new table in `resources.authTables`.
6. Start Better Auth before your server listens: `await access.api.ok()`. The kiosk now refuses the Better Auth
   options that break a device-bound session when Better Auth builds its context, with `KIOSK_OPTIONS_INVALID`, no
   longer when `createAccess` is called. `serve()` and `avaccess serve` do this themselves and refuse to start.
7. With your own `emailAndPassword.password` hook, give the plugin a `pinHasher` that reads Access's argon2id PIN
   hashes as well as your hook's, or set every PIN again. Without a hook of your own nothing changes.

Enrolled devices keep working: the device cookie, the credentials, the session fields and the routes are the same, and
the framework's `$access` kiosk verbs still reach them through Access.

### Everything else

- **Rules follow Prisma's `where`.** Each rule matches what Prisma's `findMany({ where })` returns for it. In
  1.0.0-rc.2, `can` read `NOT` over a NULL field, and `NOT` over a relation whose row is missing, as matching, while
  Prisma's query (and so `scopeOf`) did not. A grant `{ NOT: { status: "DRAFT" } }` no longer allows a post whose
  `status` is NULL, and a deny with it no longer refuses one. `notIn: []` now matches every row, NULL included. To
  cover NULL, say so: `{ OR: [ …, { status: null }] }`. Run `avaccess generate` again in a service with a generated
  client: `avaccess verify` now refuses a client another Access version wrote.
- **A `null` inside `in`/`notIn`, or an empty condition below a rule's root, is refused.** A pinned registry revision
  that holds one now fails on `avaccess pull`, `generate` and `verify`, and an engine built from it refuses to start.
  Before you upgrade a service, fix the rules where they are authored (`{ OR: [{ status: { in: [ … ] } }, { status:
  null }] }`, or remove the empty condition), push, and pull the new revision.
- **Better Auth.** Access is tested with 1.7.17, and audited through 1.7.20. On Better Auth 1.7.12 to 1.7.15 it still refuses an organization
  plugin without `requireEmailVerificationOnInvitation: true` (Better Auth's advisory GHSA-fmh4-wcc4-5jm3, fixed in
  1.7.16).
- **The registry refuses Better Auth's memory adapter** (and a configuration with no `database`) with
  `ACCESS_OPTIONS_INVALID` when Better Auth starts. Run the registry on a real database. Tables you made by hand need
  the unique indexes the migration creates.
- **Set `transaction: true` on Prisma's or Drizzle's adapter** for an Access server that runs the registry, so a push
  refused partway keeps nothing it had claimed.
- **The audit log has new columns** with `audit: true` (`codeId`, `deviceName`, `approvalId`, `requesterId`, `subject`,
  `expiresAt`, beside `deviceId` and `previousUserId`): run Better Auth's migration (`npx auth@~1.7.12 generate` or
  `npx auth@~1.7.12 migrate`).
- **Revoked and rotated keys** keep a `retired:<row id>` value in place of `null`. Nothing to migrate.
- **The onboarding plugin** is new. Access finds it in `betterAuth.plugins` by its id. Off Prisma's adapter, name its
  tables (`onboardingStep`, `onboardingAttempt`, `onboardingInvite`) in `resources.authTables`
  ([Onboarding](/docs/onboarding)).
- **The agent skill** is written by `npx --no-install avaccess skill` now, not copied out of `node_modules`.

## 1.0.0-rc.1 to 1.0.0-rc.2

Access 1.0.0-rc.2 refuses numeric user ids. An app made with `aventara new` 1.0.0-rc.11 or earlier has `User.id` as an
`Int`, and 1.0.0-rc.1's README told it to set `generateId: "serial"`. Such an app refuses to start
(`ACCESS_OPTIONS_INVALID`) until it moves to string ids:

1. Remove `advanced.database.generateId: "serial"` from the `betterAuth` block.
2. Make `User.id` a `String` (`id String @id @default(cuid())`), with every id and reference to it in Better Auth's
   tables, Access's tables, and your own models (`Note.authorId Int` becomes `String`). `aventara new` 1.0.0-rc.12
   scaffolds it this way already.
3. Map the principal with `id: sub` where it was `id: Number(sub)`, and type it `id: string` where your policies file
   has `id: number`.
4. Migrate the data, not only the schema: each id and foreign-key column becomes text, each row keeping its id as a
   string (`1` becomes `"1"`).
5. With Better Auth's OAuth provider, revoke the refresh tokens it issued while on numeric ids.
6. With kiosk mode on numeric ids, a PostgreSQL `uuid` id column or a MySQL `_ci` collation, have your users set new
   PINs: under those, a PIN's failure counts could be got round.

Two more changes to check:

- **Mount NestJS and Express with the client's address.** `toNodeHandler(access)` alone hands Better Auth no client
  address, so in production its rate limit put every client in one bucket. Add `clientAddressed` before the handler
  ([Hosts](/docs/hosts#nestjs)). On Next.js, run `next start` behind a proxy that overwrites `X-Forwarded-For`; on
  Vercel there is nothing to do. Run production with `NODE_ENV=production`.
- **The `betterAuth` block is copied and frozen** when `createAccess` is called. A change you make to your block
  afterwards no longer reaches Better Auth; make it before.
