---
title: createAccess
description: "Better Auth with Access beside it: the options, claims, principal, profiles, tokens and sessions."
order: 7
section: guides
---

# createAccess

`createAccess` builds Better Auth with Access beside it. It opens no port and mounts nothing ([Hosts](/docs/hosts) does
that). Better Auth's options sit in the `betterAuth` block exactly as `betterAuth({...})` takes them, so you can paste
them from an existing Better Auth setup. Access's own concerns sit in their own blocks beside it.

```ts
// src/access.ts
import { createAccess } from "@aventara/access/auth";
import { PrismaPg } from "@prisma/adapter-pg";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { policies } from "./access.policies.js";
import { PrismaClient } from "./generated/prisma/client.js";

/** Better Auth's own Prisma client: it reads and writes its tables through it. */
const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/** What every token carries beside `sub`. */
const claims = { role: "string", banned: "boolean" } as const;

export const access = createAccess({
	// Better Auth's options, as betterAuth({...}) takes them.
	betterAuth: {
		database: prismaAdapter(prisma, { provider: "postgresql" }),
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
	},
	// The rules, and the claims they read. Each claim is read from the user's field
	// of the same name.
	policies: { rules: policies, claims },
	// The rules are typed with your own Principal, so map the token to it.
	principal: ({ sub, claims }) => ({
		id: sub,
		claims: {
			...(claims.role === "admin" ? { role: "admin" as const } : {}),
			...(claims.banned === undefined ? {} : { banned: claims.banned }),
		},
	}),
	// The rules read User, one of Better Auth's tables: open it explicitly.
	resources: { users: true },
});

export default access;
```

`src/access.policies.ts` is the file from [Rules](/docs/rules).

## With the framework: `access` replaces `policy` and the host's `state`

The instance is the framework's `access` option ([Hosts](/docs/hosts)). It brings the policy engine and each
request's state, `{ me }`. So the framework's configuration has no `policy`, and the host has no `state` option. Either
one beside `access` stops the app at startup:

| Beside `access` | Refused by | Message |
|---|---|---|
| `policy` in the configuration | `createFramework`, on every host (`CONFIG_INVALID_VALUE` at `policy`) | `policy cannot be configured with access: access.policy is the policy engine, and ctx.$state.me the principal; remove policy` |
| `state` on `AventaraModule` (NestJS) | The compiler where the configuration states `access`, and the module when the app starts | ``AventaraModule: the Framework is built with `access`, whose `state` seeds each request's state; remove the module's `state` option.`` |
| `state` in `Aventara()` (Next.js) | The compiler, and `Aventara()` when it is called | ``Aventara: the options carry both `access` and `state`; `access` seeds each request's state, so remove `state`.`` |

An app that seeds its own `state` today removes that option in the same change that adds `access`:

