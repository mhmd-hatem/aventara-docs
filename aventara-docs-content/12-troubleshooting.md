---
title: Troubleshooting
description: Upgrading between pilots, first-run warnings, and fixes for version refusals, stale clients, stale artifacts, CORS and common setup errors.
order: 88
section: reference
---

# Troubleshooting

## Upgrading

Moving between pilot releases (`0.1.0-pilot.0`, `0.1.0-pilot.1`, `0.1.0-pilot.2` to `0.1.0-pilot.3`) is covered on [Upgrading](/docs/upgrading), with the steps in order and what each release changes.

## Warning on `avclient init`: typescript could not be resolved

If the frontend has no `typescript` installed, `avclient init` and `avclient generate` print:

```text
avclient: warning: `typescript` could not be resolved, so the generated output was NOT type-checked — only its shape and syntax were. Install `typescript` (an optional peer of @aventara/client) in this project to restore the type check.
```

The client is generated normally (`checked: syntax`). A TypeScript project has `typescript` installed, and then the generator type-checks the output with the project's own copy (`checked: types`) and prints no warning.

With **TypeScript 7** installed in the frontend (verified with 7.0.2), the generator cannot type-check, because TypeScript 7 has no classic compiler API. It says so, and still generates; your own `tsc` checks the client when it compiles (verified: `tsc` 7.0.2 compiled the client without errors):

```text
avclient: warning: the installed `typescript` 7.0.2 has no classic compiler API (`createProgram`), so the generated output was NOT type-checked — only its shape and syntax were. Your project's own `tsc` checks it when it compiles; a `typescript` 5.5 to 6 restores the generator's own type check.
```

## `avclient init` refuses: no tsconfig.json

```text
avclient: no tsconfig.json was found in /path/to/project/src/api or any directory above it. Aventara's generated client is TypeScript, compiled by your project's own toolchain and written the way its tsconfig.json says; JavaScript projects are not supported yet. Add a tsconfig.json to the project (`npx tsc --init` writes one) ... Nothing was written.
```

