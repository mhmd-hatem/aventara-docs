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

Access `1.0.0-rc.4` is a release candidate of 1.0. Its public API can still change before the stable release.

| | Version |
|---|---|
| `@aventara/access` | `1.0.0-rc.4` |
| `@aventara/better-auth-kiosk`, `@aventara/better-auth-onboarding` | `1.0.0-rc.4`, beside it |
| Aventara framework (`@aventara/core` and the packages that host it) | `1.0.0-rc.13` (tested). `1.0.0-rc.10` or later works. |
| Better Auth | `~1.7.12` (1.7.12 or a later 1.7 patch; tested on 1.7.17, audited through 1.7.20) |
| Node.js | `^22.23.4 \|\| >=24.22.1` |

Access has no dependency on the framework. Its engine and its instance fit the framework's types by shape. [Installation](/docs/installation) has the full list.

## What changed in 1.0.0-rc.4

Released beside `@aventara/better-auth-kiosk` and `@aventara/better-auth-onboarding` `1.0.0-rc.4`, and tested with
`@aventara/core` `1.0.0-rc.13` and `better-auth` 1.7.17. It still works with `@aventara/core` `1.0.0-rc.10` or later
and `better-auth` `~1.7.12`. [Upgrading](/docs/upgrading) has the steps from 1.0.0-rc.3; the package's `CHANGELOG.md`
lists everything.

- New: a kiosk till that is a native app (a Capacitor or Cordova WebView, an Electron main process, a native HTTP
  client) carries its PIN session in `Authorization: Bearer` and its device credential in a `kiosk-device` header
  ([A till that is a native app](/docs/kiosk#a-till-that-is-a-native-app-headers)).
- With `bearer({ requireSignature: true })` among Better Auth's plugins, on the `web` profile and without `audience`, a
  signed session token in `Authorization: Bearer` makes the request its user's in the framework. Such a principal is
  refused every question under origin `agent`.
- A rule or a guardrail the engine cannot run is refused with an `AccessError` whose `code` is
  `ACCESS_POLICIES_INVALID`, where it is compiled or loaded. It was a plain `Error` with no code.
- `Access<BetterAuthOptions, typeof claims, Governed, Principal>` takes any `createAccess` instance: the fix for
  `TS2883` under pnpm with `declaration: true`.
- `access.client.verbs.me.call` no longer counts as a till's use of its session; a kiosk write SQLite refuses answers
  `409 KIOSK_DEVICE_BUSY`; `avaccess verify --client` with a file it cannot check exits `2`.
- Fixed: with the kiosk and the onboarding plugins together, a till's framework requests other than reads answered
  `500` from about 15 seconds after each PIN switch.

## Where to start

- New to Access: [Why Access](/docs/why-access), then [Getting started](/docs/getting-started).
- Adding it to an app: [Installation](/docs/installation), then [Rules](/docs/rules).
- Looking something up: the [Reference index](/docs/reference-index).