- Who the caller is comes from `principal`, as `me`. It may look the caller up in your own tables
  ([The principal](#the-principal)).
- `me` cannot be replaced, deleted or changed during the request. Every other key of `ctx.$state` is yours: a pipeline
  stage may write one (`ctx.$state.till = "till-1"`) for the stages after it, as on any `ctx.$state`. A compute stage
  reads it through the framework's read-only view.

## The base URL

Better Auth reads `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from the environment, or takes `secret` and `baseURL` in
the block. Access needs a base URL it can fix when the instance is built. Its tokens' issuer and audience are that URL's
origin: `baseURL`, else `BETTER_AUTH_URL`, or a dynamic `baseURL`'s `fallback`. With none, `createAccess` refuses with
`ACCESS_OPTIONS_INVALID`.

The issuer is the origin alone, not the path. Two apps on one origin that share a database (and so Better Auth's key
set) accept each other's tokens. Give each app its own origin, or its own database.

## The levers

| Option | Takes | Default |
|---|---|---|
| `betterAuth` | Better Auth's options | required |
| `policies.rules` | The builder, its `.contract()`, or a pulled policies file as JSON | required, except on a registry-only server |
| `policies.claims` | The claims a token carries beside `sub`, by type: `{ role: "string", banned: "boolean" }` | required with `rules` |
| `policies.claimsOf` | `({ user, session }) => claims`, or a promise of them, when the claims are not the user's fields of the same name | each claim from the user's field |
| `policies.guardrails` | The org's guardrails, as pulled ([Guardrails](/docs/guardrails)) | none |
| `policies.lock` | The project's `avAccess.lock.json` ([The lock at startup](/docs/registry-and-cli#the-lock-at-startup)) | none |
| `policies.requireLock` | `true`: refuse to start without `policies.lock`. Recommended in production. | `false` |
| `policies.tokenTtl` | How long a token lives, in whole seconds from 300 to 900 | 900 |
| `principal` | `(identity) => principal \| null`, or a promise of it: maps `{ sub, claims }` to your principal | `me` is the identity |
| `profile` | `{ kind: "web" }` or `{ kind: "service" }`. Kiosk mode is a Better Auth plugin in `betterAuth.plugins` ([Kiosk mode](/docs/kiosk)) | `web` |
| `registry` | `{ enabled: true }` turns on the registry ([Namespaces, the registry and the CLI](/docs/registry-and-cli)) | `{ enabled: false }` |
| `registry.ownership` | `"first-push"` or `"assigned"` | `"first-push"` |
| `audit` | `true`, `false` or `{ sink }` ([The audit log](/docs/audit-log)) | off |
| `resources` | `{ users?, members?, authTables? }` ([Better Auth's tables as Resources](/docs/auth-tables)) | both off |
| `passwords` | `{ argon2id, legacyScrypt? }` ([Passwords](/docs/passwords)) | `"owasp-minimum"` |
| `mcp` | `{ resource, openRegistration? }` ([Agents over MCP](/docs/agents-mcp)) | none |
| `audience` | This service's URL, for tokens addressed to it alone ([One audience per service](/docs/agents-mcp#one-audience-per-service)) | none |

An option `createAccess` does not take, or a block it cannot read, is refused with `ACCESS_OPTIONS_INVALID` and a
sentence that says what it takes.

## Claims

Each declared claim is read from the user's field of the same name. That field needs `input: false`, as `role` and
`banned` have above. A field without it is one the user sets themselves, at sign-up or with `/update-user`.
`createAccess` refuses such a field (`ACCESS_OPTIONS_INVALID`), for fields a plugin adds too.

- To read a claim from somewhere else, return it from `policies.claimsOf`. It must return every declared boolean
  claim, as `banned: user.banned === true`. An answer without one is a type error (`AccessClaimsAnswer`), and at run
  time it is refused and no token is issued.
- `null` or `undefined` for a boolean claim is `false`. A token carries every declared boolean claim.
- Read claims in `claimsOf` only from fields your server alone writes. Access does not check what it returns beyond
  the boolean claims.
- `policies.claims` is an `AccessClaimsDeclaration` (exported from `@aventara/access`, `@aventara/access/auth` and `@aventara/access/better-auth`, beside `AccessClaimsOf`, the claims a token carries): each
  claim's name and its type, `"string"`, `"number"` or `"boolean"`.
- A claim the rules read that `policies.claims` does not declare is a type error, and is refused at construction
  (`ACCESS_CLAIMS_UNDECLARED`).
- `tokenTtl` bounds how long a changed claim takes to reach every service. A user you ban gets the new claim with their
  next token.
- `claimsOf` may be async, to read a claim from a table of your own (an employee's role kept beside Better Auth's
  user). Access does not cache its answer. It runs when a token is issued, and once on each request read by its
  session cookie. A request with a bearer token reads the claims the token carries and does not run it. A query in `claimsOf` is that many more queries per request.

## The principal

`principal` is required when the rules are typed with your own principal, and optional when they are typed with
`AccessIdentity<typeof claims>`.

- Return `null` to leave the caller anonymous.
- Carry the token's claims as they are. A boolean claim the principal drops is unknown to the rules, so a deny such as
  `banned: true` refuses it.
- `principal` may be async: look the caller up in your own tables (`await prisma.employee.findUnique({ where: {
  authId: sub } })`). Access does not cache its answer. It runs once on every request whose cookie or token proves
  someone, and never for an anonymous one, so a query in it is one more query per request. If you cache it, key the
  cache by `sub` and keep its life short: a role you change reaches `me` only when the cache lets it go.
- Return a new object for each user (one cached per user is fine). An object `principal` already returned for another
  user is refused with `ACCESS_OPTIONS_INVALID`: the audit log names the user each principal stands for. Only the
  object `principal` returns is checked; a `Map`, `Date` or other object inside it is not. `me` is a frozen copy of
  its plain data, so your object itself is never frozen.

## Profiles

| Profile | What it does |
|---|---|
| `{ kind: "web" }` | Better Auth as you configured it. The default. |
| `{ kind: "service" }` | Hands no caller a new session, and reads the principal from bearer tokens only |

On the `service` profile, the routes that start a session answer `404`: `/sign-in/*`, `/sign-up/*`, the OAuth
callbacks, and the plugins' routes that sign a user in. They are matched by Better Auth's endpoint path, whatever the
URL's spelling. Any other route cannot create a session either, and no session cookie leaves `access.handler`. Your
server's own calls to Better Auth's API with no request still sign users in.

## The plugins it installs

`createAccess` installs Better Auth's `jwt()` plugin and its own Access plugin (plugin id `aventara-access`). Putting
either in `betterAuth.plugins` is a type error, and is refused at run time with `ACCESS_PLUGIN_DUPLICATE`. So is a plugin
that defines one of `jwt()`'s endpoints. Every other Better Auth plugin passes through as it is.

## What the instance holds

| Member | What it is |
|---|---|
| `access.handler` | Better Auth's request handler, `(Request) => Promise<Response>`, with Access's routes |
| `access.api` | Better Auth's server API, as `auth.api` |
| `access.options` | The options Better Auth runs with: your block plus the installed plugins. Your block's plain data (its plain objects and arrays) is a frozen copy taken when `createAccess` ran, so changing it in your block afterwards does not reach Better Auth. Plugin objects, functions and class instances (the adapter, a database client or pool) are kept as you gave them and not frozen |
| `access.$Infer` | Types only: `Session`, `Me` (the principal) and `Claims` |
| `access.policy` | The policy engine. It is built on first read. |
| `access.state({ headers })` | The request's state, `{ readonly me }`. `me` is a copy of the plain data `principal` returned (its plain objects and arrays, all the way down), frozen, and the state holds it read-only, so no code that runs during the request can replace or change the principal the policy decides for. A class instance, `Map`, `Set`, `Date`, typed array or getter is kept as you returned it and is not frozen: return plain data for the fields the rules read. Your own objects are never frozen. Under an OAuth access token, return a plain object: a `Map` or `Set` principal is not supported there, and a class instance loses its `#private` fields |
| `access.registry` | The registry's operator API, with `registry: { enabled: true }` only |
| `access.client` | Where Access is mounted and the `$access` verbs it serves ([The `$access` verbs](/docs/access-verbs)) |
| `access.mcp` | The framework's `mcp.authorization`, with `mcp` only ([Agents over MCP](/docs/agents-mcp)) |

## Tokens and sessions

`state` reads the `Authorization` header first. When the header is there, the session cookie is never read: a valid
`Bearer` token gives its identity, and anything else gives `me: null`.

A token is accepted when all of this holds:

- It is signed by a key of the instance's key set (`GET /api/auth/jwks`). Access reads the set every 5 minutes, and at
  once (at most every 5 seconds) for a key it does not hold.
- Its `iss` and its `aud` are both the instance's issuer. An audience list that merely includes it is refused.
- It has `sub`, `exp` and `iat`, has not expired, and was issued no longer ago than `tokenTtl`. 5 seconds of clock skew
  are allowed.
- It carries no claim beyond the declared ones.

The session cookie (the `web` profile) is read from Better Auth's store, never from its cookie cache, so a
revoked session gives `me: null` at once. On a request that may change something, the cookie counts only when the
request comes from a site Better Auth trusts (its `Origin`, or `Sec-Fetch-Site`).

A token is not revoked. One issued before a sign-out keeps verifying until it expires, for at most `tokenTtl` (15
minutes by default). A service that must see a sign-out at once reads the session instead.

A session cookie set to `sameSite: "none"` is refused with `ACCESS_OPTIONS_INVALID` unless `trustedOrigins` names the
origins your app is served from.

Better Auth's origin and CSRF checks stay on, or Access refuses to start (`ACCESS_OPTIONS_INVALID`): with them
off, a sign-in form another site posts signs the browser in, and a request with the session cookie acts as its user.
Refused, whatever NODE_ENV: `advanced.disableOriginCheck` (`true`, or a list of paths) and `advanced.disableCSRFCheck`;
and the checks off in Better Auth's context (`skipOriginCheck`, `skipCSRFCheck`), as another plugin's `init` may set
them, but for `@better-auth/sso`'s SAML paths. Outside NODE_ENV=test, Better Auth's test mode is refused too: it takes
any value of the `TEST` environment variable but `"false"` as test mode, which turns these checks and its secret check
off. Under NODE_ENV=test, Better Auth's own default stands: it turns the origin check off unless you write
`advanced.disableOriginCheck: false`, as a test of origins does. There is no way around the refusal of the two options: [Instead of turning the CSRF
check off](/docs/hosts#instead-of-turning-the-csrf-check-off) says what to do for an API, a native app, another
server, tests and local development.

`trustedOrigins` is also Better Auth's CSRF and redirect allowlist, so a wildcard in it must sit under a domain you
own. An entry whose host is a wildcard alone (`"*"`, `"http://*"`, `"*://*"`, `"*:3000"`), here or in
`BETTER_AUTH_TRUSTED_ORIGINS`, trusts every site, as the CSRF check off would, and is refused
(`ACCESS_OPTIONS_INVALID`). Access warns of any other wildcard (`https://*.example.com`) outside
`NODE_ENV=production` (`ACCESS_TRUSTED_ORIGIN_WILDCARD`) and takes it; what it cannot guarantee when a wildcard matches a site you do not control is in [Trusted origins and
wildcards](/docs/hosts#trusted-origins-and-wildcards).

### When a user's role changes

A role read in `principal` or `claimsOf` takes effect on the user's next request read by a session cookie. To make
the user sign in again after a role change (a manager demoted), end their sessions with Better Auth's admin plugin
(`admin()` in `betterAuth.plugins`): your server calls `revokeUserSessions` with the request headers of an admin who
made the change. Ending sessions does not stop anyone from signing in again: for someone who leaves, see
[below](#when-someone-leaves).

```ts
// src/staff.role-change.ts
import { access } from "./access.js";

/**
 * `access.api.revokeUserSessions`, as Better Auth's admin plugin types it once `admin()`
 * is in `betterAuth.plugins` (named here so this file compiles beside any `access.ts`).
 */
type AdminApi = {
	revokeUserSessions(input: {
		readonly body: { readonly userId: string };
		readonly headers: Headers;
	}): Promise<{ readonly success: boolean }>;
};

/** After your own write of `userId`'s new role, made by the admin whose request `headers` carries. */
export const endSessionsOf = async (userId: string, headers: Headers) => {
	const api = access.api as unknown as AdminApi;
	await api.revokeUserSessions({ body: { userId }, headers });
};
```

- The call needs an admin's session: with another user's headers it is refused `403`, and with none `401`.
- Every session of the user ends at once, on every device: a cookie gives `me: null` on its next request.
- The user's password and kiosk PIN still work. They sign in (or switch in at a till) again, and their new session
  reads the new role.
- A token issued before keeps verifying until it expires, for at most `tokenTtl` (15 minutes by default).
- A till stays enrolled. Ending a user's sessions ends their PIN session on it, and they switch in again with their PIN;
  the device belongs to the till, not to its users. Revoke a device with `kioskOf(access).revokeDevice` ([Kiosk](/docs/kiosk)).
- An app that builds Better Auth itself (the Better Auth plugin) can also end them with no admin request, through
  Better Auth's internal adapter: `(await auth.$context).internalAdapter.deleteUserSessions(userId)`. `createAccess`
  does not expose Better Auth's context.

### When someone leaves

Ending a leaver's sessions is not enough: their password and their kiosk PIN still open new ones. Ban them, or remove
them, with the admin plugin's `banUser` or `removeUser`, called with an admin's request headers as above:

```ts
// src/staff.offboarding.ts
import { access } from "./access.js";

/** Better Auth's admin plugin's `banUser` and `removeUser`, as `access.api` carries them once `admin()` is on. */
type AdminApi = {
	banUser(input: {
		readonly body: { readonly userId: string; readonly banReason?: string };
		readonly headers: Headers;
	}): Promise<unknown>;
	removeUser(input: {
		readonly body: { readonly userId: string };
		readonly headers: Headers;
	}): Promise<{ readonly success: boolean }>;
};

/**
 * Ends `userId`'s sessions and refuses them new ones, password and PIN alike, and
 * Access counts them as nobody. Their rows stay, API keys included (see below).
 */
export const banLeaver = async (userId: string, headers: Headers) => {
	const api = access.api as unknown as AdminApi;
	await api.banUser({ body: { userId, banReason: "left" }, headers });
};

/** Deletes `userId`: their sessions, accounts and kiosk PIN go with the user row. */
export const removeLeaver = async (userId: string, headers: Headers) => {
	const api = access.api as unknown as AdminApi;
	await api.removeUser({ body: { userId }, headers });
};
```

- A ban ends every session of the user at once, and sets the user's `banned` field. Better Auth then refuses them a new
  session, by password (`403 BANNED_USER`) or by PIN at a till. A banned user cannot enroll a till, their device
  enrollment codes stop working, and they cannot approve on a till ([Kiosk](/docs/kiosk)).
- A token issued before the ban keeps verifying, still carrying `banned: false` (the claim in the samples here), for
  at most `tokenTtl`. A service that must refuse at once reads the session instead.
- With the API-key plugin (`@better-auth/api-key` with `enableSessionForAPIKeys`), a ban does not stop the leaver's
  keys. The plugin builds a session for a key's owner without checking the ban, so Better Auth's own routes still act
  as them. Access checks it: for a user the admin plugin holds banned, `me` is `null` whatever session the request
  carries, and `GET /token` issues no token (`403 BANNED_USER`). To stop the keys everywhere, remove the user (a key
  whose owner is gone opens nothing), or delete the plugin's `apikey` rows whose `referenceId` is the leaver's id.
  The plugin's own routes let only a key's owner delete it, and refuse a banned owner.
- Removing a user deletes their row. Their kiosk PIN goes with it (the PIN table references the user with `onDelete:
  cascade`), so keep foreign keys on where your database lets you turn them off.
- `banUser` takes `banExpiresIn` (seconds) for a ban that ends by itself. Without it the ban never ends, unless the app
  set `admin({ defaultBanExpiresIn })`: then every ban ends after that many seconds, and `banUser` cannot make one
  permanent (`banExpiresIn: 0` counts as left out). For someone who left, leave `defaultBanExpiresIn` unset, or remove
  them.

### What `admin()` also opens

`admin()` mounts more than `revokeUserSessions`, `banUser` and `removeUser`. Under `/admin/` it also serves
impersonating a user, setting a user's role or password, creating and updating users, and listing users and their
sessions. Each is allowed to every user whose `role` the plugin counts as an admin role, and by default that is any
user whose `role` is `"admin"`: the role the samples here give an app's administrators. With the defaults, every app
admin may sign in as any other non-admin user and set anyone's password.

Give the plugin a role of its own, that your rules do not use, and give it only to the people who should hold those
powers: `admin({ adminRoles: ["auth-admin"], roles: { "auth-admin": adminAc, user: userAc } })`, with `adminAc` and
`userAc` from `better-auth/plugins/admin/access`. A role made with that module's `defaultAc.newRole({ session:
["revoke"], user: ["ban"] })` may only end sessions and ban, once it is listed in `roles` beside the others (`roles: {
"auth-admin": adminAc, ops, user: userAc }`, with `ops` that role). A user whose role is not in `roles` gets none of
the plugin's routes.

## Better Auth's tables

Better Auth's tables go into your schema the way Better Auth's docs say. With Prisma,
`npx auth@~1.7.12 generate --config src/access.ts --yes` writes Better Auth's models (and Access's own tables, when `audit` or
`registry` is on) into `prisma/schema.prisma`. It reads the module's default export. Then migrate with Prisma and run
`aventara:prepare` again. Its first run may print a Babel note that an identifier such as `AvComputedFields` "is not
declared in Babel's scope tracker": a type the discovery artifact re-exports, and harmless.

Access closes Better Auth's tables to every request until you open them ([Better Auth's tables as
Resources](/docs/auth-tables)).

## User ids

Better Auth's ids are strings. If `User.id` in `prisma/schema.prisma` is an `Int` (`aventara new` 1.0.0-rc.11 and
earlier writes one), make it `id String @id @default(cuid())` before you run `generate`. Better Auth's numeric ids
(`advanced.database.generateId: "serial"`) are refused: under them Better Auth does not enforce its single-use checks
(`private_key_jwt` client assertions, DPoP proofs, SAML assertion ids, the magic-link, email-OTP and SIWE locks), and
ids written differently (`"01"`, `"1e0"`) name the same user. Ids the database makes
(`advanced.database.generateId: false`, or the earlier `advanced.generateId: false`) are refused too: Access does not
support them. A `generateId` function is not checked: it must not answer `false` for a model.

Moving an app off numeric ids is on [Upgrading](/docs/upgrading#100-rc1-to-100-rc2).

## SQLite

Access runs on SQLite either way Better Auth reaches it. `examples/sqlite` in the repository runs both: sign-up, sign-in,
a token, `me` by cookie and by token, and a decision of the rules.

On Better Auth's Prisma adapter, with the Prisma 7 client on its better-sqlite3 driver adapter
(`@prisma/adapter-better-sqlite3`) and `provider: "sqlite"`. Better Auth's models go into a `provider = "sqlite"`
schema as on PostgreSQL, and Access finds each table by its Prisma model:

```ts
// src/access.sqlite.ts
import { createAccess } from "@aventara/access/auth";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { policies } from "./access.policies.js";
import { PrismaClient } from "./generated/prisma/client.js";

/** Better Auth's own Prisma client on the SQLite file: never the one your framework adapter is given. */
const prisma = new PrismaClient({
	adapter: new PrismaBetterSqlite3({
		url: process.env.DATABASE_URL ?? "file:./dev.db",
	}),
});

const claims = { role: "string", banned: "boolean" } as const;

export const access = createAccess({
	betterAuth: {
		database: prismaAdapter(prisma, { provider: "sqlite" }),
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
	},
	policies: { rules: policies, claims },
	principal: ({ sub, claims }) => ({
		id: sub,
		claims: {
			...(claims.role === "admin" ? { role: "admin" as const } : {}),
			...(claims.banned === undefined ? {} : { banned: claims.banned }),
		},
	}),
	resources: { users: true },
});

export default access;
```

Better Auth's CLI reads the module's default export: `npx auth@~1.7.12 generate --config src/access.sqlite.ts --yes`
writes Better Auth's models into `prisma/schema.prisma`, and Prisma makes the tables (`npx prisma db push`, or
`npx prisma migrate dev`).

On Better Auth's built-in SQLite, `database` is the database itself: Node's `DatabaseSync` (`node:sqlite`), as here, or
a better-sqlite3 `Database`. This sample opens the scaffold's own `dev.db`, the file `DATABASE_URL` names, so Better
Auth writes the same `user` rows the framework reads through Prisma. Prisma owns the tables: Better Auth's models are
in `prisma/schema.prisma` (as `generate` writes them from the Prisma-adapter sample above) and `npx prisma db push`
makes them. Do not run Better Auth's migration on that file: it finds nothing to make, and warns that Prisma's
date columns are not the type it would make. Off Prisma's adapter nothing ties a table to a Resource by name, so
`resources.authTables` names the Prisma model each one is ([Better Auth's tables as Resources](/docs/auth-tables)):

```ts
// src/access.sqlite-builtin.ts
import { DatabaseSync } from "node:sqlite";
import { createAccess } from "@aventara/access/auth";
import { policies } from "./access.policies.js";

const claims = { role: "string", banned: "boolean" } as const;

export const access = createAccess({
	betterAuth: {
		// The scaffold's `dev.db` (Prisma's `file:` URL, as a path from the project root,
		// without any `?` query).
		database: new DatabaseSync(
			(process.env.DATABASE_URL ?? "file:./dev.db")
				.replace(/^file:/, "")
				.replace(/\?.*$/, ""),
		),
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
	},
	policies: { rules: policies, claims },
	principal: ({ sub, claims }) => ({
		id: sub,
		claims: {
			...(claims.role === "admin" ? { role: "admin" as const } : {}),
			...(claims.banned === undefined ? {} : { banned: claims.banned }),
		},
	}),
	resources: {
		users: true,
		authTables: {
			user: "User",
			session: "Session",
			account: "Account",
			verification: "Verification",
			jwks: "Jwks",
		},
	},
});

export default access;
```

On a file of its own, which nothing else reads (no framework Resource on Better Auth's tables), Better Auth's
migration makes the tables instead: `npx auth@~1.7.12 migrate --config src/access.sqlite-builtin.ts --yes`. Keep one
owner per file, Prisma or Better Auth's migration, never both.

### Give Better Auth a connection of its own

On SQLite, Better Auth must have a database connection that nothing else writes through: a `PrismaClient` (with its
own better-sqlite3 driver adapter) made for Better Auth alone, as in the sample above, or Better Auth's built-in SQLite.
Never hand Better Auth's adapter the Prisma client your framework adapter or your own code uses. With kiosk mode, the
audit log or the registry on, this is a requirement, not a tuning choice.

SQLite takes one write at a time per file, and Prisma's better-sqlite3 driver adapter holds one connection per client.
Only an interactive transaction (`$transaction(async (tx) => …)`) takes that connection's lock. A plain query that
arrives while one is open runs on the same connection, inside it. `examples/sqlite` shows what that means:

- **Better Auth on the same Prisma client as another transaction.** A Better Auth write that lands while another
  request's interactive transaction is open (a framework write with `forceTransaction`, or any `$transaction` of
  yours) runs inside it. Better Auth answers success, and when that transaction rolls back the write goes with it. For
  a sign-up that loses a user. For the writes security rests on it is worse: an audit row, a session revocation, a ban,
  a kiosk device's or PIN's failure counter, each answered as done and then undone.
- **The other way round.** Better Auth opens short transactions of its own on Prisma's adapter: with `transaction:
  true`, and for a few steps (using up a verification value, counting a two-factor attempt or a rate-limit hit in the
  database). A framework write or one of yours that arrives on a shared client while one is open runs inside it, and
  is undone if that Better Auth step fails.
- **Better Auth on a connection of its own to the same file** (a second Prisma client, or its built-in SQLite). A write
  while the other connection's transaction holds the file is refused at once: SQLite answers "database is locked", and
  Better Auth answers, for a sign-up, `422 FAILED_TO_CREATE_USER`. The write is lost only if the client gives up;
  nothing it was told succeeded is undone. Keep transactions short so such refusals stay rare.
- **Better Auth's built-in SQLite, on a database nothing else writes.** Its query builder (Kysely) runs one query or
  transaction at a time on that database, so its own writes never meet inside another's transaction.

On the framework's side, a change to `@aventara/prisma7-adapter` makes its plain operations wait for an open
transaction on its client ([framework pull request #221](https://github.com/mhmd-hatem/Aventara-Framework/pull/221)).
That covers the framework's queries, not the ones Better Auth sends through a Prisma client, so Better Auth needs its
own connection either way.