A plain JavaScript project (for example a bare `npm init -y`) has no `tsconfig.json`, and the generator refuses before it writes or installs anything. Add a `tsconfig.json`, install `typescript`, and run `init` again. If the project has a `tsconfig.json` and the generated imports still do not match your compiler, see [Client setup](/docs/client-setup#known-issues).

## Node version refused

```text
avclient: Node v20.11.0 is not supported; @aventara/client needs Node ^22.18.0 || >=24.2.0.
```

Both bins refuse in one sentence on a Node outside `^22.18.0 || >=24.2.0` and exit with code 1. Install a supported Node (22.18 or newer on 22.x, or 24.2 or newer) and run the command again.

## `aventara new` fails on Node 22 with npm 10

Node 22 bundles npm 10, which cannot install NestJS 12's own scaffold. Upgrade npm to 11 or newer:

```bash
npm i -g npm@11
```

## `A2005` / `ContractMismatchError`: "Generated client contract does not match the server"

Your generated client is stale. The server's contract changed (a schema change, a restriction, a limit, an operation switched off) since the client was generated, or you are pointing at another deployment. Regenerate against the deployment you call:

```bash
npm run avclient:generate
```

This also happens to a stale client that calls an operation the server no longer advertises. A response that is not a framework envelope at all (a host's own 404 for a path it does not mount) is a `TransportError`, not `A2005`: check the entrypoint URL.

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
aventara: this project declares typescript ^7.0.2, and TypeScript 7 has no classic compiler API for Aventara's generate steps to read types with; use TypeScript 6 or 5.
```

The server side needs TypeScript below 7 (the scaffold uses 6). A TypeScript 7 *frontend* is fine.

## Server does not start

- `DATABASE_URL is not set`: put it in `.env` (the start scripts load it) or in the environment.
- Aventara errors at startup (`FrameworkConstructionError`) list what is wrong in the configuration, for example a hidden Resource whose relation is still visible. See [Configuration](/docs/configuration#restrictions).
- A stale discovery artifact: the schema or Prisma client changed since `aventara:prepare` last ran. The server refuses to start, with one sentence that names the fix:

  ```text
  PrismaDiscoveryArtifactError: The Prisma client has changed since the discovery artifact was generated (field `User.nickname` is in the client and not in the artifact): run `npm run aventara:prepare` (the adapter's `aventara-prisma7-generate`) to regenerate it, then restart.
  ```

  Run `npx prisma generate && npm run aventara:prepare`, then restart. After upgrading Aventara packages the same step applies; see [Upgrading](/docs/upgrading).
- With `NestFactory.create`, a bootstrap error exits the process by default; pass `abortOnError: false` to catch it.

## `A3001` ADAPTER_ERROR

A database failure that Aventara could not classify as something the caller can fix. The response never contains SQL or connection details. The server log gets one line (code, operation, scope, request id, the error's class name), and a `diagnostics` sink in the configuration receives the original error ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log)). Conflicts you can fix are reported as `A2008`, `A2013` or `A2014` instead.

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

Send every required field.

## `A2008` on create

A unique constraint (a duplicate `email`), a missing parent row, or a write that would leave a child without its required parent (for example a `$disconnect` on a required relation). It fails the same way when retried unchanged; change the data. In a transaction, `cause.operation` is the failing step and the whole plan rolls back.

## `A2009` / `V1014`: "limit exceeds maxListLimit (250)"

A list asked for more than the limit. Page with `limit` and `offset` (or `cursor`), or raise `limits.maxListLimit` in [the configuration](/docs/config-reference#limits). The same code covers `V1013` (nesting deeper than 12) and `V1015` (more than 50 boolean nodes in a `where`).

## `A2004` / `V1007` on a unique operation

`find.unique`, `update.unique`, `delete.unique` and `upsert.unique` need `where` to be exactly one identifier (`{ id: 1 }` or `{ email: "..." }`). `{ name: "Ada" }` answers `Unique selector must exactly match one active identifier on Resource "User".` Use `find.first` for a non-unique match.

## `A2004` / `V1008`: "select and include are mutually exclusive" or "is not selectable"

Use `select` or `include`, not both. A field that a restriction made write-only (`capabilities.select: false`) cannot be selected. To-many relations cannot be selected or included at the top level of `create.many` and `update.many` (to-one relations can, and a to-many nested inside an included to-one is allowed; see [Bulk variants differ](/docs/operations-reference#bulk-variants-differ)).

## `A2004` / `V1009`: cursor

`cursor` needs an explicit `orderBy` whose keys exactly match the cursor object, ending in a unique field: `{ "orderBy": [{ "id": "asc" }], "limit": 2, "cursor": { "id": 2 } }`.

## `V1006`: "Relation ... is not writable during create"

Bulk variants (`create.many`, `create.count`, `update.many`, `update.count`) cannot write relations. Set the foreign key (`authorId`) or use `create.one` / `update.unique` with `$connect` and friends.

## Startup: `FrameworkConstructionError`

The message lists diagnostics with a code and a path. Real examples:

```text
configuration  CONFIG_INVALID_VALUE   entrypoint: entrypoint carries a query; a mount path is /-separated segments ...
configuration  CONFIG_UNKNOWN_PROPERTY nope: unknown configuration property: nope
configuration  CONFIG_INVALID_VALUE   limits.maxListLimit: limits.maxListLimit must be a finite non-negative integer
configuration  CONFIG_INVALID_VALUE   transactions: transactions must be "none" or "interactive"
contract-compilation  COMPILER_DANGLING_RELATION  root.resources.User.fields.posts.target: relation target "Post" is not present in the active Contract
contract-compilation  COMPILER_UNKNOWN_FIELD      root.resources.User.fields.nope: field "nope" is not present in the canonical compilation baseline
contract-compilation  COMPILER_UNAVAILABLE_CAPABILITY  ...fields.name.capabilities.filter: capability "filter" requested unavailable values: regex
```

Each is explained in [Configuration reference](/docs/config-reference#startup-diagnostics). The most common: hiding a Resource without hiding the relations that point at it.

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

## `TransportError`

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

A request from an allowed origin gets `Access-Control-Allow-Origin` back; any other origin gets no such header, and the browser reports a CORS error (to the generated client that is a `TransportError` with `status` `null`). The generated client sends custom headers (`Aventara-Protocol-Version`, `Aventara-Contract-Hash`, `Content-Type: application/json`), so browsers send a preflight `OPTIONS`; Nest's `enableCors` answers it. A project that was not created by the current scaffold may have no `enableCors` call at all: add one to `main.ts` ([Deploying](/docs/deploying#cors-and-browsers)). CORS is not access control; see [Rate limiting](/docs/limits-and-safety#rate-limiting) and [Authentication and guards](/docs/authentication-and-guards).

## Still stuck

Capture the `Aventara-Request-Id` from the response (or send your own with `requestId`), find that id in your `diagnostics` sink output, and check [Error codes](/docs/error-codes).

See also: [Upgrading](/docs/upgrading), [Restricting operations](/docs/restricting-operations), [Authentication and guards](/docs/authentication-and-guards), [Limits and safety](/docs/limits-and-safety).
