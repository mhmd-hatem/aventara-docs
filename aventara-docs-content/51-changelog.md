---
title: Changelog
description: User-facing changes in each Aventara release, newest first.
order: 90
section: about
---

# Changelog

Aventara is in pilot: the public API may change before 1.0, and below 1.0 a minor version can be a breaking change. Pin exact versions. All `@aventara/*` packages are released together at one version.

## 0.1.0-pilot.4

The current release, published under the `pilot` dist-tag (install with `@pilot`). Upgrading from pilot.3: see [Upgrading](/docs/upgrading#from-010-pilot3-to-010-pilot4).

**Server and CLI**

- **The discovery artifact regenerates when you build or start.** `aventara new` and `aventara init` add `prebuild`, `prestart`, `prestart:dev` and `prestart:debug` scripts that run `aventara:prepare`. After a change to `schema.prisma`, the next `npm run start:dev` (or `build`, `start`, `start:debug`) regenerates the Prisma client and the artifact before the server compiles; no reinstall needed. npm and pnpm run these hooks; Yarn Berry and pnpm with `enable-pre-post-scripts=false` do not, so run `aventara:prepare` yourself there. On an existing project, `aventara init` keeps a `prebuild` or `prestart*` script you already have unless you confirm or pass `--yes`.
- **A clear error for an old artifact.** An artifact written by an older adapter now fails the TypeScript build with `Property 'regenerate_with_aventara_prepare' is missing`, and the adapter refuses it at start-up with a message that names `aventara:prepare`. The fix is `npm run aventara:prepare`. See [Troubleshooting](/docs/troubleshooting#build-error-property-regenerate_with_aventara_prepare-is-missing).
- **The scaffold's rate-limiting note links to the docs**: [Rate limiting](/docs/limits-and-safety#rate-limiting), where it used to carry a placeholder.
- **Plainer messages.** The generate step's error messages say "the generated client's types" in words, not with Prisma's emoji labels.

**Packages**

- The comments an editor shows on hover, and the READMEs, now describe what each export does, how to use it, what it returns and what it throws. This applies to `@aventara/core`, `@aventara/nest`, `@aventara/prisma7-adapter`, `@aventara/client` and `@aventara/testing`, and to the declarations a generated client copies from `@aventara/core`.
- `@aventara/cli` ships no type declarations: it is a command, run with `npx` or installed globally, and has no API to import.

## 0.1.0-pilot.3

Published under the `pilot` dist-tag. Upgrading from pilot.1 or pilot.2: see [Upgrading](/docs/upgrading#from-010-pilot1-or-pilot2-to-010-pilot3).

**Server and CLI**

- **CORS in the scaffold.** `aventara new` and `aventara init` turn CORS on in `src/main.ts` for the origins listed in `CORS_ORIGINS` (default `http://localhost:5173,http://localhost:3001`), and write that variable into `.env`, an existing `.env` included. Unset or empty means CORS is off, never open to every origin. A `main.ts` that already configures CORS is left alone, with a warning; one with no `NestFactory.create` line is not edited, and the lines are printed. Before this, a browser frontend on another port got a CORS error. See [Deploying](/docs/deploying#cors-and-browsers).
- **Rate limiting.** The scaffold's `main.ts` ends with a commented-out platform-level limiter and a note: `@nestjs/throttler` is a Nest guard and does not run on Aventara's routes, `express-rate-limit` does. See [Rate limiting](/docs/limits-and-safety#rate-limiting).
- **A first commit.** `aventara new` ends with a git commit, `Initial Aventara Scaffold` (never `.env`), unless git is not installed or configured, the directory is already inside a repository, or you pass `--skip-git`.
- **`--orm` takes an adapter name**, `prisma7`; `--help` lists the values for `--orm`, `--db` and `--package-manager`. `prisma` and `prisma@7` are no longer accepted.

**Frontend**

- `avclient init` refuses a project with no `tsconfig.json` before it writes or installs anything (plain JavaScript is not supported yet).
- `avclient init` adds `.env` to the frontend's `.gitignore`.
- The generated client is type-checked with your project's own TypeScript, so the "typescript could not be resolved" warning appears only in a project without it, and Node's `stripTypeScriptTypes` warning is gone.

## 0.1.0-pilot.2

**Generated client**

- **The client fits your project.** It is still TypeScript source (`AvClient.ts` and `generated/`), but its imports are now spelled the way your `tsconfig.json` says: extensionless under `bundler` resolution (Next.js with Turbopack or webpack) or CommonJS, `.js` under `nodenext` (NestJS 12), `.ts` where your imports name `.ts` files (Vite's `react-ts`, Node's type stripping). You import it like your own files. Next.js 16 with Turbopack, which could not resolve the pilot.1 client, builds it. See [Client setup](/docs/client-setup#importing-the-client).
- **The config loads like `prisma.config`.** `avclient init` writes `framework.client.ts`; `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` are read, in ESM or CommonJS syntax. A pilot.1 `framework.client.mts` keeps working. Two config files are refused.
- The client type-checks under `"strict": false`, the `tsconfig` Next.js writes. A project without a `tsconfig.json` is refused.
- `avclient --version` and `-v`; `aventara -v`.

**Server**

- **Pipe output is validated.** What a pipe returns is checked against the server's own contract before it reaches the database. A refusal is the new internal code `A3004` (`500`) with the generic message `A server pipeline produced invalid arguments.`; the pipe, operation and field go to the server log and your diagnostics sink only. See [Pipelines](/docs/pipelines#what-a-pipe-may-and-may-not-do).
- **A create that lacks a required field** is `422` `A2004` with a `V1000` issue at the field's path, instead of `500` `A3001`. It covers `create.one`, every row of `create.many`, the create branch of an upsert, nested creates and transaction steps.
- **A `BigInt` outside signed 64-bit** is `A2004` / `V1004`, instead of `A3001`.
- **Orphaning a required child** (`$set: []` or `$disconnect` on a to-many whose children require the parent) is `409` `A2008`, instead of `A3001`.
- **Internal failures are logged.** `A3000` to `A3004` each write one line to Nest's log (code, operation, scope, request id, error class; never the error's message). See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log).
- **A stale discovery artifact stops the server at startup,** with a sentence that names `aventara:prepare`, when the Prisma client has a model or field the artifact lacks. The artifact's format changed, so regenerate it after upgrading.
- `aventara new` and `init` add `.env` to the project's `.gitignore`.

## 0.1.0-pilot.1

Upgrading from pilot.0 needs no code changes; see [Upgrading](/docs/upgrading#from-010-pilot0-to-010-pilot1).

**Frontend setup**

- `avclient init` writes **`framework.client.mts`**, an ES module that works in CommonJS and ESM projects (a plain `npm init -y` frontend now works without `"type": "module"`). From pilot.2 the default is `framework.client.ts` again, and a `.mts` keeps working.
- **TypeScript 7 is supported in the frontend.** The generator's `typescript` peer is `>=5.5.0`. Under TypeScript 7 the post-generate check is a syntax and shape check, reported in one warning; the client is still written. The CLI and the Prisma adapter still require TypeScript below 7 (the scaffolded server uses 6).

**Server**

- NestJS logs one startup line from the host: `Aventara mounted <N> operations at /api (+ GET /api/_contract, POST /api/_transactions)`.
- A request without the identity headers answers `400 A2000`, and the message now names the missing header or headers.

**CLI**

- The printed next steps use your package manager's runner (`npx` or `pnpm dlx`) and the `@pilot` dist-tag.
- `aventara new --help`, `aventara init --help`, `avclient init --help` and `avclient generate --help` print that command's usage and exit 0.

**Known cosmetic**

- The first `npx @aventara/client@pilot init` could print a "typescript could not be resolved" warning and Node's experimental-feature warning, even in a project that had TypeScript. Fixed in pilot.3.

## 0.1.0-pilot.0

The first public pilot release.

- **`aventara new` and `aventara init`** scaffold a NestJS 12 server with Prisma 7 on SQLite or PostgreSQL, or add Aventara to an existing project.
- **Contracts** compiled from your Prisma schema and configuration into three layers (core, application, client); only the client contract is served, at `GET <entrypoint>/_contract`, with its hash as `ETag`.
- **Standard operations** for every Resource: `find` (`first`, `unique`, `many`, `count`), `create` (`one`, `many`, `count`), `update` (`first`, `unique`, `many`, `count`), `delete` (`first`, `unique`, `count`) and `upsert.unique`, with filters, relation filters, `select` / `include`, ordering, offset and cursor pagination, `$count` and nested writes.
- **Interactive transactions** with references between steps (`$ref`), rollback and cascade refusal.
- **A stable response envelope** with `A` codes for outcomes and `V` codes for validation issues, and a fixed HTTP status per code.
- **Configuration**: restrictions per layer (hidden Resources and fields, write-only fields, switched-off operations), limits, pipelines (guards, pipes, hooks, interceptors, filters), virtual fields and behaviors, and a diagnostics sink.
- **`@aventara/nest`** hosts the protocol on Express or Fastify.
- **`@aventara/client`**: `avclient init` and `avclient generate` produce a standalone typed client with typed errors, `AbortSignal` and custom `fetch` support, and `tx` / `transaction`. The generated client has no runtime dependency on Aventara.
- **`@aventara/core/protocol`**: the HTTP protocol as plain data and functions, for writing your own host.
- **`@aventara/testing`**: conformance fixtures for adapters and hosts.
- **License:** PolyForm Shield 1.0.0 with an additional permission; see [License](/docs/license).

## See also

- [Roadmap](/docs/roadmap), [Installation](/docs/installation)
