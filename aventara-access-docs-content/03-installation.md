---
title: "Installation"
description: "Requirements, the exact install commands and which optional packages go with which feature."
order: 3
section: get-started
---

# Installation

Access goes into an Aventara app. Create one with the Aventara CLI, then add Access and Better Auth in the range Access runs on. Framework requirements (NestJS or Next.js, Prisma, database) are on the framework's [Installation](https://aventara.razor34.dev/framework/docs/installation) page.

## Requirements

| | Supported |
|---|---|
| Node.js | `^22.23.4 \|\| >=24.22.1` |
| Aventara framework | `1.0.0-rc.12`: tested on it. `1.0.0-rc.10` or later works. |
| Better Auth | `~1.7.12`: 1.7.12 or any later 1.7 patch. Tested on 1.7.17, audited through 1.7.20. |
| Package type | ESM (`"type": "module"`) |

`createAccess` refuses another Better Auth version (an older one, 1.8, a prerelease) with `ACCESS_BETTER_AUTH_VERSION`.

## Create the app

```sh
npx @aventara/cli@rc new <app> --orm prisma7 --db postgresql
cd <app>
```

Then set `DATABASE_URL` in `.env`, as the CLI says. On a terminal `aventara new` asks for the package manager. Anywhere else, add `--package-manager npm` (or `pnpm`) or `--yes`. [Getting started](https://aventara.razor34.dev/framework/docs/getting-started) in the framework docs covers this step in full.

## Install Access

```sh
npm install --save-exact @aventara/access@rc better-auth@~1.7.12
# or, with pnpm:
pnpm add --save-exact @aventara/access@rc better-auth@~1.7.12
```

npm installs the newest 1.7 patch of Better Auth, and `--save-exact` records it. There is no other Better Auth package to pin by hand.

## Packages and when you need them

Everything but `@aventara/access` is an optional peer, so install only what the features you use ask for.

| Package | Range | You need it for |
|---|---|---|
| `@aventara/access` | `1.0.0-rc.3` (`@rc`) | Everything |
| `better-auth` | `~1.7.12` | `createAccess`, `aventaraAccess()` and everything built on them. The engine alone (`definePolicies`, `createAccessEngine`) works without it, and type-checks without it with `skipLibCheck: false`. |
| `@better-auth/oauth-provider` | `~1.7.12` | [Agents over MCP](/docs/agents-mcp), and one audience per service |
| `@better-auth/cimd` | `~1.7.12` | Agent clients that register by a metadata document URL |
| `@node-rs/argon2` | `2.2.2`, exact | Password and PIN hashing on Node.js 22 only. Node.js 24.7.0 and later has `crypto.argon2` and never loads it. |

Two Better Auth plugins ship beside Access, at the same version. Each is a Better Auth plugin of its own that any Better Auth app can use, with or without Access, and needs only `better-auth` `~1.7.12`:

| Package | Range | You need it for |
|---|---|---|
| `@aventara/better-auth-kiosk` | `1.0.0-rc.3` (`@rc`) | Shared tills with staff switching by PIN ([Kiosk mode](/docs/kiosk)) |
| `@aventara/better-auth-onboarding` | `1.0.0-rc.3` (`@rc`) | Holding users at the door until they finish what your app asks ([Onboarding](/docs/onboarding)). It also needs the `@better-auth/utils` Better Auth brings (`^0.5.0`). |

Install the agent packages in the same range as Better Auth:

```sh
npm install @better-auth/oauth-provider@~1.7.12 @better-auth/cimd@~1.7.12
```

Install the Node.js 22 hasher at the exact version Access is tested against:

```sh
npm install --save-exact @node-rs/argon2@2.2.2
```

Two more packages appear in the guides without being Access peers: `pg` when Better Auth runs on a `pg` `Pool`, and `@better-auth/expo` when the kiosk's tills are an Expo app ([Kiosk mode](/docs/kiosk)). Install a `@better-auth/*` package at the `better-auth` version the app has (`npm ls better-auth`), with `@better-auth/core` at that same version.

## Install safely

Commit your lockfile and install with it, so every machine and every deploy gets the versions you tested:

```sh
npm ci                          # npm
pnpm install --frozen-lockfile  # pnpm
```

npm 11 may print `npm warn install-scripts ... @prisma/engines, prisma ... not yet covered by allowScripts` after the install. It is expected, and the install still works.

Hold back brand-new versions with a release-age delay:

```ini
# .npmrc (npm 11.10 or later; days)
min-release-age=3
```

```yaml
# pnpm-workspace.yaml (pnpm; minutes)
minimumReleaseAge: 4320
```

The units differ: npm counts days, pnpm counts minutes. Both examples above mean three days.

A release-age delay also holds back a brand-new release, including a fresh `@rc`. Exclude the Aventara packages (`minimumReleaseAgeExclude` in pnpm, `min-release-age-exclude` in npm) or wait out the delay.

When an advisory names a fixed version, exclude that exact version so you get it at once (pnpm takes `name@x.y.z`; npm excludes by package name); remove the exclude after 3 days.

Access accepts Better Auth patch releases (`~1.7.12`), so a new patch can reach you the day it is published. A release-age delay gives the community time to catch a bad patch before it gets to you.

After installing, check the registry signatures of what you installed:

```sh
npm audit signatures
```

Aventara releases are published with two-factor authentication on the maintainer's npm account. They do not carry build provenance attestations or signed git tags yet.

## Entry points

| Import | What is in it |
|---|---|
| `@aventara/access` | `definePolicies`, `createAccessEngine`, `defineGuardrails`, `policiesHash`, `guardrailsHash`, `AccessError`, and the types |
| `@aventara/access/auth` | `createAccess`, `agentOf`, and the types of the instance, claims, profiles and audit events |
| `@aventara/access/better-auth` | `aventaraAccess`, `accessOf`, `aventaraAccessClient`, `agentOf` |
| `@aventara/access/standalone` | `serve` |

The package also installs the `avaccess` command. See the [CLI reference](/docs/cli-reference).

## Check it

```sh
npx avaccess --version
```

The first `createAccess` call loads Better Auth and checks its version. A missing or out-of-range install stops there with a sentence that names the fix ([Troubleshooting](/docs/troubleshooting#the-wrong-better-auth-version)).

## AI agents

The package ships an agent skill: a short `SKILL.md` and reference pages an agent loads when a task needs them (setup
and wiring, the rule language, recipes, signed-out callers and cached reads, error codes), and optional skills for the
areas not every app has. Write them into your project from the project's root, with the `avaccess` the project
installed (`--no-install`, so npx never fetches a package of that name from the registry):

```sh
npx --no-install avaccess skill
#   wrote .claude/skills/aventara-access/
#   optional: kiosk onboarding registry mcp server service-client
#   add with: npx --no-install avaccess skill <name>...

npx --no-install avaccess skill kiosk mcp
#   wrote .claude/skills/aventara-kiosk/   (from @aventara/better-auth-kiosk)
#   wrote .claude/skills/aventara-access-mcp/
```

The base skill always goes to `.claude/skills/aventara-access/`, and an Access section to `AGENTS.md` (created when
there is none) points other agents to it and tells them which optional skill to add for which task. The optional ones
are written only when named: `kiosk` and `onboarding` from the installed `@aventara/better-auth-kiosk` and
`@aventara/better-auth-onboarding`, and `registry`, `mcp`, `server` and `service-client` from Access
(`.claude/skills/aventara-access-<name>/`). A name that is no skill, or a plugin the project has not installed, is
refused, and nothing is written. Run it again after you upgrade Access or a plugin: it refreshes every skill already
written, removes the files a new release dropped, keeps a file you changed (with a warning) unless `--force`, and says
"up to date" when nothing changed. The [CLI reference](/docs/cli-reference) has the flags and the files it writes.

Next: [Getting started](/docs/getting-started).
