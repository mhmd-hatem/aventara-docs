---
title: Troubleshooting
description: Upgrading between releases, first-run warnings, and fixes for version refusals, stale clients, stale artifacts, CORS and common setup errors.
order: 88
section: reference
---

# Troubleshooting

## Upgrading

Moving between releases (`0.1.0-pilot.0` through `0.1.0-pilot.4`, `1.0.0-rc.0` and `1.0.0-rc.1`) is covered on [Upgrading](/docs/upgrading), with the steps in order and what each release changes.

## Warning on `avclient init`: typescript could not be resolved

If the frontend has no `typescript` installed, `avclient init` and `avclient generate` print:

```text
avclient: warning: `typescript` could not be resolved, so the generated output was NOT type-checked — only its shape and syntax were. Install `typescript` (an optional peer of @aventara/client) in this project to restore the type check.
```

The client is generated normally (`checked: syntax`). A TypeScript project has `typescript` installed, and then the generator type-checks the output with the project's own copy (`checked: types`) and prints no warning.

With TypeScript 7 installed in the frontend (verified with 7.0.2), the generator cannot type-check, because TypeScript 7 has no classic compiler API. It says so, and still generates; your own `tsc` checks the client when it compiles (verified: `tsc` 7.0.2 compiled the client without errors):

```text
avclient: warning: the installed `typescript` 7.0.2 has no classic compiler API (`createProgram`), so the generated output was NOT type-checked — only its shape and syntax were. Your project's own `tsc` checks it when it compiles; a `typescript` 5.7 to 6 restores the generator's own type check.
```

## `avclient init` refuses: no tsconfig.json

```text
avclient: no tsconfig.json was found in /path/to/project/src/api or any directory above it. Aventara's generated client is TypeScript, compiled by your project's own toolchain and written the way its tsconfig.json says; JavaScript projects are not supported yet. Add a tsconfig.json to the project (`npx tsc --init` writes one) ... Nothing was written.
```

