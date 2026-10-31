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
});

export default access;
```

`src/access.policies.ts` is the file from [Rules](/docs/rules).

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
| `policies.claimsOf` | `({ user, session }) => claims`, when the claims are not the user's fields of the same name | each claim from the user's field |
| `policies.guardrails` | The org's guardrails, as pulled ([Guardrails](/docs/guardrails)) | none |
| `policies.lock` | The project's `avAccess.lock.json` ([The lock at startup](/docs/registry-and-cli#the-lock-at-startup)) | none |
| `policies.requireLock` | `true`: refuse to start without `policies.lock`. Recommended in production. | `false` |
| `policies.tokenTtl` | How long a token lives, in whole seconds from 300 to 900 | 900 |
| `principal` | `(identity) => principal \| null`: maps `{ sub, claims }` to your principal | `me` is the identity |
| `profile` | `{ kind: "web" }`, `{ kind: "service" }`, or the kiosk profile ([The kiosk profile](/docs/kiosk)) | `web` |
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
- A claim the rules read that `policies.claims` does not declare is a type error, and is refused at construction
  (`ACCESS_CLAIMS_UNDECLARED`).
- `tokenTtl` bounds how long a changed claim takes to reach every service. A user you ban gets the new claim with their
  next token.

## The principal

`principal` is required when the rules are typed with your own principal, and optional when they are typed with
`AccessIdentity<typeof claims>`.

- Return `null` to leave the caller anonymous.
- Carry the token's claims as they are. A boolean claim the principal drops is unknown to the rules, so a deny such as
  `banned: true` refuses it.
- Return a new object for each user (one cached per user is fine). An object `principal` already returned for another
  user is refused with `ACCESS_OPTIONS_INVALID`: the audit log names the user each principal stands for. Only the
  object `principal` returns is checked; a `Map`, `Date` or other object inside it is not. `me` is a frozen copy of
  its plain data, so your object itself is never frozen.

## Profiles

| Profile | What it does |
|---|---|
| `{ kind: "web" }` | Better Auth as you configured it. The default. |
| `{ kind: "service" }` | Hands no caller a new session, and reads the principal from bearer tokens only |
| `{ kind: "kiosk", … }` | The web profile plus staff switching by PIN on shared devices ([The kiosk profile](/docs/kiosk)) |

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
| `access.options` | The options Better Auth runs with: your block plus the installed plugins |
| `access.$Infer` | Types only: `Session`, `Me` (the principal) and `Claims` |
| `access.policy` | The policy engine. It is built on first read. |
| `access.state({ headers })` | The request's state, `{ readonly me }`. `me` is a copy of the plain data `principal` returned (its plain objects and arrays, all the way down), frozen, and the state holds it read-only, so no code that runs during the request can replace or change the principal the policy decides for. A class instance, `Map`, `Set`, `Date`, typed array or getter is kept as you returned it and is not frozen: return plain data for the fields the rules read. Your own objects are never frozen. Under an OAuth access token, return a plain object: a `Map` or `Set` principal is not supported there, and a class instance loses its `#private` fields |
| `access.registry` | The registry's operator API, with `registry: { enabled: true }` only |
| `access.client` | Where Access is mounted and the `$access` verbs it serves ([The `$access` verbs](/docs/access-verbs)) |
| `access.kiosk` | The kiosk profile's operator API ([The kiosk profile](/docs/kiosk)) |
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

The session cookie (profiles `web` and `kiosk`) is read from Better Auth's store, never from its cookie cache, so a
revoked session gives `me: null` at once. On a request that may change something, the cookie counts only when the
request comes from a site Better Auth trusts (its `Origin`, or `Sec-Fetch-Site`).

A token is not revoked. One issued before a sign-out keeps verifying until it expires, for at most `tokenTtl` (15
minutes by default). A service that must see a sign-out at once reads the session instead.

A session cookie set to `sameSite: "none"` is refused with `ACCESS_OPTIONS_INVALID` unless `trustedOrigins` names the
origins your app is served from.

## Better Auth's tables

Better Auth's tables go into your schema the way Better Auth's docs say. With Prisma,
`npx auth@~1.7.12 generate --config src/access.ts` writes Better Auth's models (and Access's own tables, when `audit` or
`registry` is on) into `prisma/schema.prisma`. It reads the module's default export. Then migrate with Prisma and run
`aventara:prepare` again. Its first run may print a Babel note that an identifier such as `AvComputedFields` "is not
declared in Babel's scope tracker": a type the discovery artifact re-exports, and harmless.

The project `aventara new` creates has a numeric `User.id`. Better Auth's ids are strings by default. Put
`advanced: { database: { generateId: "serial" } }` in the `betterAuth` block before you run `npx auth@~1.7.12 generate`,
and map `sub` with `Number(sub)` in `principal`. The command only adds what the schema lacks, so on a schema that
already has Better Auth's models with `String` ids it changes nothing: delete those models, then run it again. Better Auth's single-use checks (SAML assertion ids, DPoP proofs,
`private_key_jwt` assertions) are not enforced with `"serial"`: if you use those, change `User.id` to `String` instead.

Access closes Better Auth's tables to every request until you open them ([Better Auth's tables as
Resources](/docs/auth-tables)).
