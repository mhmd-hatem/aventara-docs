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
| Aventara framework | `1.0.0-rc.11`: tested on it. `1.0.0-rc.10` or later works. |
| Better Auth | `~1.7.12`: 1.7.12 or any later 1.7 patch. Tested on 1.7.14. |
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
| `@aventara/access` | `1.0.0-rc.2` (`@rc`) | Everything |
| `better-auth` | `~1.7.12` | `createAccess`, `aventaraAccess()` and everything built on them. The engine alone (`definePolicies`, `createAccessEngine`) works without it, and type-checks without it with `skipLibCheck: false`. |
| `@better-auth/oauth-provider` | `~1.7.12` | [Agents over MCP](/docs/agents-mcp), and one audience per service |
| `@better-auth/cimd` | `~1.7.12` | Agent clients that register by a metadata document URL |
| `@node-rs/argon2` | `2.2.2`, exact | Password and PIN hashing on Node.js 22 only. Node.js 24.7.0 and later has `crypto.argon2` and never loads it. |

Install the agent packages in the same range as Better Auth:

```sh
npm install @better-auth/oauth-provider@~1.7.12 @better-auth/cimd@~1.7.12
```

Install the Node.js 22 hasher at the exact version Access is tested against:

```sh
npm install --save-exact @node-rs/argon2@2.2.2
```

Two more packages appear in the guides without being Access peers: `pg` when Better Auth runs on a `pg` `Pool`, and `@better-auth/expo` when the kiosk's tills are an Expo app ([The kiosk profile](/docs/kiosk#a-till-that-is-an-expo-app)). Use Expo's package in the same 1.7 range as Better Auth.

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

From `1.0.0-rc.1`, the package ships an agent skill at `node_modules/@aventara/access/skill/`: a short `SKILL.md`
and reference pages an agent loads when a task needs them (setup, the rules, recipes, signed-out callers and cached
reads, error codes). Copy it into your agent's skills folder, or point your agent at
`node_modules/@aventara/access/skill/SKILL.md`:

```sh
mkdir -p .claude/skills
cp -R node_modules/@aventara/access/skill .claude/skills/aventara-access
```

Copy it again after you upgrade Access.

Next: [Getting started](/docs/getting-started).