A plain JavaScript project (for example a bare `npm init -y`) has no `tsconfig.json`, and the generator refuses before it writes or installs anything. Add a `tsconfig.json`, install `typescript`, and run `init` again. If the project has a `tsconfig.json` and the generated imports still do not match your compiler, see [Client setup](/docs/client-setup#known-issues).

## Node version refused

```text
avclient: Node v20.11.0 is not supported; @aventara/client needs Node ^22.23.4 || >=24.22.1.
```

Both bins refuse in one sentence on a Node outside `^22.23.4 || >=24.22.1` and exit with code 1. Install a supported Node (22.23.4 or newer on 22.x, or 24.22.1 or newer) and run the command again.

## `aventara new` fails on Node 22 with npm 10

Node 22 bundles npm 10, which cannot install NestJS 12's own scaffold. Upgrade npm to 11 or newer:

```bash
npm i -g npm@11
```

## A server-side call throws instead of returning `{ data, code, cause }`

Since `1.0.0-rc.1`, `framework.application`, `framework.client` and `framework.transaction` resolve the data and throw every failure, like the generated client. Code that read `res.code` and `res.data` reads the result directly and catches the error class instead (`AvNotFoundError` for `A2003`, `AvValidationError` for `A2004`, and so on, from `@aventara/core`). See [Server-side usage](/docs/server-side-usage#errors) and [Error codes](/docs/error-codes#which-error-class).

## `A2005` / `AvContractMismatchError`: "Generated client contract does not match the server"

Your generated client is stale. The server's contract changed (a schema change, an exemption, a validator, a limit, an operation switched off) since the client was generated, or you are pointing at another deployment. Regenerate against the deployment you call:

```bash
npm run avclient:generate
```

This also happens to a stale client that calls an operation the server no longer advertises. A response that is not a framework envelope at all (a host's own 404 for a path it does not mount) is an `AvTransportError`, not `A2005`: check the entrypoint URL.

## `A2000` on every request

Requests to `_resources` and `_transactions` must carry the `Aventara-Protocol-Version` and `Aventara-Contract-Hash` headers. Without them the server answers `400 A2000` and names what is missing, for example:

```text
The Aventara-Protocol-Version and Aventara-Contract-Hash headers are missing.
The Aventara-Contract-Hash header is missing.
```

The generated client always sends them; hand-written requests need them. See [HTTP protocol](/docs/http-protocol#headers).

## `avclient generate` cannot reach the server

```text
avclient: Could not fetch the ClientContract from http://localhost:3999/api/_contract: fetch failed (connect ECONNREFUSED 127.0.0.1:3999). Check that the deployment is running and that the entrypoint is its origin plus mount path.
```

Start the server, and check the entrypoint in `framework.client.ts` or `.env`. The entrypoint includes the mount path (`/api`), and the mount path is the server's `entrypoint`, not Nest's global prefix.

## The typed client was not type-checked

```text
avclient: warning: typescript could not be resolved, so the generated output was NOT type-checked — only its shape and syntax were. Install typescript ...
```

Install `typescript` in the frontend to restore the full type check. The generator uses the project's own TypeScript. Under TypeScript 7, which has no classic compiler API, the check is a syntax and shape check, with a warning, and the client is still generated.

## `aventara init` refuses: TypeScript 7

```text
aventara: this project declares typescript ^7.0.2, and TypeScript 7 has no classic compiler API for Aventara's generate steps to read types with; use TypeScript 5.7 to 6
```

The server side needs TypeScript 5.7 or later and below 7 (the scaffold uses 6). A TypeScript 7 *frontend* is fine.

## Build error: Property 'regenerate_with_aventara_prepare' is missing

After upgrading the Aventara packages, `tsc` or `npm run build` stops in `aventara.config.ts` with:

```text
error TS2741: Property 'regenerate_with_aventara_prepare' is missing in type ... but required in type 'AvPrismaDiscoveryArtifact<...>'
```

The discovery artifact in `src/generated/aventara/` was written by an older version of the adapter. Regenerate it:

```bash
npm run aventara:prepare      # pnpm: pnpm run aventara:prepare
```

If the build does not catch it, the server refuses to start with a message that names `aventara:prepare`; the fix is the same. In a project made by `aventara new` or `aventara init` from pilot.4 on, `build` and the start scripts run `aventara:prepare` first through the `pre` hooks, so this does not recur. See [Upgrading](/docs/upgrading#from-010-pilot3-to-010-pilot4).

The same refusal appears after upgrading to `1.0.0-rc.0`, whose discovery artifact format is 2. Regenerate the artifact (`npm run aventara:prepare`), then the client (`avclient generate`): the Contract hash of a Prisma-backed application changed, and an old client is answered `A2005` until it is regenerated ([Upgrading](/docs/upgrading#from-010-pilot4-to-100-rc0)).

## Build error: Type '2' is not assignable to type '3'

After upgrading to `1.0.0-rc.1`, an artifact written by rc.0 fails the build with two errors, and usually many more after them:

```text
src/aventara.config.ts: error TS2322: Type '{ readonly regenerate_with_aventara_prepare: 2; ... }' is not assignable to type ...
  Types of property 'regenerate_with_aventara_prepare' are incompatible.
    Type '2' is not assignable to type '3'.
src/generated/aventara/discovery.artifact.ts: error TS2724: '"@aventara/core"' has no exported member named 'AdapterModel'. Did you mean 'AvAdapterModel'?
```

rc.1 writes artifact format 3: it carries each model's create requirements, and it imports the type under its rc.1 name, `AvAdapterModel`. Regenerate the artifact (`npm run aventara:prepare`), then rebuild. The errors that followed (an `unknown` result, a stage parameter that is implicitly `any`, a property that does not exist on a façade) come from the old artifact and go away with it. Then regenerate the frontend client (`avclient generate`): the Contract hash changed, and an old client is answered `A2005` until it is regenerated ([Upgrading](/docs/upgrading#from-100-rc0-to-100-rc1)).

## Build error: TS4023 or TS7056 on a helper that takes arguments

A function that takes a call's arguments or builds a `where` from them, without a return type, fails `nest build` (or `tsc` with `"declaration": true`) on `1.0.0-rc.7` and earlier:

```text
error TS4023: Exported variable 'publishedOnly' has or is using name 'ScalarFilterOperands' from external module "@aventara/core" but cannot be named.
error TS7056: The inferred type of this node exceeds the maximum length the compiler will serialize. An explicit type annotation is needed.
```

Upgrade to `1.0.0-rc.8` ([Upgrading](/docs/upgrading#from-100-rc4-to-100-rc8)): the declaration then names the argument types `@aventara/core` exports (`AvWhereInput`, `AvCreateDataInput`, ...) and the error is gone. `TS2883` (`TS2742` on TypeScript 5.9) on a method that returns `framework.appTx.$sql` has the same fix.

If `TS7056` remains on a very large type, annotate the helper with `AvWhereInput` or `AvOperationArgumentsFor`, or with a plain alias off the call. [Server-side usage](/docs/server-side-usage#a-helper-that-takes-or-returns-arguments) shows each.

## `aventara:prepare` fails in `aventara-build`

`aventara-build` runs `src/aventara.config.ts` and `src/aventara.adapter.ts` without a database client. It refuses, naming the file, when:

| Message starts or says | Fix |
|---|---|
| `... exports neither aventaraConfig nor a default` | Export the configuration: `export const aventaraConfig = { ... } as const`. |
| `aventaraConfig in ... is a function` | The configuration is a plain value now, not `aventaraConfig(prisma)`. Move the adapter out ([Upgrading](/docs/upgrading#from-100-rc3-to-100-rc4)). |
| `... builds its own adapter (adapter)` | Take `adapter` out of the configuration. Join it where the framework is created: `{ ...aventaraConfig, adapter: await createPrismaAdapter({ ...adapter, client }) }`. |
| `... sets prebuilt` | `prebuilt` is this build's output. Pass `aventaraContracts` where the framework is created, not in the configuration. |
| `... could not be run: ...` | The configuration, or something it imports, ran code that needs a server, a database client or a request at its top level. Move that code into a function that runs later. |
| `... has no default export` | `src/aventara.adapter.ts` must `export default describePrismaAdapter({ discovery, provider, driver })`. |
| `X is defined twice: by ...` | Two files under `src/resources/` define the same Resource. Keep one. |
| `the installed typescript ... has no classic compiler API` | Use a `typescript` below 7 on the server side. |

A `CONFIG_...` or `COMPILER_...` problem fails the build with the same diagnostics the server prints at startup, with their paths. See [Startup: `AvConstructionError`](#startup-avconstructionerror).

## Warning: prebuilt Contracts are stale

```text
(node:1234) [AVENTARA_PREBUILT_STALE] AventaraWarning: prebuilt Contracts are stale and were not used: Resource Post changed since it was built. The Contracts were compiled at startup instead; regenerate the file with aventara-build.
```

The framework was created with `prebuilt`, and the file no longer matches the configuration, the database model or the installed `@aventara/core`. Nothing is wrong with the answers: the Contracts are compiled at startup, as if there were no file. Run `npm run aventara:prepare` and redeploy. If the message says `the configuration or model outside the Resources changed`, a root key (`policy`, `limits`, `api`, ...) differs between what `aventara-build` ran and what `createFramework` received. Keep such keys in `aventaraConfig`, not only where the framework is created. A value read from `process.env` in the configuration is read when the build runs, so a different value at runtime has the same effect. [Deploying](/docs/deploying#build-time-contracts) has the rest.

## `A4002` where nothing should be refused

A [policy](/docs/policies) is configured and refused the request. `cause.message` says what: the operation, a field, a row, or a change that would leave the caller's read scope. The usual surprises:

- A governed field is in `select` or a filter. A governed field is checked on every row the request reaches, and one row the caller cannot read refuses the whole request. Add a `where` that limits the rows, or fix the engine's grant.
- An update changes a field the read scope reads (`authorId`, `published`) and moves the row out of what the caller may read.
- The engine's `fieldsOf({ access: "write" })` does not list a field the write sends, a relation written through `$create` or `$connect` included.
- `principal` returned `null` or the wrong user: check what `state` seeds into `ctx.$state` ([NestJS host](/docs/nestjs-host#request-state-what-your-middleware-found)).

## Server does not start

- `DATABASE_URL is not set`: put it in `.env` (the start scripts load it) or in the environment.
- Aventara errors at startup (`AvConstructionError`) list what is wrong in the configuration, for example a hidden Resource whose relation is still visible, or a key that moved in rc.1 (`CONFIG_MOVED_PROPERTY`, with its new place in the message). See [Exposure](/docs/exposure) and [Upgrading](/docs/upgrading#from-100-rc0-to-100-rc1).
- A stale discovery artifact: the schema or Prisma client changed since `aventara:prepare` last ran. The server refuses to start, with one sentence that names the fix:

  ```text
  AvPrismaDiscoveryArtifactError: The Prisma client has changed since the discovery artifact was generated (field `User.nickname` is in the client and not in the artifact): run `npm run aventara:prepare` (the adapter's `aventara-prisma7-generate`) to regenerate it, then restart.
  ```

  Run `npx prisma generate && npm run aventara:prepare`, then restart. After upgrading Aventara packages the same step applies; see [Upgrading](/docs/upgrading).
- With `NestFactory.create`, a bootstrap error exits the process by default; pass `abortOnError: false` to catch it.

## `A3001` ADAPTER_ERROR

A database failure that Aventara could not classify as something the caller can fix. The response never contains SQL or connection details. The server log gets one line (code, operation, origin, request id, the error's class name), and a `diagnostics` sink in the configuration receives the original error ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log)). Conflicts you can fix are reported as `A2008`, `A2013` or `A2014` instead.

## `A3004`: a server pipeline produced invalid arguments

One of your [pipes](/docs/pipelines#what-a-pipe-may-and-may-not-do) returned arguments that the server's own contract refuses (a field the Resource does not have, a wrong type). The caller gets only the generic message; the log line names the pipe, the operation and the field. Fix the pipe.

## `delete.many` is "not available"

`delete.many` is not offered with the Prisma adapter (Prisma cannot return the deleted rows). Use `delete.count`.

## Fastify: my Nest middleware runs on Aventara routes

Expected on Fastify; add `.exclude("api/_*path")` to the middleware consumer. See [NestJS host](/docs/nestjs-host#what-runs-on-aventara-routes).

## Nest guards do not protect Aventara routes

By design. Use [pipelines](/docs/configuration#pipelines).

## A new model answers `A2001` (Resource not available)

You added a model to `schema.prisma`, but the server still answers:

```json
{"data":null,"code":"A2001","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1005","path":["resource"],"message":"Resource \"Tag\" is not available in the active Contract."}]}}
```

An already-running server continues to expose what its discovery artifact described when it started. On restart, the adapter compares the artifact's model and field names with the Prisma client and refuses to start if they differ. Run the whole chain, then rebuild and restart, then regenerate the frontend client:

```bash
npx prisma db push                    # or your migration
npx prisma generate && npm run aventara:prepare
npm run build && npm run start
npm run avclient:generate             # in the frontend
```

A removed or renamed model or field is also refused at startup when the Prisma client and artifact disagree. Changes that keep every model and field name, such as a field's type or default, are not detected by this check; regenerate after any schema change ([Upgrading](/docs/upgrading#the-general-upgrade-flow)).

## `A2004` / `V1000` when creating a record

`create.one` without a field that is required and has no default (for `User` below, no `email`) answers `422` `A2004` with one `V1000` issue per missing field, at the field's path:

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1000","path":["arguments","data","email"],"message":"Field \"email\" is required to create User."}]}}
```

Send every required field. In TypeScript the call does not compile: the generated client and the server-side calls require every field the contract lists in `createRequirements`, and a required relation written as the relation or through its reference field (`author` or `authorId`), not both. A required relation that is missing is reported at the relation when the caller may write it there: `Relation "author" is required to create Post: write it, or "authorId".`

If a [pipe](/docs/pipelines) fills the field on the server (a `tenantId` from the request, an `ownerId` from the user), callers still have to send it, because the types follow the contract, not your pipes. Fill it with a [`compute.create`](/docs/computed-fields) stage instead, which removes it from the contract's requirements, or give the column a database default. Hiding the field from the callers' layer and keeping the pipe does not work: while that layer can still create the Resource, startup refuses it (`COMPILER_HIDDEN_REQUIRED_FIELD`), because a pipe is not something the compiler can see.

## `A2008` on create

A unique constraint (a duplicate `email`), a missing parent row, or a write that would leave a child without its required parent (for example a `$disconnect` on a required relation). It fails the same way when retried unchanged; change the data. In a transaction, `cause.operation` is the failing step and the whole plan rolls back.

## `A2009` / `V1014`: "limit exceeds maxListLimit (250)"

A list asked for more than the limit. Page with `limit` and `offset` (or `cursor`), or raise `limits.maxListLimit` in [the configuration](/docs/config-reference#limits). The same code covers `V1013` (nesting deeper than 12) and `V1015` (more than 50 boolean nodes in a `where`).

## `A2004` / `V1007` on a unique operation

`find.unique`, `update.unique`, `delete.unique` and `upsert.unique` need `where` to be exactly one identifier (`{ id: 1 }` or `{ email: "..." }`). `{ name: "Ada" }` answers `Unique selector must exactly match one active identifier on Resource "User".` Use `find.first` for a non-unique match. A unique field the layer may not filter on (write-only, `filter` exempted, or a Pick without `"filter"`) is not an identifier there, so selecting by it answers the same.

## `A2004` / `V1008`: "select and include are mutually exclusive" or "is not selectable"

Use `select` or `include`, not both. A field made write-only by [exposure](/docs/exposure) (its `select` exempted) cannot be selected. To-many relations cannot be selected or included at the top level of `create.many` and `update.many` (to-one relations can, and a to-many nested inside an included to-one is allowed; see [Bulk variants differ](/docs/operations-reference#bulk-variants-differ)).

## `A2004` / `V1009`: cursor

`cursor` needs an explicit `orderBy` whose keys exactly match the cursor object, ending in a unique field: `{ "orderBy": [{ "id": "asc" }], "limit": 2, "cursor": { "id": 2 } }`.

## `V1006`: "Relation ... is not writable during create"

Bulk variants (`create.many`, `create.count`, `update.many`, `update.count`) cannot write relations. Set the foreign key (`authorId`) or use `create.one` / `update.unique` with `$connect` and friends.

## Startup: `AvConstructionError`

The error carries `stage` and a `diagnostics` list, each with a `code`, a `path` and a `message` (Node prints them under the error). Real examples, one per line as stage, code, path and message:

```text
configuration  CONFIG_INVALID_VALUE   entrypoint: entrypoint carries a query; a mount path is /-separated segments ...
configuration  CONFIG_UNKNOWN_PROPERTY nope: unknown configuration property: nope
configuration  CONFIG_INVALID_VALUE   limits.maxListLimit: limits.maxListLimit must be a finite non-negative integer
configuration  CONFIG_INVALID_VALUE   transactionsStyle: transactionsStyle must be "none" or "interactive"
configuration  CONFIG_MOVED_PROPERTY  restrictions: restrictions moved in rc.1: use exposed + exemptions
contract-compilation  COMPILER_DANGLING_RELATION  root.resources.User.fields.posts.target: relation target "Post" is not present in the active Contract
contract-compilation  COMPILER_UNKNOWN_FIELD      root.resources.User.fields.nope: field "nope" is neither discovered by the adapter nor defined at the root
contract-compilation  COMPILER_MISSING_IDENTIFIER client.exemptions.resources.User.operations.find.unique: ... needs an identifier field; pick `id` (or another complete identifier) too
contract-compilation  COMPILER_HIDDEN_REQUIRED_FIELD client.exemptions.resources.Post.fields.title: the client layer still creates resource "Post" (...) but hides its required field "title", ...; expose "title", give "title" a compute.create, or exempt the create operation
```

Each code is explained in [Error codes](/docs/error-codes#startup-codes). The most common: hiding a Resource without hiding the relations that point at it.

## Startup: "DATABASE_URL is not set"

```text
ERROR [ExceptionHandler] Error: DATABASE_URL is not set: put it in .env (the start scripts load it) or in the environment.
```

The scaffold refuses to start without it. The start scripts pass `--env-file .env`; if you run `node dist/main` yourself, use `node --env-file .env dist/main`.

## `aventara init` refuses

```text
aventara: this project is already initialized: src/app.module.ts uses AventaraModule.
aventara: aventara init runs in a NestJS 12 project, and there is no package.json in /path/to/dir.
```

Run it once, in the root of a NestJS 12 project. See [Add to an existing project](/docs/existing-project).

## `avclient generate` cannot find the entrypoint variable

```text
avclient: entrypoint reads AVENTARA_API_URL, which is not set in the process environment or in any of .env.development.local, .env.development, .env.local, .env (mode "development").
```

Add `AVENTARA_API_URL="http://localhost:3000/api"` to `.env`, or pass it in the environment (CI).

## `AvTransportError`

Thrown when no Aventara envelope arrived:

| `status` | Message (real) | Likely cause |
|---|---|---|
| `null` | `The request for "User" find.many failed before any response arrived.` | The server is down, wrong host or port, CORS blocking the browser, no network. |
| `404` | `The response to "User" find.many (HTTP 404) is not an Aventara response envelope.` | The entrypoint is wrong: it must be the origin plus the server's `entrypoint` mount path. A stale client is `A2005`, not this. |
| other | `... is not an Aventara response envelope.` | A proxy or gateway answered (an HTML error page, a 502). |

## Browser: CORS errors

A browser frontend on another origin than the API (Vite on `5173`, Next.js on `3001`) is blocked unless the server allows its origin. The scaffold does that from `CORS_ORIGINS` in the server's `.env`: a comma-separated list, default `http://localhost:5173,http://localhost:3001`; unset or empty, CORS is off. Add your frontend's origin and restart:

```bash
CORS_ORIGINS="http://localhost:5173,https://app.example.com"
```

A request from an allowed origin gets `Access-Control-Allow-Origin` back; any other origin gets no such header, and the browser reports a CORS error (to the generated client that is an `AvTransportError` with `status` `null`). The generated client sends custom headers (`Aventara-Protocol-Version`, `Aventara-Contract-Hash`, `Content-Type: application/json`), so browsers send a preflight `OPTIONS`; Nest's `enableCors` answers it. A project that was not created by the current scaffold may have no `enableCors` call at all: add one to `main.ts` ([Deploying](/docs/deploying#cors-and-browsers)). CORS is not access control; see [Rate limiting](/docs/limits-and-safety#rate-limiting) and [Authentication and guards](/docs/authentication-and-guards).

## Next.js: more than one copy of `@aventara/core`

Next.js bundles a package into each server layer (instrumentation, route handlers, Server Components) as a copy of its own, so one process can hold several copies of `@aventara/core`. Copies of one major version recognize each other's values and errors: a decimal made by one copy is an `AvDecimal` to the others, a `find.many` that selects a decimal is encoded (not `500` `A3003` "Result serialization failed"), `instanceof AvValidationError` and the other error classes hold, and a framework's `diagnostics` sink gets reports raised through another copy.

Still keep one copy. `next.config.ts` should list both packages, as `aventara new --host next` and `init` write it:

```text
serverExternalPackages: ["@aventara/core", "@aventara/prisma7-adapter"],
```

If your config already had a `serverExternalPackages` list, `init` left it alone and printed the line: add the two names to it. Copies of different majors do not recognize each other; `npm ls @aventara/core` shows which versions are installed. See [Next.js host](/docs/nextjs-host#serverexternalpackages).

## Next.js: "avClient from @/aventara/client runs in the browser only"

A Client Component called `@/aventara/client` while it rendered on the server. Nothing was sent. Call it from an event handler, `useEffect` or `useQuery`, which run in the browser; or, for data the server should fetch, use `avClient` from `@/aventara/server` in a Server Component, or from `@/aventara/universal` in code that runs on both sides ([The three clients](/docs/nextjs-host#the-three-clients)).

## Next.js: "avClient from @/aventara/universal ran on the server ... nothing is registered"

The universal client reaches the app in process through what `ready()` registers, and `ready()` never ran. `src/instrumentation.ts` must export `register()` and, when `process.env.NEXT_RUNTIME` is `"nodejs"`, await `ready()` from `@/aventara/server` ([Startup](/docs/nextjs-host#startup-instrumentationts)).

## Next.js: "`avClient.tx` builds its handles on the Framework ... `await ready()`"

Transaction handles (`avClient.tx`, `avApp.appTx`) are built on the built framework. With the scaffold's `instrumentation.ts` the framework is built at startup. In a script or a test without it, `await ready()` first.

## Next.js: "another configuration already serves the `api` path"

Two `Aventara()` calls with different options claim the same `api` path in a production server. Give each its own `api` path and route folder. In `next dev` the newer one replaces the older instead ([One framework per api path](/docs/nextjs-host#one-framework-per-api-path)).

## Next.js: "`mcp` on Next.js needs `authorization`"

On Next.js an MCP endpoint must carry `authorization`: Next.js adds `x-forwarded-for` to every request, so an open endpoint would refuse every caller. Add `authorization: { servers, verify }` ([MCP](/docs/mcp#authorization)).

## Still stuck

Capture the `Aventara-Request-Id` from the response (or send your own with `requestId`), find that id in your `diagnostics` sink output, and check [Error codes](/docs/error-codes).

See also: [Upgrading](/docs/upgrading), [Exposure](/docs/exposure), [Authentication and guards](/docs/authentication-and-guards), [Limits and safety](/docs/limits-and-safety).
