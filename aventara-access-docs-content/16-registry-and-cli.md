---
title: Namespaces, the registry and the CLI
description: "Several services, one Access server: namespaces, keys, ownership, push and pull, and the lock."
order: 16
section: multi-service
---

# Namespaces, the registry and the CLI

When several services share one Access server, each service owns a namespace and writes the rules for its own
Resources. The registry holds each namespace's policies file and the org's guardrails. Each service pushes its own file
and pulls it back with the guardrails. Builds never touch the network.

## Namespaces

`definePolicies(model, { namespace: "chat" })` names the namespace a file belongs to. A namespace name matches
`^[a-z][a-z0-9_-]{0,62}$`.

A Resource another namespace owns is marked `{ foreign: "<namespace>" }` in the schema. The rules can read it in
conditions, but cannot grant, deny or govern on it ([Beacons and `foreign`](/docs/beacons-and-foreign)).

## The server

Turn the registry on in the server's configuration. A server that only runs the registry needs no `policies`: its
engine then denies every question, and its tokens carry `sub` alone.

```ts
// access.config.ts
import { createAccess } from "@aventara/access/auth";
import { Pool } from "pg";

export const access = createAccess({
	betterAuth: {
		database: new Pool({ connectionString: process.env.DATABASE_URL }),
	},
	registry: { enabled: true },
});

export default access;
```

