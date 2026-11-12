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
| `@aventara/better-auth-kiosk` | `kiosk()`: shared tills with staff switching by PIN, as a Better Auth plugin of its own ([Kiosk mode](/docs/kiosk)). |
| `@aventara/better-auth-onboarding` | `onboarding()`: users held at the door until they finish what your app asks, as a Better Auth plugin of its own ([Onboarding](/docs/onboarding)). |
| The registry | Namespaces, keys and the org's guardrails, stored in Better Auth's database. |
| `avaccess` | The command line: `push`, `pull`, `verify`, `status`, `diff`, `keys`, `generate`, `schema`, `serve`, `skill`. |
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

Access `1.0.0-rc.3` is a release candidate of 1.0. Its public API can still change before the stable release.

| | Version |
|---|---|
| `@aventara/access` | `1.0.0-rc.3` |
| `@aventara/better-auth-kiosk`, `@aventara/better-auth-onboarding` | `1.0.0-rc.3`, beside it |
| Aventara framework (`@aventara/core` and the packages that host it) | `1.0.0-rc.12` (tested). `1.0.0-rc.10` or later works. |
| Better Auth | `~1.7.12` (1.7.12 or a later 1.7 patch; tested on 1.7.17, audited through 1.7.20) |
| Node.js | `^22.23.4 \|\| >=24.22.1` |

Access has no dependency on the framework. Its engine and its instance fit the framework's types by shape. [Installation](/docs/installation) has the full list.

## What changed in 1.0.0-rc.3

Released beside the first releases of two Better Auth plugins, `@aventara/better-auth-kiosk` and
`@aventara/better-auth-onboarding` (both `1.0.0-rc.3`), and beside `@aventara/core` `1.0.0-rc.12`, with which it is
tested. It still works with `@aventara/core` `1.0.0-rc.10` or later. [Upgrading](/docs/upgrading) has the steps from
1.0.0-rc.2; the package's `CHANGELOG.md` lists everything.

- Breaking: kiosk mode moved out of Access into its own Better Auth plugin, `kiosk()` from
  `@aventara/better-auth-kiosk`, with no shim. `profile: { kind: "kiosk" }` is refused with a sentence that names the
  plugin. The plugin also fixes rc.2 kiosk-mode defects: a hang on a database with one connection, sessions other
  plugins opened on a till escaping the device binding, `@better-auth/electron` beside it, and impersonated sessions
  setting PINs and enrolling tills ([Kiosk mode](/docs/kiosk), [Upgrading](/docs/upgrading)).
- New: the onboarding plugin, `onboarding()` from `@aventara/better-auth-onboarding`. Beside Access, a token or session
  whose user has not finished onboarding proves nobody ([Onboarding](/docs/onboarding)).
- Security: `createAccess` and `aventaraAccess()` refuse Better Auth's origin and CSRF opt-outs
  (`advanced.disableOriginCheck`, `advanced.disableCSRFCheck`, the same checks off in Better Auth's context), its test
  mode outside NODE_ENV=test, a `trustedOrigins` entry whose host is a wildcard alone, ids the database makes
  (`generateId: false`), and, under `mcp` or `audience`, the OAuth provider's `allowInsecureRedirectUri`. They warn of
  other trusted-origin wildcards outside production ([Hosts](/docs/hosts#trusted-origins-and-wildcards),
  [Instead of turning the CSRF check off](/docs/hosts#instead-of-turning-the-csrf-check-off)).
- Security: a user Better Auth's admin plugin holds banned is nobody to Access, whatever made their session, an API
  key's included: `me` is `null` and `GET /token` answers `403 BANNED_USER` ([createAccess](/docs/create-access)).
- Fixed: each rule matches what Prisma's `findMany({ where })` returns for it. NULL matches no comparison, `not`
  included, and a to-one relation with no row behind it matches no condition on it. A rule with `null` inside `in` or
  `notIn`, and an empty condition below a rule's root, are refused when the rules compile and in a pushed file
  ([Rules](/docs/rules)). Run `avaccess generate` again in a service with a generated client.
- `avaccess verify` refuses, and `avaccess status` reports, a generated client that is not what the installed Access
  would write for the pinned files. `avaccess generate` records each client in `avAccess.lock.json` (`clients`), and
  `generate --prune` drops the entries whose files are gone ([The generated client](/docs/generated-client)).
- New command `avaccess skill [<name>...]`: it writes the agent skill into your project, and the optional skills you
  name (`kiosk`, `onboarding`, `registry`, `mcp`, `server`, `service-client`) ([Installation](/docs/installation#ai-agents)).
- `createAccess` builds nothing: start it with `await access.api.ok()` before your server listens, so a refusal of
  Better Auth's options stops the start. `serve()` and `avaccess serve` start Better Auth before they listen.
- The registry refuses Better Auth's memory adapter, and `rotateKey` refuses a rotation another one overtook. Set
  `transaction: true` on Prisma's or Drizzle's adapter for a server that runs the registry
  ([Namespaces, the registry and the CLI](/docs/registry-and-cli)).
- `policies.claimsOf` runs once on each request read by a session cookie, not twice. The docs cover Access on SQLite,
  ending a user's sessions when their role changes, and the rules with a development identity of your own.

## Where to start

- New to Access: [Why Access](/docs/why-access), then [Getting started](/docs/getting-started).
- Adding it to an app: [Installation](/docs/installation), then [Rules](/docs/rules).
- Looking something up: the [Reference index](/docs/reference-index).
