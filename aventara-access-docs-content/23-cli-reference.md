---
title: "CLI reference"
description: "Every avaccess command, flag, environment variable and exit code."
order: 23
section: reference
---

# CLI reference

`avaccess` ships with `@aventara/access`. Run it with `npx --no-install avaccess <command>`, so npx runs the copy your project installed and never fetches a package of that name from the registry.

```text
avaccess <command> [arguments] [flags]
avaccess --help | -h        the help
avaccess --version | -v     the package version
avaccess <command> --help   one command's usage
```

## Commands

| Command | Does | Read |
|---|---|---|
| `push <rules> [--beacon <module>]` | Pushes the namespace's policies file: a `.json` file, or the module that holds the rules (default export, or `rules`), TypeScript included | [Registry](/docs/registry-and-cli#a-services-commands) |
| `pull [--namespace <ns>] [--out <dir>] [--foreign <ns>:<Resource>,…] [--beacon <module>] [--env <env>]` | Writes the namespace's file to `access/<ns>.policies.json` and the org's guardrails to `access/guardrails.json`, and pins their hashes in `avAccess.lock.json` | [Registry](/docs/registry-and-cli#a-services-commands) |
| `verify [--env <env>] [--client <file>]` | Holds the pulled files to the lock, each `avAccess.beacons.<env>.json` to the rules, and each generated client to the installed Access version and the pinned files, offline | [The lock](/docs/registry-and-cli#the-lock), [Generated client](/docs/generated-client) |
| `status [--client <file>]` | Says whether the lock is behind the registry's current revisions, or a generated client is from another Access version; exits `1` when either is | [Registry](/docs/registry-and-cli#a-services-commands) |
| `diff [<from> [<to>]] [--namespace <ns>]` | Names the rules that changed between two revisions: `lock`, `head`, a hash, or its first seven or more hex digits. Default `lock` to `head`. | [Registry](/docs/registry-and-cli#a-services-commands) |
| `generate [--orm <orm>] [--out <file>] [--tsconfig <file>] [--prune]` | Writes the generated client from the pulled files, and records it in `avAccess.lock.json` (`clients`). `--prune` drops the recorded clients whose files are gone. | [Generated client](/docs/generated-client) |
| `schema --orm <orm> [--schema <path>] [--out <file>]` | Reads an ORM's schema into a module that exports `model`, to author rules against | [Generated client](/docs/generated-client) |
| `serve [--config <file>] [--port <port>] [--hostname <host>] [--max-body-bytes <bytes>] [--migrate]` | Runs the standalone Access server | [The standalone server](/docs/standalone-server) |
| `skill [<name>...] [--force]` | Writes or refreshes the agent skill of the installed `@aventara/access` in `.claude/skills/aventara-access/` and the Access section of `AGENTS.md`, writes each optional skill named (`kiosk`, `onboarding`, `registry`, `mcp`, `server`, `service-client`; a plugin's from the plugin package the project installed), and refreshes the optional ones already written | [Installation](/docs/installation#ai-agents) |
| `keys issue <ns>`, `keys rotate <ns> <push\|pull>`, `keys revoke <ns> <push\|pull>`, each with `--server <module>` | The operator's keys. Run in the server's own process, never over HTTP. | [Keys](/docs/registry-and-cli#keys) |

## Flags

| Flag | Commands | Default |
|---|---|---|
| `--registry <url>` | `push`, `pull`, `status`, `diff` | `AVACCESS_REGISTRY_URL` |
| `--namespace <ns>` | `pull`, `diff` | The lock's namespace, else the key's (`pull`); the lock's (`diff`) |
| `--out <dir>` | `pull` | Where the lock has the files, else `access/` |
| `--foreign <ns>:<Resource>,…` | `pull` | none. May be given more than once. |
| `--beacon <module>` | `push`, `pull` | none. The module must export `beacon` ([Beacons](/docs/beacons-and-foreign)). |
| `--env <env>` | `pull`, `verify` | `AVACCESS_ENV` |
| `--client <file>` | `verify`, `status` | none. One more generated client to check, beside the ones the lock records. |
| `--prune` | `generate` | off. Drops the lock's `clients` entries whose files are gone. |
| `--orm <orm>` | `generate`, `schema` | `generate`: `none`. `schema`: required. Values: `none` (generate only), `prisma7`. |
| `--out <file>` | `generate`, `schema` | `generate`: `src/generated/avAccess.ts`. `schema`: `src/generated/avAccess.schema.ts`. |
| `--tsconfig <file>` | `generate` | The nearest `tsconfig.json` above the output |
| `--schema <path>` | `schema` | `prisma/schema.prisma` (a folder of `.prisma` files reads as one) |
| `--config <file>` | `serve` | `access.config.ts` (or `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`) in the working directory |
| `--port <port>` | `serve` | `PORT`, else `3000` |
| `--hostname <host>` | `serve` | `127.0.0.1` |
| `--max-body-bytes <bytes>` | `serve` | `1048576` (1 MiB) |
| `--migrate` | `serve` | off |
| `--server <module>` | `keys` | required |
| `--force` | `skill` | off. Also replaces skill files you changed, and removes the ones you changed that a new release dropped. `AGENTS.md` outside the Access section is never touched. |

## Environment variables

| Variable | Used by | Does |
|---|---|---|
| `AVACCESS_REGISTRY_URL` | `push`, `pull`, `status`, `diff` | The Access server's URL. With no path, `/api/auth` is added. `https:` only; `http:` is taken on a loopback address. |
| `AVACCESS_KEY` | `push`, `pull`, `status`, `diff` | The namespace's push or pull key. Never a flag. |
| `AVACCESS_ENV` | `pull`, `verify` | The environment name for beacon pins |
| `AVACCESS_MIGRATE` | `serve` | `true` or `1` runs Better Auth's migration on start. `false`, `0` or unset does not. Any other value is refused. |
| `PORT` | `serve` | The port, when `--port` is not given |

`avaccess keys` reads no `.env`. Give it the environment the server runs with: `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Done |
| `1` | The check failed or the registry refused |
| `2` | The command could not run (bad flag, missing file, no registry address, a skill name that is no skill or a plugin the project has not installed) |

A failure prints `avaccess <command>: <code>: <message>` on stderr, where `<code>` is the Access error code when there is one ([Error codes](/docs/error-codes)). Running `avaccess` with no command prints the help and exits `2`.

## Files the commands read and write

| File | Written by | Read by |
|---|---|---|
| `avAccess.lock.json` | `pull`, `generate` (its `clients`) | `verify`, `status`, `diff`, `generate`, your app at startup |
| `access/<ns>.policies.json` | `pull` | `verify`, `generate`, your app |
| `access/guardrails.json` | `pull` | `verify`, `generate`, your app |
| `access/foreign.json` | `pull --foreign` | `verify`, `schema` |
| `avAccess.beacons.<env>.json` | `pull --env` | `verify`, your app at startup |
| `src/generated/avAccess.schema.ts` | `schema` | your rules |
| `src/generated/avAccess.ts`, `avAccess.internal.ts` | `generate` | your service, `verify`, `status` |
| `.claude/skills/aventara-access/`, `.claude/skills/aventara-access-<name>/`, `.claude/skills/aventara-kiosk/`, `.claude/skills/aventara-onboarding/` | `skill` | your agent |
| `AGENTS.md` (the text between `<!-- aventara-access:start -->` and `<!-- aventara-access:end -->`) | `skill` | your agent |

`pull`, `generate` and `skill` write only inside the project. A path through a symbolic link that leads out of it is refused. Formats are on [File formats, hashes and the engine](/docs/reference).
