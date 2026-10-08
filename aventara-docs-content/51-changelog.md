---
title: Changelog
description: User-facing changes in each Aventara release, newest first.
order: 90
section: about
---

# Changelog

`1.0.0-rc.0` is the first release candidate; the releases before it are pilots, and a pilot's API could change. A release candidate changes the API only to fix what testing finds. Pin exact versions. All `@aventara/*` packages are released together at one version. Each package also ships this history for itself as a `CHANGELOG.md` beside its README.

## 1.0.0-rc.0

The current release, published under the `rc` dist-tag (install with `@rc`). Upgrading from pilot.4: see [Upgrading](/docs/upgrading#from-010-pilot4-to-100-rc0). The renames and behaviour changes are marked **Breaking** or **Behaviour change**; nothing sent over HTTP changes.

**Breaking**

- `scope` is now `origin`. Where a request came from (`"application"` or `"client"`) is `ctx.origin` in every guard, pipe, hook, interceptor and filter, in the context a computed field's behavior receives, in every diagnostic your `diagnostics` function receives, and in the request objects `framework.execute` and `framework.executeTransaction` take. There is no alias: replace `scope` with `origin`. The deprecated type `OperationScope` is gone; use `RequestOrigin`. The Nest log line for an internal failure now reads `(client origin, request ...)`.
- `@aventara/core` exports fewer names. Every name removed was undocumented, and every documented name is still exported. What Aventara's own packages need moved to `@aventara/core/internal`, which is not public API: it has no stability promise and may change or disappear in any release. Applications import from `@aventara/core`.

**Transactions**

- `$ref` works almost anywhere a value does. A step can use an earlier step's result in `$connect`, `$disconnect`, `$set` and the `where` of `$connectOrCreate`; in a `cursor`; in a unique `where`; in any filter operator at any depth, `AND`, `OR`, `NOT` and relation filters included; and at any depth of nested writes (the data of `$create`, `$update` and `$upsert`, and the `where` of `$update`, `$delete` and `$upsert`). The typed builders and the generated client accept a reference exactly where the server does: of the field's own type, nullable only for an equality on a nullable field, a list field for `in`, `notIn`, `hasEvery` and `hasSome`. An equality with a nullable source matches the rows where the field is unset, which can be many rows; comparison and text operators, unique keys and cursors refuse a nullable source (`A2007` / `V1011`). A reference in an `orderBy` or in a projection's `where` is still refused. See [Transactions with $ref](/docs/transactions-with-ref).

**Typed JSON**

- A `Json` field can have a type. Build a shape with `AvZ` from the new entry `@aventara/core/json` and declare it under `fields`. Server code and the generated client read and write the field as that type, and every write is checked before the database is asked, with one issue per problem at its exact path (`V1000`, `V1001`, `V1002`, `V1004`, `V1005`). Shapes are types only, with closed objects; reads and filters are never checked. The shape is part of the client contract, so declaring one changes the hash: regenerate the client. See [JSON fields](/docs/json-fields).

**Type-checking and validation**

- Pipeline callbacks type-check in an `as const` configuration. A guard, pipe, hook, interceptor or filter annotated with `Guard`, `Pipe`, `BeforeHook`, `AfterHook`, `Interceptor` or `Filter`, with no model type, is accepted wherever one typed for your model is, so the `Pick<PipelineContext, ...>` workaround is no longer needed (it keeps working). See [Pipelines](/docs/pipelines#typing-a-stage).
- A `null` in an operator that cannot take it is a `422`, not a `500`. `gt: null`, `contains: null`, `in: null` and the rest answer `A2004` / `V1001` at that operator, and are type errors. `equals: null` and `not: null` are unchanged.
- A relation filter in a nested `$update` or `$delete` is a `422`. Through a to-many relation on Prisma 7, the nested `where` takes plain fields only; a relation filter there answers `A2004` / `V1006` before the database is asked (it was `500` `A3001`), and is a type error. A to-one relation keeps relation filters. The contract states the limit, so the hash changes for a schema with a to-many relation: regenerate the client.

**Fixes**

- `framework.client` and `framework.application` types follow your restrictions. Hidden fields, turned-off `select`, `filter`, `order`, `create` and `update` capabilities, and disabled operations are now reflected per layer, like the generated client. A field hidden at the root is hidden on `framework.application` too. Filter operator narrowing is still not reflected in types.
- A pipeline stage's issue keeps its path inside a transaction. It arrives at `["operations", i, "args", ...]`.
- Every transaction error path is the literal address in the request body. Argument issues are at `["operations", i, "args", ...]`; a step's own defects are at `["operations", i, "resource"]`, `"family"`, `"variant"`, `"fingerprint"`, an unknown key, or `["operations", i]`. See [Error codes](/docs/error-codes#v-codes).
- An unavailable operation points at `["family"]` or `["variant"]` (`A2002` / `V1006`), never `["operation"]`.
- `deliberate` is readable on every diagnostic your `diagnostics` function receives; only operation diagnostics ever set it.

**Server-side calls**

- Behaviour change: server-side calls copy what you pass. `framework.application`, `framework.client`, `framework.execute`, `framework.executeTransaction` and the `appTx` / `clientTx` builders read your arguments once, when you call them. Changing or revoking your object afterwards (an Immer draft after `produce`) no longer affects the operation; a live Proxy still works. A value that cannot be read or is not plain data (a revoked Proxy, a throwing getter, a class instance, a `Map`) is refused as `422 A2004` / `V1001` at its path, where it used to be `A3000`, a `TypeError` from a builder, or accepted. Inherited, non-enumerable and symbol keys are dropped. See [Server-side usage](/docs/server-side-usage#what-a-server-side-call-accepts).
- A `misuse` hook counts those refusals. The optional root setting `misuse` receives a `FrameworkMisuseEvent` (`kind`, `path`, and the operation's `origin`, `resource`, `family`, `variant` and step), never the value. See [Configuration reference](/docs/config-reference#misuse).
- The generated client guards its arguments too. A value it cannot read is refused with a `TypeError` that names where, before anything is sent.

**Fixes found in testing**

- Root pipelines keep the framework typed. A guard, pipe, hook, interceptor or filter with a bare stage type in the root `pipelines` no longer turns `framework.application`, `framework.client`, `framework.appTx` and `framework.clientTx` into untyped objects.
- A reference field and its relation in one record is a `422`. `authorId` with `author: { $connect: … }` (required or optional relation) answers `A2004` / `V1012`, `Set "authorId" or "author", not both.`, where it used to be `500 A3001`. With Prisma, a record that writes one relation through its field and another directly is refused the same way, and the Contract states it as `referenceWrites: "uniform"`. Regenerate the discovery artifact (`npm run aventara:prepare`) and the client (`avclient generate`): the artifact format is now 2 and the Contract hash of a Prisma-backed application changed.
- Your issue messages reach the caller. A `FrameworkError("A2004", { message, issues })` you throw from a pipeline or computed behavior sends each issue's message as written (non-blank, at most 1,000 characters; the path must name a member of the request's arguments).
- A malformed `framework.execute` request is a `422`. A wrong `requestId`, `origin`, `protocol`, `transport`, `resource`, `family` or `variant` answers `A2004` with one issue per wrong member, and nothing runs; it used to be `A3000` or ran anyway.

**Diagnostics**

- `diagnostics` hears more. It now also receives an `A3xxx` error you threw on purpose (marked `deliberate: true`), a result that does not match its Contract (`OutputValidationError`), a computed field that returns a refused value (`ComputedValueError`), and, in a custom host that mounted only some of `protocol.surface()`, a request for a route it left out (`UnmountedRouteError`). What the caller receives is unchanged. See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics#what-else-reaches-it).
- `FrameworkError` messages. For any code outside `A3xxx` the message reaches the caller exactly as written: keep database text, SQL, stacks, paths and secrets out of it.

**CLI and packages**

- Progress while it works. `aventara new`, `aventara init`, `avclient init` and `avclient generate` show their steps on stderr (a spinner and the seconds so far on a terminal, one plain line per step in a pipe, in CI or with `NO_COLOR`), then a closing line with the total time. `aventara` gains `--verbose` to show the output of `nest new` and the install as it runs. See [CLI reference](/docs/cli-reference#progress-aventara).
- Next steps print last. `aventara new` ends with the next steps, after the commit and the closing line. The scaffold's `prebuild` and `prestart` hooks are unchanged.
- `@aventara/testing` loads under CommonJS, and adds `AvProtocolCorpus` (the corpus's server side, to serve through your own client or host) and the corpus as plain JSON at `@aventara/testing/fixtures/protocol-v1.json`. The corpus gained rows for a transaction whose unique `where` and filter reference an earlier step, and for a reference to a step that does not exist. See [Testing and conformance](/docs/testing-and-conformance).
- Each package ships its `CHANGELOG.md`, beside its README.
- `@aventara/core` depends on `zod`, which only `@aventara/core/json` loads.

## 0.1.0-pilot.4

Published under the `pilot` dist-tag. Upgrading from pilot.3: see [Upgrading](/docs/upgrading#from-010-pilot3-to-010-pilot4).

**Server and CLI**

- The discovery artifact regenerates when you build or start. `aventara new` and `aventara init` add `prebuild`, `prestart`, `prestart:dev` and `prestart:debug` scripts that run `aventara:prepare`. After a change to `schema.prisma`, the next `npm run start:dev` (or `build`, `start`, `start:debug`) regenerates the Prisma client and the artifact before the server compiles; no reinstall needed. npm and pnpm run these hooks; Yarn Berry and pnpm with `enable-pre-post-scripts=false` do not, so run `aventara:prepare` yourself there. On an existing project, `aventara init` keeps a `prebuild` or `prestart*` script you already have unless you confirm or pass `--yes`.
- A clear error for an old artifact. An artifact written by an older adapter now fails the TypeScript build with `Property 'regenerate_with_aventara_prepare' is missing`, and the adapter refuses it at start-up with a message that names `aventara:prepare`. The fix is `npm run aventara:prepare`. See [Troubleshooting](/docs/troubleshooting#build-error-property-regenerate_with_aventara_prepare-is-missing).
- The scaffold's rate-limiting note links to the docs: [Rate limiting](/docs/limits-and-safety#rate-limiting), where it used to carry a placeholder.
- Plainer messages. The generate step's error messages say "the generated client's types" in words, not with Prisma's emoji labels.

**Packages**

- The comments an editor shows on hover, and the READMEs, now describe what each export does, how to use it, what it returns and what it throws. This applies to `@aventara/core`, `@aventara/nest`, `@aventara/prisma7-adapter`, `@aventara/client` and `@aventara/testing`, and to the declarations a generated client copies from `@aventara/core`.
- `@aventara/cli` ships no type declarations: it is a command, run with `npx` or installed globally, and has no API to import.

## 0.1.0-pilot.3

Published under the `pilot` dist-tag. Upgrading from pilot.1 or pilot.2: see [Upgrading](/docs/upgrading#from-010-pilot1-or-pilot2-to-010-pilot3).

**Server and CLI**

- CORS in the scaffold. `aventara new` and `aventara init` turn CORS on in `src/main.ts` for the origins listed in `CORS_ORIGINS` (default `http://localhost:5173,http://localhost:3001`), and write that variable into `.env`, an existing `.env` included. Unset or empty means CORS is off, never open to every origin. A `main.ts` that already configures CORS is left alone, with a warning; one with no `NestFactory.create` line is not edited, and the lines are printed. Before this, a browser frontend on another port got a CORS error. See [Deploying](/docs/deploying#cors-and-browsers).
- Rate limiting. The scaffold's `main.ts` ends with a commented-out platform-level limiter and a note: `@nestjs/throttler` is a Nest guard and does not run on Aventara's routes, `express-rate-limit` does. See [Rate limiting](/docs/limits-and-safety#rate-limiting).
- A first commit. `aventara new` ends with a git commit, `Initial Aventara Scaffold` (never `.env`), unless git is not installed or configured, the directory is already inside a repository, or you pass `--skip-git`.
- `--orm` takes an adapter name, `prisma7`; `--help` lists the values for `--orm`, `--db` and `--package-manager`. `prisma` and `prisma@7` are no longer accepted.

**Frontend**

- `avclient init` refuses a project with no `tsconfig.json` before it writes or installs anything (plain JavaScript is not supported yet).
- `avclient init` adds `.env` to the frontend's `.gitignore`.
- The generated client is type-checked with your project's own TypeScript, so the "typescript could not be resolved" warning appears only in a project without it, and Node's `stripTypeScriptTypes` warning is gone.

## 0.1.0-pilot.2

**Generated client**

- The client fits your project. It is still TypeScript source (`AvClient.ts` and `generated/`), but its imports are now spelled the way your `tsconfig.json` says: extensionless under `bundler` resolution (Next.js with Turbopack or webpack) or CommonJS, `.js` under `nodenext` (NestJS 12), `.ts` where your imports name `.ts` files (Vite's `react-ts`, Node's type stripping). You import it like your own files. Next.js 16 with Turbopack, which could not resolve the pilot.1 client, builds it. See [Client setup](/docs/client-setup#importing-the-client).
- The config loads like `prisma.config`. `avclient init` writes `framework.client.ts`; `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` are read, in ESM or CommonJS syntax. A pilot.1 `framework.client.mts` keeps working. Two config files are refused.
- The client type-checks under `"strict": false`, the `tsconfig` Next.js writes. A project without a `tsconfig.json` is refused.
- `avclient --version` and `-v`; `aventara -v`.

**Server**

- Pipe output is validated. What a pipe returns is checked against the server's own contract before it reaches the database. A refusal is the new internal code `A3004` (`500`) with the generic message `A server pipeline produced invalid arguments.`; the pipe, operation and field go to the server log and your diagnostics sink only. See [Pipelines](/docs/pipelines#what-a-pipe-may-and-may-not-do).
- A create that lacks a required field is `422` `A2004` with a `V1000` issue at the field's path, instead of `500` `A3001`. It covers `create.one`, every row of `create.many`, the create branch of an upsert, nested creates and transaction steps.
- A `BigInt` outside signed 64-bit is `A2004` / `V1004`, instead of `A3001`.
- Orphaning a required child (`$set: []` or `$disconnect` on a to-many whose children require the parent) is `409` `A2008`, instead of `A3001`.
- Internal failures are logged. `A3000` to `A3004` each write one line to Nest's log (code, operation, scope, request id, error class; never the error's message). See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log).
- A stale discovery artifact stops the server at startup, with a sentence that names `aventara:prepare`, when the Prisma client has a model or field the artifact lacks. The artifact's format changed, so regenerate it after upgrading.
- `aventara new` and `init` add `.env` to the project's `.gitignore`.

## 0.1.0-pilot.1

Upgrading from pilot.0 needs no code changes; see [Upgrading](/docs/upgrading#from-010-pilot0-to-010-pilot1).

**Frontend setup**

- `avclient init` writes `framework.client.mts`, an ES module that works in CommonJS and ESM projects (a plain `npm init -y` frontend now works without `"type": "module"`). From pilot.2 the default is `framework.client.ts` again, and a `.mts` keeps working.
- TypeScript 7 is supported in the frontend. The generator's `typescript` peer is `>=5.5.0`. Under TypeScript 7 the post-generate check is a syntax and shape check, reported in one warning; the client is still written. The CLI and the Prisma adapter still require TypeScript below 7 (the scaffolded server uses 6).

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

- `aventara new` and `aventara init` scaffold a NestJS 12 server with Prisma 7 on SQLite or PostgreSQL, or add Aventara to an existing project.
- Contracts compiled from your Prisma schema and configuration into three layers (core, application, client); only the client contract is served, at `GET <entrypoint>/_contract`, with its hash as `ETag`.
- Standard operations for every Resource: `find` (`first`, `unique`, `many`, `count`), `create` (`one`, `many`, `count`), `update` (`first`, `unique`, `many`, `count`), `delete` (`first`, `unique`, `count`) and `upsert.unique`, with filters, relation filters, `select` / `include`, ordering, offset and cursor pagination, `$count` and nested writes.
- Interactive transactions with references between steps (`$ref`), rollback and cascade refusal.
- A stable response envelope with `A` codes for outcomes and `V` codes for validation issues, and a fixed HTTP status per code.
- Configuration: restrictions per layer (hidden Resources and fields, write-only fields, switched-off operations), limits, pipelines (guards, pipes, hooks, interceptors, filters), virtual fields and behaviors, and a diagnostics sink.
- `@aventara/nest` hosts the protocol on Express or Fastify.
- `@aventara/client`: `avclient init` and `avclient generate` produce a standalone typed client with typed errors, `AbortSignal` and custom `fetch` support, and `tx` / `transaction`. The generated client has no runtime dependency on Aventara.
- `@aventara/core/protocol`: the HTTP protocol as plain data and functions, for writing your own host.
- `@aventara/testing`: conformance fixtures for adapters and hosts.
- License: PolyForm Shield 1.0.0 with an additional permission; see [License](/docs/license).

## See also

- [Roadmap](/docs/roadmap), [Installation](/docs/installation)
