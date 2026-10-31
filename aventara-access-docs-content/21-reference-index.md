---
title: "Reference index"
description: "Where to look things up: entry points, options, rules API, engine, CLI, files, codes, defaults and environment variables."
order: 21
section: reference
---

# Reference index

Find a name, then follow the link to the page that defines it.

## Entry points

| Import | Names | Page |
|---|---|---|
| `@aventara/access` | `definePolicies`, `createAccessEngine`, `defineGuardrails`, `policiesHash`, `guardrailsHash`, `AccessError` | [Rules](/docs/rules), [Reference](/docs/reference), [Guardrails](/docs/guardrails) |
| `@aventara/access/auth` | `createAccess`, `agentOf` | [createAccess](/docs/create-access), [Agents over MCP](/docs/agents-mcp) |
| `@aventara/access/better-auth` | `aventaraAccess`, `accessOf`, `aventaraAccessClient`, `agentOf` | [The Better Auth plugin](/docs/better-auth-plugin) |
| `@aventara/access/standalone` | `serve` | [Hosts](/docs/hosts#standalone) |
| `avaccess` | `push`, `pull`, `verify`, `status`, `diff`, `keys`, `generate`, `schema`, `serve` | [CLI reference](/docs/cli-reference) |

## The rules builder

| Call | Page |
|---|---|
| `definePolicies(model, { namespace })` | [Rules](/docs/rules), [Namespaces](/docs/registry-and-cli#namespaces) |
| `.principal<P>()`, `.roles()`, `.govern()`, `.grants()`, `.denies()` | [Rules](/docs/rules#the-building-blocks) |
| `grant(subjects, actions, resources, { name, where, in, fields, after, write })` | [Rules](/docs/rules), [Updates](/docs/updates) |
| `deny(actions, resources, { name, where, if: { claims, origin } })` | [Rules](/docs/rules) |
| `.contract()`, `.engine(options)` | [Rules](/docs/rules), [Reference](/docs/reference#the-engine) |
| `defineGuardrails({ claims }).denies()` | [Guardrails](/docs/guardrails) |

## The engine

| Member | Page |
|---|---|
| `can`, `scopeOf`, `fieldsOf` | [Rules](/docs/rules#asking-the-engine) |
| `grantsOf`, and `beforeGrants` on `can` | [Updates](/docs/updates) |
| `explain` | [Rules](/docs/rules#asking-the-engine) |
| `checkBeacons` | [Beacons and `foreign`](/docs/beacons-and-foreign#at-startup) |
| `governed`, `afterChecks`, `paths` | [Reference](/docs/reference#the-engine) |
| Engine options `guardrails`, `lock`, `requireLock` | [The lock at startup](/docs/registry-and-cli#the-lock-at-startup) |

## createAccess options

| Option | Page |
|---|---|
| `betterAuth`, `policies` (`rules`, `claims`, `claimsOf`, `guardrails`, `lock`, `requireLock`, `tokenTtl`), `principal` | [createAccess](/docs/create-access#the-levers) |
| `profile` (`web`, `service`, `kiosk`) | [createAccess](/docs/create-access#profiles), [The kiosk profile](/docs/kiosk) |
| `registry` (`enabled`, `ownership`) | [Namespaces, the registry and the CLI](/docs/registry-and-cli) |
| `audit` | [The audit log](/docs/audit-log) |
| `resources` (`users`, `members`, `authTables`) | [Better Auth tables as Resources](/docs/auth-tables) |
| `passwords` (`argon2id`, `legacyScrypt`) | [Passwords](/docs/passwords) |
| `mcp` (`resource`, `openRegistration`), `audience` | [Agents over MCP](/docs/agents-mcp) |

`aventaraAccess()` takes the same blocks, plus `organization` ([The organization bridge](/docs/better-auth-plugin#the-organization-bridge)).

## The instance

| Member | Page |
|---|---|
| `handler`, `api`, `options`, `$Infer`, `policy`, `state`, `registry`, `client`, `kiosk`, `mcp`, `beacon` | [createAccess](/docs/create-access#what-the-instance-holds) |
| `client.verbs`: `signIn`, `signUp`, `signOut`, `resetPassword`, `me` | [The $access verbs](/docs/access-verbs) |
| `kiosk.listDevices()`, `kiosk.revokeDevice()` | [The kiosk profile](/docs/kiosk#your-servers-own-calls) |
| `registry.createNamespace`, `rotateKey`, `revokeKey`, `assignResource`, `releaseResource`, `pushGuardrails` | [Registry](/docs/registry-and-cli) |
| `authClient.access.can` | [The client plugin](/docs/better-auth-plugin#the-client-plugin) |

## Routes

| Route | Page |
|---|---|
| Better Auth's routes under `/api/auth`, plus `GET /me`, `GET /token`, `GET /jwks` | [Hosts](/docs/hosts), [createAccess](/docs/create-access#tokens-and-sessions) |
| `/access/v1/...` (the registry) | [Registry](/docs/registry-and-cli#the-server) |
| `/kiosk/...` | [The kiosk profile](/docs/kiosk#the-verbs-and-routes) |
| `POST {api}/_access/can` (the framework's) | [The $access verbs](/docs/access-verbs) |
| `GET /health` (standalone server) | [Hosts](/docs/hosts#standalone) |

## Files and formats

| File | Page |
|---|---|
| `aventara-access/policies@1`, `guardrails@1`, `lock@1`, `foreign@1`, `beacons@1` | [File formats](/docs/reference#file-formats) |
| `avAccess.lock.json` | [The lock](/docs/registry-and-cli#the-lock) |
| `avAccess.beacons.<env>.json` | [Beacons and `foreign`](/docs/beacons-and-foreign) |
| `src/generated/avAccess.ts` | [The generated client](/docs/generated-client) |

## Lookups

| I want | Page |
|---|---|
| A CLI flag or environment variable | [CLI reference](/docs/cli-reference) |
| An error code | [Error codes](/docs/error-codes) |
| A default, bound or timing | [Limits and defaults](/docs/limits-and-defaults) |
| A word I do not know | [Glossary](/docs/glossary) |
| A message I see | [Troubleshooting](/docs/troubleshooting) |
| What the framework does with the answers | [Policies](https://aventara.razor34.dev/framework/docs/policies) in the framework docs |