This server signs in no one: it has no `emailAndPassword`. Add the sign-in methods its users need before you open
sign-up. The same registry can run inside an app that builds Better Auth itself ([The app as the
hub](/docs/better-auth-plugin#the-app-as-the-hub)).

The registry's tables (`accessNamespace`, `accessKey`, `accessPolicyRevision`, `accessGuardrailRevision`, `accessHead`,
`accessPushLog`, `accessResourceOwner`, `accessBeacon`) are Better Auth plugin tables, created by Better Auth's migration or by
`npx auth@~1.7.12 generate --yes`. Their unique indexes are what keep one live key per namespace and kind
(`accessKey.slot`), one owner per Resource (`accessResourceOwner.resource`) and one head per namespace
(`accessHead.line`) when calls run at once. The migration creates them; tables made by hand must have them too, since
Better Auth's schema check compares tables and columns, not indexes. Better Auth's memory adapter enforces no index:
the registry refuses it when Better Auth starts (`ACCESS_OPTIONS_INVALID`), as it refuses no `database` at all, which
Better Auth runs on it. `access.handler` serves the registry's routes under Better Auth's base path:

| Route | Does |
|---|---|
| `GET /access/v1/namespaces/:ns` | The namespace |
| `GET …/:ns/revisions` | Its revisions |
| `POST …/:ns/revisions` | Push a policies file |
| `GET …/:ns/revisions/:hash` | One revision |
| `GET …/:ns/head` | The current revision |
| `GET …/:ns/guardrails` | The org's guardrails |
| `GET …/:ns/foreign/:owner` | What `:ns` reads of `:owner` as foreign: `:owner`'s beacon hash, and its entry of each Resource `?resources=A,B` names ([Beacons and `foreign`](/docs/beacons-and-foreign)) |
| `GET /access/v1/key` | The namespace and kind of the key sent |

A service sends its key in the `x-access-key` header. With the registry off, `/access/v1/*` answers `404`. One org per
server.

The push log (`accessPushLog`) records every push made with a key the registry has, accepted or refused. Pushes with no
key, or a key that is not this registry's, are counted in one row per namespace per minute.

## Keys

Each namespace has a push key and a read-only pull key. The registry stores only their SHA-256 hashes. The operator
issues them from the server's own module, in its own process, never over HTTP:

```sh
avaccess keys issue campaign --server access.config.ts
avaccess keys rotate campaign push --server access.config.ts
avaccess keys revoke campaign pull --server access.config.ts
```

- `issue` creates the namespace and prints both keys once. `rotate` prints the new key once. No other command prints a
  key.
- `--server` names the module that holds the `createAccess` instance (its default export, or `access`), or, for the
  hub, `accessOf(auth)`.
- `avaccess keys` reads no `.env`. Give it the environment the server runs with: `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  and `BETTER_AUTH_URL`.
- The same calls are on `access.registry`: `createNamespace(name)`, `rotateKey(namespace, kind)`,
  `revokeKey(namespace, kind)` and `pushGuardrails(file)`.
- A namespace has one live key of each kind. A rotation another rotation overtook is refused (`ACCESS_KEY_REFUSED`)
  and issues nothing, so it never revokes the key the other one handed back. The key a rotation hands back is live
  when it is handed back; a later rotation or revocation may replace it.

A push key pushes and reads its own namespace. A pull key only reads it. A wrong, revoked or rotated-out key, a pull key
that pushes, or another namespace's key is refused with `ACCESS_KEY_REFUSED`. Another namespace's key gets the same
answer as a namespace the registry does not have (`401`), so a key tells its holder nothing about other namespaces.

## Who owns a Resource

A namespace owns the Resources its file names as its own. Only the owner grants, denies or governs fields on them. The
registry keeps one owner per Resource (the owners table's unique Resource name), and claims ownership in the push's own
transaction, so two pushes at the same moment cannot both claim one, and a refused push leaves nothing behind.

That transaction is a database transaction only when Better Auth's adapter runs one. Its built-in database adapters
(a `pg` `Pool`, SQLite, MySQL) do. Prisma's and Drizzle's run the registry's writes one by one unless you set
`transaction: true`: `prismaAdapter(prisma, { provider: "postgresql", transaction: true })`. Without it a push refused
partway, for a Resource another push claimed a moment before, keeps what it wrote until then: the Resources it had
claimed (which no other namespace can then claim, though no head of its names them) and its beacon. Turn it on for an
Access server that runs the registry.

`registry.ownership` says how a Resource gets its owner:

- `"first-push"` (the default): the first push that names it as its own, unless the operator assigned it first. The
  Resource is free again once the namespace's head no longer names it.
- `"assigned"`: the operator alone. A push that names an unassigned Resource as its own is refused.

```ts
// scripts/owners.assign.ts
import access from "../access.config.js";

await access.registry.assignResource("Invoice", "billing");
await access.registry.releaseResource("Draft");
```

A refusal names the Resource and the rule, never the namespace that owns it.

## A service's commands

The registry is `--registry <url>` or `AVACCESS_REGISTRY_URL`, the Access server's URL. With no path, Better Auth's
`/api/auth` is added. The key is `AVACCESS_KEY`, never a flag. The URL is `https:`; `http:` is taken only on a loopback
address, since the key travels in a header. The CLI follows no redirect.

| Command | Does |
|---|---|
| `avaccess push <rules> [--beacon <module>]` | Pushes the namespace's policies file: a `.json` file, or the module that holds the rules (default export, or `rules`), TypeScript included. `--beacon` sends the beacons too ([Beacons and `foreign`](/docs/beacons-and-foreign)). |
| `avaccess pull [--namespace <ns>] [--out <dir>] [--foreign <ns>:<Resource>,…] [--beacon <module>] [--env <env>]` | Writes the namespace's current file to `access/<ns>.policies.json`, and the org's guardrails to `access/guardrails.json`, and pins their hashes in `avAccess.lock.json` |
| `avaccess verify [--env <env>] [--client <file>]` | Holds the pulled files to the lock, offline. A file edited by hand fails with `ACCESS_LOCK_MISMATCH`. It holds every `avAccess.beacons.<env>.json` in the project to the rules too, and with `--env` (or `AVACCESS_ENV`) fails when that environment's file is missing. With generated clients (each one `avAccess.lock.json` records in `clients`, which `avaccess generate` writes in normal form; `--client` names one more beside them; and `src/generated/avAccess.ts` when it is there), it fails when a client is not what the installed `@aventara/access` would write for the pinned files: another version, rules pulled since it was generated (its banner's pins are not the lock's), a hand edit of either file (each banner holds its file's hash), or another build; and when a recorded client is gone. It names the `npx --no-install avaccess generate …` that writes it again. CRLF line ends read as LF. The check is the CLI's alone: run `verify` in CI. |
| `avaccess status [--client <file>]` | Says whether the lock is behind the registry's current revisions, or the generated client is from another Access version, and exits `1` when either is. Run it in CI. |
| `avaccess diff [<from> [<to>]] [--namespace <ns>]` | Names the rules that changed between two revisions: `lock`, `head`, a hash, or its first seven or more hex digits. The default, `lock` to `head`, is what a pull would bring. The namespace is `--namespace`, else the lock's. |
| `avaccess generate`, `avaccess schema` | The generated client ([The generated client](/docs/generated-client)) |
| `avaccess serve` | The standalone server ([The standalone server](/docs/standalone-server)) |
| `avaccess skill [<name>...] [--force]` | Writes the installed package's agent skill to `.claude/skills/aventara-access/` and its section of `AGENTS.md`, each optional skill named (`kiosk` and `onboarding` from their installed plugins, `registry`, `mcp`, `server` and `service-client` from Access), and refreshes the optional ones already written; [Installation](/docs/installation#ai-agents) says what it keeps and what it refuses |

Exit codes: `0` done, `1` the check failed or the registry refused, `2` the command could not run.

- `push` takes the namespace from the file. The registry stores each file once, in its canonical form, under its hash,
  and never updates it. Pushing a file the registry already has moves the head back to it.
- At push, a namespace may name as its own only Resources no other namespace owns (`ACCESS_OWNERSHIP`). A file the
  engine would refuse is refused too (`ACCESS_POLICIES_INVALID`), and so is a file over 1 MiB (`413`).
- `pull` takes the namespace from `--namespace`, else the lock, else the key. It hashes each file again before it writes
  it. When the lock pins the org's guardrails and the registry serves none, the pull is refused and writes nothing.
  Commit the pulled files and the lock.
- A pull trusts the registry it reaches: a file is held to its hash, not to who wrote it. Reach the registry over
  `https:` only.
- `pull` and `generate` write only inside the project. A path through a symbolic link that leads out of it is refused.

`avaccess verify` checks the lock, the pulled files, the beacon pins and the generated clients, in that order, and
stops at the first part that fails (of the clients, it names every stale one). It fails on:

- The command cannot run (exit `2`): an argument it does not take (it takes no positional); no
  `avAccess.lock.json`, one that is not JSON, or one that is not an `aventara-access/lock@1` lock (another `format`, a
  member a lock does not have, a namespace that is not a namespace name, a pin that is not `{ path, hash }` with a
  relative path inside the project and a `sha256:` hash); a pinned file that is there but cannot be read; an `--env`
  (or `AVACCESS_ENV`) that is not an environment name; a `--client` that is not a `.ts` file inside the project.
- The pulled files (`ACCESS_LOCK_MISMATCH`, exit `1`): the policies file, the guardrails file or the foreign facts
  file (`access/foreign.json`) the lock pins is missing, is no longer JSON, is no longer a file the engine runs from,
  or hashes to another hash than its pin; the policies file names no namespace, or another one than the lock pins; the
  foreign facts are another namespace's.
- The beacon pins (`ACCESS_LOCK_MISMATCH`, exit `1`): `--env` (or `AVACCESS_ENV`) names an environment with no
  `avAccess.beacons.<env>.json`; or any `avAccess.beacons.<env>.json` at the project's root, selected or not, is not
  JSON, is not `aventara-access/beacons@1`, holds a member besides `format`, `namespace`, `environment` and `beacons`,
  is another namespace's or another environment's than its file name says, has a `beacons` that is not a map of other
  namespaces' names to `sha256:` hashes, or holds no beacon of a namespace whose Resources the rules read as foreign.
- The generated clients (exit `1`): each one the lock records in `clients`, the one `--client` names, and
  `src/generated/avAccess.ts` when it is there. A recorded or named client whose `.ts` or `.internal.ts` file is gone
  (the message names `avaccess generate --out <file>`, or `avaccess generate --prune` to drop a recorded one from the
  lock); a client written by another `@aventara/access`
  version (either file's banner); one generated from other pulled files than the lock pins (rules pulled since); either
  file changed after `generate` wrote it (its text no longer hashes to its banner's stamp); one that is not what the
  installed version writes for the pinned files (another build of the same version, or an `--orm` it does not know).
  Each message names the `npx --no-install avaccess generate …` that writes the client again. CRLF line ends read as
  LF, so a checkout that converts them passes.

## The lock

`avAccess.lock.json` pins content, not a registry:

```json
{
  "format": "aventara-access/lock@1",
  "namespace": "campaign",
  "policies": { "path": "access/campaign.policies.json", "hash": "sha256:…" },
  "guardrails": { "path": "access/guardrails.json", "hash": "sha256:…" }
}
```

`guardrails` is `null` when the registry has none. Put `avaccess verify` first in `aventara:prepare`, so the build
stops before anything is generated from a changed file:

```json
{
  "scripts": {
    "aventara:prepare": "avaccess verify && aventara-prisma7-generate … && aventara-build"
  }
}
```

In a Next.js app, put it before `aventara-build` the same way.

## The lock at startup

Read the lock and the pulled files as JSON and hand them to the instance:

```ts
// src/access.pulled.ts
import { readFileSync } from "node:fs";
import type { AccessGuardrailsJson, AccessLock } from "@aventara/access";

/** A file `avaccess pull` wrote, from the project's root. */
const pulled = (path: string): unknown =>
	JSON.parse(readFileSync(path, "utf8"));

/** avAccess.lock.json: the namespace, and the hash of each pulled file. */
export const lock = pulled("avAccess.lock.json") as AccessLock;

/** The org's guardrails, as the registry serves them to this namespace. */
export const guardrails = pulled(
	"access/guardrails.json",
) as AccessGuardrailsJson;
```

Then `policies: { rules: policies, claims, guardrails, lock }`.

- The instance refuses to start (`ACCESS_LOCK_MISMATCH`) unless the guardrails hash to the lock's pin and are given
  exactly when it pins some, and the rules' namespace is the lock's.
- A policies file you hand over (not the typed rules, which are your own source) must hash to its own pin.
- The engine options take the same `lock`: `createAccessEngine(file, { guardrails, lock })`.

The lock is optional, so a project without a registry runs without one. In production, set
`policies: { …, lock, requireLock: true }`. The instance then refuses to start without a lock, so a deploy that lost
`avAccess.lock.json` stops instead of running files nothing pins. With `requireLock`, typed rules are held to the lock's
policies hash too.
