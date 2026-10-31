---
title: "Introduction"
description: "What Aventara Access is, its parts, its status and what it needs."
order: 1
section: get-started
---

# Introduction

Aventara Access adds authorization to [Better Auth](https://www.better-auth.com). Better Auth signs users in and issues their tokens. Access decides what each user may do with each row and each field.

You write role-first rules, typed from your app's schema. Access compiles them to a policies file: plain JSON in the `aventara-access/policies@1` format. Its engine answers the questions an [Aventara](https://aventara.razor34.dev/framework/docs/introduction) app asks on every request: who may read, create, update or delete which rows, and which fields they may see.

Access is authorization only. It adds no token endpoint and no OAuth route of its own. Every credential comes from Better Auth: sessions, the `jwt()` plugin's tokens, and the OAuth provider's tokens for agents.

## A first look

A rule set reads like this. Roles first, then what each role may do, then what is refused whatever the grants say.

```ts
import { definePolicies } from "@aventara/access";
import { model } from "./generated/aventara/discovery.artifact.js";

export type Principal = {
	id: string;
	claims: { role?: "admin"; banned?: boolean };
};

export const policies = definePolicies(model)
	.principal<Principal>()
	.roles(({ me }) => ({
		admin: { global: { claims: { role: "admin" } } },
		dm: {
			on: "Campaign",
			where: { members: { some: { userId: me.id, role: "DM" } } },
		},
	}))
	.grants(({ grant }) => [
		grant("signedIn", "read", "Campaign"),
		grant("dm", ["read", "create", "update", "delete"], "Note", { in: "campaign" }),
	])
	.denies(({ deny }) => [deny("*", "*", { if: { claims: { banned: true } } })]);
```

Every name in a rule is checked against your schema. A Resource, field, relation or enum value that does not exist is a type error at the key that names it. See [Rules](/docs/rules) for the whole language.

## The parts

| Part | What it does |
|---|---|
| `@aventara/access` | `definePolicies`, `createAccessEngine`, `defineGuardrails`: the rules and the engine. They need no Better Auth and no server. |
| `@aventara/access/auth` | `createAccess`: Better Auth with Access beside it. Tokens with claims, the engine, each request's principal. |
| `@aventara/access/better-auth` | `aventaraAccess()`, `accessOf`, `aventaraAccessClient()`: Access as a plugin of the Better Auth you build yourself, and its client plugin. |
| `@aventara/access/standalone` | `serve(access)`: Access as its own HTTP server. |
| The registry | Namespaces, keys and the org's guardrails, stored in Better Auth's database. |
| `avaccess` | The command line: `push`, `pull`, `verify`, `status`, `diff`, `keys`, `generate`, `schema`, `serve`. |
| The generated client | Two TypeScript files (`avAccess.ts` and `avAccess.internal.ts`) that decide for a service that does not run on Aventara. |

## Three ways to use it

| You want | Use | Read |
|---|---|---|
| Better Auth and Access set up together | `createAccess()` | [createAccess](/docs/create-access), then [Hosts](/docs/hosts) |
| Access added to the Better Auth you already have | `aventaraAccess()` and `accessOf(auth)` | [The Better Auth plugin](/docs/better-auth-plugin) |
| Rules only, with your own authentication | `definePolicies(…).engine()` on the framework's `policy` option | [Rules](/docs/rules), [Hosts](/docs/hosts#the-engine-alone) |

When several services share one Access server, each service owns a namespace and pushes its own rules to the registry ([Namespaces, the registry and the CLI](/docs/registry-and-cli)). A service that does not run on Aventara decides with a generated client ([The generated client](/docs/generated-client)).

## How a request is decided

1. The host hands Access the request's headers. Access reads the principal from a bearer token or the session cookie.
2. The framework asks the engine: may this principal run this action on this Resource, on which rows, and with which fields.
3. The engine answers from the policies file. Nothing is allowed until a grant allows it, and any matching deny wins.

A refused request is answered `403 A4002` by the framework. Every decision can go to the [audit log](/docs/audit-log).

## Status and requirements

Access `1.0.0-rc.2` is a release candidate of 1.0. Its public API can still change before the stable release.

| | Version |
|---|---|
| `@aventara/access` | `1.0.0-rc.2` |
| Aventara framework (`@aventara/core` and the packages that host it) | `1.0.0-rc.12` (tested). `1.0.0-rc.10` or later works. |
| Better Auth | `~1.7.12` (1.7.12 or a later 1.7 patch; tested on 1.7.14) |
| Node.js | `^22.23.4 \|\| >=24.22.1` |

Access has no dependency on the framework. Its engine and its instance fit the framework's types by shape. [Installation](/docs/installation) has the full list.

## What changed in 1.0.0-rc.2

Released beside `@aventara/core` `1.0.0-rc.12`, and tested with it. It still works with `1.0.0-rc.10` or later.
`aventara new` 1.0.0-rc.12 scaffolds `User.id` as a `String` (`@default(cuid())`), the id Access needs.

- Security: numeric ids are refused. `createAccess` and `aventaraAccess()` refuse Better Auth's
  `advanced.database.generateId: "serial"` in every app (`ACCESS_OPTIONS_INVALID`), and `avaccess serve` and
  `avaccess keys` refuse it before they migrate or listen. An app on `1.0.0-rc.1` with numeric ids refuses to start
  after upgrading until it moves to String ids ([User ids](/docs/create-access#user-ids) lists the steps).
- Security: a kiosk PIN switch keys the user's failed-PIN count, the device's one try for a user with a clean record,
  the PIN and the audit entry on the user's id as stored, never as the request wrote it. Kiosk apps whose ids the
  database matches under other spellings should have their users set new PINs ([The kiosk profile](/docs/kiosk)).
- Security: `createAccess` copies the `betterAuth` block's plain data (its plain objects and arrays) when it is
  called and freezes the copy; every startup check and Better Auth run on it, and `access.options` is it. Plugin
  objects, functions and class instances (the adapter, a database client or pool) are kept as given and not frozen.
- Security (docs): the NestJS and Express mount that 1.0.0-rc.1 showed, `toNodeHandler(access)` alone, hands Better
  Auth no client address. In production its rate limit then counts every client in one bucket per route, and a client
  that sends its own `X-Forwarded-For` gets a fresh bucket each time. The mount now sets each request's address first
  (`src/client-address.ts`, [Hosts](/docs/hosts#nestjs)); an app mounted the old way should add it. Next.js keeps an
  `X-Forwarded-For` the client sent: self-hosted, run `next start` behind a proxy that overwrites it (or appends to it
  and is listed in `trustedProxies`), never reached by clients directly; on Vercel there is nothing to do
  ([Hosts](/docs/hosts#nextjs)). Run production with `NODE_ENV=production`, which Better Auth's rate limit needs.
- The examples: `createAccess` opens `resources: { users: true }`, which its rules on `User` need to start; the
  rules' `Campaign`, `Member` and `Note` Prisma models are shown ([Rules](/docs/rules)); the NestJS `src/main.ts` is
  the scaffold's with the mount added, its CORS block kept; the hub example on a `pg` Pool names
  `resources.authTables` ([The Better Auth plugin](/docs/better-auth-plugin#the-app-as-the-hub)); and the registry's
  tables include `accessBeacon`.

## Where to start

- New to Access: [Why Access](/docs/why-access), then [Getting started](/docs/getting-started).
- Adding it to an app: [Installation](/docs/installation), then [Rules](/docs/rules).
- Looking something up: the [Reference index](/docs/reference-index).
