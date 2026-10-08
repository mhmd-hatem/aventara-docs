---
title: Installation
description: Requirements, which package goes where (server or frontend, dev or runtime), and notes on Node, npm and pnpm.
order: 3
section: get-started
---

# Installation

You rarely install Aventara packages by hand. `aventara new` (or `aventara init`) adds the server packages to a NestJS project, and `avclient init` adds the generator to your frontend. This page lists what that puts where, so you know what is in your `package.json` and why.

## Requirements

| | Supported |
|---|---|
| Node.js | `^22.18.0 \|\| >=24.2.0` (on Node 22, use npm 11 or newer) |
| NestJS | 12 |
| ORM | Prisma `>=7.10 <8` |
| Database | SQLite or PostgreSQL |
| Package manager | npm or pnpm (yarn is not supported) |
| TypeScript, server | 6 (`<7`) |
| TypeScript, frontend | `>=5.5.0`, TypeScript 7 included |
| Module format | ESM and CommonJS projects (a fresh NestJS 12 project is ESM) |

The bins refuse to run on an unsupported Node, in one sentence that names the range.

## Packages

| Package | Install it | Where | What it is |
|---|---|---|---|
| `@aventara/cli` | Do not. Run it with `npx` (or `pnpm dlx`), or install it globally | Your machine | The `aventara` command: `aventara new <name>` creates a NestJS 12 project with Aventara; `aventara init` adds Aventara to an existing one. It is not a dependency of your project. |
| `@aventara/core` | Added for you | Server, dependency | The framework: configuration, contract compilation, validation, execution, transactions. Its `@aventara/core/protocol` entry exposes the HTTP protocol as plain data and functions. Transport- and ORM-agnostic. |
| `@aventara/prisma7-adapter` | Added for you | Server, dependency | The Prisma 7 adapter for SQLite and PostgreSQL, plus the `aventara-prisma7-generate` bin that runs on install (`aventara:prepare`). |
| `@aventara/nest` | Added for you | Server, dependency | Hosts a framework in NestJS 12 on Express or Fastify: `AventaraModule`, `@InjectFramework()`. |
| `@aventara/client` | `avclient init` adds it | Frontend, dev dependency, exact version | The `avclient` generator. Not needed at runtime: the generated client imports nothing from it. |
| `@aventara/testing` | Optional | Server, dev dependency | Conformance fixtures and a fake in-memory adapter, for testing code that runs a framework without a database, or an adapter, a host or a client against the protocol ([Testing and conformance](/docs/testing-and-conformance)). |

The server's runtime dependencies are `@aventara/core`, `@aventara/nest` and `@aventara/prisma7-adapter`, all at the same exact version, together with Prisma (`@prisma/client`, a driver adapter, and `prisma` as a dev dependency). Your frontend ships only its own code and the generated client. `@aventara/core` itself depends on `zod`, which only its `@aventara/core/json` entry (typed JSON fields, [JSON fields](/docs/json-fields)) ever loads.

Each package ships its `CHANGELOG.md` beside its README, so the release notes for the version you installed are in `node_modules/@aventara/<package>/`.

### Server side

A project made by `aventara new` has this in `package.json` (versions are exact):

```json
{
  "dependencies": {
    "@aventara/core": "1.0.0-rc.0",
    "@aventara/nest": "1.0.0-rc.0",
    "@aventara/prisma7-adapter": "1.0.0-rc.0",
    "@prisma/adapter-better-sqlite3": "7.10.0",
    "@prisma/client": "7.10.0"
  },
  "devDependencies": { "prisma": "7.10.0" },
  "scripts": {
    "aventara:prepare": "aventara-prisma7-generate --schema prisma/schema.prisma --client src/generated/prisma --provider sqlite --driver @prisma/adapter-better-sqlite3 --out src/generated/aventara/discovery.artifact.ts",
    "postinstall": "npm run aventara:prepare",
    "prebuild": "npm run aventara:prepare",
    "prestart": "npm run aventara:prepare",
    "prestart:dev": "npm run aventara:prepare",
    "prestart:debug": "npm run aventara:prepare"
  }
}
```

With PostgreSQL the driver is `@prisma/adapter-pg`. The `postinstall` script regenerates `src/generated/aventara/discovery.artifact.ts` on a plain `npm install`, and the `prebuild`, `prestart`, `prestart:dev` and `prestart:debug` scripts regenerate it before `npm run build` and the start scripts, so a schema change needs no separate step. npm and pnpm run these `pre` hooks; Yarn Berry, and pnpm with `enable-pre-post-scripts=false`, do not, so run `aventara:prepare` yourself there (pnpm projects get `pnpm run aventara:prepare` in these scripts). Run `npm run aventara:prepare` yourself after changing `prisma/schema.prisma`, and after adding or upgrading a package by name (`npm install <package>` did not run `postinstall` with npm 11.19).

### Frontend side

```bash
npx @aventara/client@rc init
```

adds `@aventara/client` as an exact dev dependency, an `avclient:generate` script, `framework.client.ts`, an `.env` entry and `.env` in the frontend's `.gitignore`, then generates the client. The frontend needs a `tsconfig.json` (plain JavaScript projects are not supported yet). `typescript` is an optional peer: with it installed, the generated output is type-checked with your own copy after generation. Without it, the check is syntax and shape only, and a warning says so.

## Creating a project

```bash
npx @aventara/cli@rc new my-api        # npm
pnpm dlx @aventara/cli@rc new my-api   # pnpm
```

Use the `@rc` tag: it points to the newest release candidate (`1.0.0-rc.0`). The CLI runs a pinned `nest new`, adds Aventara, installs, and commits the result (`Initial Aventara Scaffold`, unless git is missing or unconfigured, the directory is already inside a repository, or you pass `--skip-git`). It picks the package manager from the lockfile, else the one that launched it, else npm, and never touches a database. `aventara --version` prints the CLI's version; `--orm` takes `prisma7`. See [Getting started](/docs/getting-started), or [Add to an existing project](/docs/existing-project).

## Package manager and Node notes

- npm and pnpm are both supported. Under pnpm, the CLI also writes `pnpm-workspace.yaml` with the build-script allowances Prisma and the SQLite driver need, and next steps print `pnpm exec prisma db push` and `pnpm dlx` forms. Yarn is not supported.
- Node 22 needs npm 11 or newer. The npm 10 bundled with older Node 22 cannot install Nest 12's own scaffold. Check with `npm -v` and upgrade with `npm install -g npm@11`.
- Node 24: `>=24.2.0` is supported. A CommonJS project's Jest e2e setup needs Node 24.9 or newer, a limit that comes from Nest and Jest.
- TypeScript: the server side needs TypeScript below 7 (the `aventara new` scaffold uses 6). The frontend generator works with `>=5.5.0`, TypeScript 7 included.
- Pin exact versions. Aventara is a release candidate and can still change to fix what testing finds, so the generated projects already pin exactly. Keep `@aventara/client` at the same version as the server.

## See also

- [Why Aventara](/docs/why-aventara)
- [Getting started](/docs/getting-started)
- [Frontend client](/docs/frontend-client)
- [CLI reference](/docs/cli-reference)
- Guides: [Deploying](/docs/deploying), [Upgrading](/docs/upgrading)
