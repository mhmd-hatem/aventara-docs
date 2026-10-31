---
title: Upgrading
description: Move from 1.0.0-rc.11 to 1.0.0-rc.12 (lookup keys need filter, the scaffold's String ids), from 1.0.0-rc.8 to 1.0.0-rc.11 (Node and Prisma floors, stricter policy checks, grouped client calls, regenerate clients), from 1.0.0-rc.4 to 1.0.0-rc.8 (rebuild after a discovery change, policy additions, request type names), from 1.0.0-rc.3 to 1.0.0-rc.4 (build-time Contracts, the policy seam), from 1.0.0-rc.2 to 1.0.0-rc.3, from 1.0.0-rc.1 to 1.0.0-rc.2, from 1.0.0-rc.0 to 1.0.0-rc.1 (the new configuration shape, Av names, the $ ctx members) and from earlier pilots step by step, and the general flow for upgrading Aventara packages.
order: 34
section: guides
---

# Upgrading

Aventara `1.0.0-rc.12` is the tenth published release candidate (`1.0.0-rc.5`, `1.0.0-rc.6` and `1.0.0-rc.7` were tagged but never published, and rc.9 and rc.10 sit between rc.8 and rc.11), and the next release follows it; releases before `1.0.0-rc.0` are pilots. This page covers the move to `1.0.0-rc.12` from `1.0.0-rc.11`, the move to `1.0.0-rc.11` from `1.0.0-rc.8`, the move to `1.0.0-rc.8` from `1.0.0-rc.4`, the move to `1.0.0-rc.4` from `1.0.0-rc.3`, the move to `1.0.0-rc.3` from `1.0.0-rc.2`, to `1.0.0-rc.2` from `1.0.0-rc.1`, to `1.0.0-rc.1` from `1.0.0-rc.0`, then to `1.0.0-rc.0` from `0.1.0-pilot.4`, to `0.1.0-pilot.4` from `0.1.0-pilot.3`, to `0.1.0-pilot.3` from `0.1.0-pilot.1` (or `0.1.0-pilot.2`), and from `0.1.0-pilot.0`, followed by the general flow that applies to every release.

## From 1.0.0-rc.11 to 1.0.0-rc.12

Before 1.0 the API does not keep backward compatibility, so the breaking change is listed plainly in step 2. Most projects change a version number, regenerate and rebuild.

### 1. Install the new versions

```bash
npm install --save-exact @aventara/core@1.0.0-rc.12 @aventara/nest@1.0.0-rc.12 @aventara/prisma7-adapter@1.0.0-rc.12 @aventara/build@1.0.0-rc.12
# add @aventara/mcp@1.0.0-rc.12 and @aventara/testing@1.0.0-rc.12 to the command if you use them
```

Move the frontend's `@aventara/client` to the same version, and run `npx @aventara/cli@1.0.0-rc.12 skill` to refresh the agent skill. Then run `npm run aventara:prepare` on the server and `avclient generate` in each frontend.

### 2. Breaking changes

| Change | What to do |
| --- | --- |
| A unique field (`id` included) that a layer may not filter on is no longer a lookup key in that layer. That is a Pick that lists it without `"filter"`, a write-only field, or one with `filter` exempted. `find.unique`, `update.unique`, `upsert.unique`, `delete.unique` and a nested `$connect` or `$connectOrCreate` by it are refused (`V1007`), and the generated client no longer offers them | Give the field `"filter"` in that layer where callers look records up by it: `id: ["select", "filter"]`, not `id: ["select"]`. |
| A layer that keeps a `.unique` operation but has no filterable identifier left fails at startup with `COMPILER_MISSING_IDENTIFIER` | Add `"filter"` to the identifier field, or exempt the `.unique` operations in that layer. |

### 3. Scaffold changes

These change only what `aventara new` and `aventara init` write. An existing project keeps its files.

- The starter `User` model's id is `String @id @default(cuid())` instead of an `Int` autoincrement. A project scaffolded before keeps its schema.
- Prisma, `@prisma/client` and the driver adapter are written at the adapter's range `^7.10.1`, so the first install takes the newest Prisma 7 and never Prisma 8.
- `aventara init` adds `.env` to `.gitignore` whenever it writes to `.env`. If you ran `init` over an existing project before, check that your `.gitignore` lists `.env`.
- `@aventara/nest` is built and tested against NestJS 12.3.2. Its peer range stays `^12.0.0`, so nothing has to change.

## From 1.0.0-rc.8 to 1.0.0-rc.11

`1.0.0-rc.9` and `1.0.0-rc.10` were published between them, so this one step covers all three releases. Before 1.0 the API does not keep backward compatibility, so the breaking changes are listed plainly in step 3. Most projects change a version number, regenerate and rebuild.

### 1. Check Node and Prisma

- Node must be `^22.23.4` or `>=24.22.1` (the Node security releases of 2026-10-20). The `aventara` and `aventara-build` bins refuse an older Node in one sentence naming that range.
- The Prisma 7 adapter needs Prisma `^7.10.1` (`prisma`, `@prisma/client` and the driver adapters). Raise yours first.

### 2. Install the new versions

```bash
npm install --save-exact @aventara/core@1.0.0-rc.11 @aventara/nest@1.0.0-rc.11 @aventara/prisma7-adapter@1.0.0-rc.11 @aventara/build@1.0.0-rc.11
# add @aventara/mcp@1.0.0-rc.11 and @aventara/testing@1.0.0-rc.11 to the command if you use them
```

One command moves every `@aventara/*` package together, as in earlier steps. Move the frontend's `@aventara/client` to the same version, and run `npx @aventara/cli@1.0.0-rc.11 skill` to refresh the agent skill.

Then regenerate and rebuild: `npm run aventara:prepare` on the server, and `avclient generate` in each frontend. **Every ClientContract hash changes**, because its limits now carry `maxAll` and `maxAllConcurrency`. A client generated against rc.8 answers `409 A2005` until you regenerate it.

### 3. Breaking changes

| Change | What to do |
| --- | --- |
| A to-one `$update` or `$upsert` beside `$connect`, `$connectOrCreate`, `$create`, `$set` or `$disconnect` on the same relation is refused (`A2004`, `V1012`) | Split it into two writes: relink in one, update the linked row in the other. A to-many operand is unaffected. |
| A reference field written as a value (`authorId: "u2"`) is held to the target's read scope, and a row a write names to link that is not there answers `A4002` where the target has a scope (it answered `A2008` or `A2003`) | Only matters with a policy. Handle `A4002` where you handled those codes. Without a scope the codes are unchanged. |
| A Resource named `all` is refused at construction (`COMPILER_RESERVED_RESOURCE_NAME`) | Rename the model, or keep it out of the Client Contract. |
| The calls an `avClient` makes in one tick are grouped into one `POST /_all` | Nothing to change: each call still resolves or throws on its own. Pass `grouping: false` (per call, or `new AvClient({ grouping: false })`) to send calls one by one. A call with `headers` or a `requestId` already goes alone. |
| `avLazy` keeps no answer across requests on a server | Nothing to change unless you relied on a module-scope `avLazy` sharing its answer. In a Next.js app import `avLazy` from `@/aventara/universal` for one answer per React render. |
| New limit keys `limits.maxAll` (default 10) and `limits.maxAllConcurrency` (default 4) | Nothing to change. Set them at the root or per layer to move them. They are in the ClientContract, so the hash moves. |
| A `client.resources` or `agent.resources` entry for a Resource marked `managedElsewhere` is refused (`COMPILER_UNKNOWN_RESOURCE`) | Configure it at the root or in `application`. |
| `access` together with `policy`, or the module's `state` option beside `access`, is refused | Use one of them. |
| `mcp.authorization.servers` entries with a query, a fragment, an empty path segment or port 0 are refused, and `http://localhost` is refused | Write a loopback server as `http://127.0.0.1:4000`. Use https outside development. |
| An MCP endpoint without `authorization` answers `403` unless the `Host` header is loopback | Call it as `127.0.0.1`, `localhost` or `[::1]`, or configure `authorization`. |
| `Bytes[]` columns no longer offer `equals`, `hasEvery` and `hasSome` | Use `has` or `isEmpty`. |

### 4. Docs moved

The docs are at https://aventara.razor34.dev/framework. The error catalog's `docs` links, `ERRORS.md` and the links in the agent skill point there after you upgrade. Update any bookmark or link of your own.

### 5. New and optional

- Cached reads: add a `cache({ for, maxAge })` stage to opt a `find` in. Nothing is cached until you do. See [Caching reads](/docs/caching-reads).
- `avLazy(() => call)` makes a call only when it is first awaited (calls still run when made, as before). `framework.serverClient.all` and `avClient.all` on the server, `framework.serverClient` for application-value calls, `access` providers, `managedElsewhere` and the Next.js host are new. Each is optional; see the [Changelog](/docs/changelog) for rc.9, rc.10 and rc.11.

## From 1.0.0-rc.4 to 1.0.0-rc.8

`1.0.0-rc.5`, `1.0.0-rc.6` and `1.0.0-rc.7` were never published, so this is the step from rc.4 to the next release. It holds everything planned for them, plus the fixes their checks found: typed policy engines compile in projects that emit declarations, and so do helpers that read the Core Contract (`framework.contracts.core`) and helpers that take or return a call's arguments.

Nothing in your configuration has to change. Two things do need a rebuild, and the construction error reads differently. A Framework without a `policy` serves the same Contracts and the same hashes as rc.4, so a client generated against rc.4 keeps working.

### 1. Install the new versions

```bash
npm install --save-exact @aventara/core@1.0.0-rc.8 @aventara/nest@1.0.0-rc.8 @aventara/prisma7-adapter@1.0.0-rc.8 @aventara/build@1.0.0-rc.8
# add @aventara/mcp@1.0.0-rc.8 and @aventara/testing@1.0.0-rc.8 to the command if you use them
```

One command moves every `@aventara/*` package together. `@aventara/build` stays in `devDependencies`: npm updates a package in the section where it already is. Installing the packages in two commands makes npm print a peer-dependency warning (`ERESOLVE`), because `@aventara/build` needs the same version of `@aventara/core`.

Move the frontend's `@aventara/client` to the same version, and run `npx @aventara/cli@1.0.0-rc.8 skill` to refresh the agent skill.

### 2. Regenerate the discovery artifact and rebuild the prebuilt Contracts

Discovery now records, on the end of a relation that holds the reference, which fields of the target its reference fields name. The artifact's model hash changes, and so does the fingerprint of a prebuilt Contracts file. Run your generate step and `aventara-build` again (`npm run aventara:prepare` in the scaffold; `pnpm run aventara:prepare` with pnpm, `yarn aventara:prepare` with yarn). Until you do, the prebuilt file reads as stale (`AVENTARA_PREBUILT_STALE`) and the Contracts compile at startup.

### 3. The construction error message names the first problem

`AvConstructionError.message` used to be the stage's sentence alone. It now adds the first diagnostic and how many more there are:

```text
// before
Aventara framework configuration validation failed

// now
Aventara framework configuration validation failed: CONFIG_INVALID_TYPE at adapter.execute: adapter.execute must be a function (+2 more)
```

`stage` and `diagnostics` are unchanged. Code that compares `error.message` to the old sentence should compare `error.stage` or read `error.diagnostics` instead.

### 4. Names that moved

These matter only if your code imports a name from `@aventara/core/internal`, which is not public API. The request types of `framework.execute` and `framework.executeTransaction` left it, and are exported from `@aventara/core` under new names:

| Was, in `@aventara/core/internal` | Now, in `@aventara/core` |
|---|---|
| `FrameworkOperationRequest` | `AvOperationRequest` |
| `FrameworkApplicationOperationRequest` | `AvApplicationOperationRequest` |
| `FrameworkClientOperationRequest` | `AvClientOperationRequest` |
| `FrameworkAgentOperationRequest` | `AvAgentOperationRequest` |
| `FrameworkTransactionRequest` | `AvTransactionRequest` |
| `FrameworkApplicationTransactionRequest` | `AvApplicationTransactionRequest` |
| `FrameworkClientTransactionRequest` | `AvClientTransactionRequest` |
| `FrameworkAgentTransactionRequest` | `AvAgentTransactionRequest` |
| `ClientProtocolIdentity` (a remote request's `protocol`) | `AvRequestProtocol` |

Change the import; the shapes are the same. The old names are gone from `@aventara/core/internal`. New names that the declarations of your helpers can now write: `AvScalarFilterOperands`, `AvScalarWhereInput`, `AvNoAdvertisedMember`, `AvSqlStatementBuilder` and `AvSqlStatementValue`. See [Server-side usage](/docs/server-side-usage#a-helper-that-takes-or-returns-arguments).

### 5. The discovery artifact's `referenceFields`

This matters only if your code reads the discovery artifact (`src/generated/aventara/discovery.artifact.ts`). In `referentialActions.<Resource>.owningEdges[]`, the fields of the Resource itself that hold the reference are now called `referenceFields`; they were called `references`. A model's relation fields already use `references` for the target's fields, so the same word meant two lists in one file. Code that read `owningEdges[i].references` reads `owningEdges[i].referenceFields`.

Regenerate the artifact (`npm run aventara:prepare`; `pnpm run aventara:prepare` with pnpm, `yarn aventara:prepare` with yarn). The artifact changes only in those keys: the model hash and the prebuilt Contracts file are the same as before the rename.

### 6. Policy additions

These matter only if you write a [policy engine](/docs/policies).

- `fieldsOf({ access: "write" })` also gets `action: "create" | "update"`, so an engine can lock a field on update and still let a create write it. An engine that ignores it keeps working.
- An engine can read a relation's `references` from the discovery model or `framework.contracts.core` and ask one `exists` about the row a create points at. The served Contracts never carry `references`.
- `policy.principal` may be `async`. A rejected promise answers `A3000`, as a throw does.
- A cursor on a row the caller cannot read now answers as a cursor on a missing row. On the Prisma adapter a scoped cursor costs one extra lookup.
- A unique update with a nested write on a row the caller can read but not change answers `A4002`. It answered `A2003` before; a row the caller cannot read still does.
- The `exists` questions an engine is asked select the Resource's primary identifier, never another unique field such as a governed `email`.

## From 1.0.0-rc.3 to 1.0.0-rc.4

This step adds a build step, `aventara-build`, and reshapes the scaffold's configuration so it can run without a database client. It also adds the [policy seam](/docs/policies), which does nothing until you configure `policy`. Without `policy`, the Contracts and their hashes are the ones rc.3 produced, so a client generated against rc.3 keeps working.

### 1. Install the new versions

```bash
npm install --save-exact @aventara/core@1.0.0-rc.4 @aventara/nest@1.0.0-rc.4 @aventara/prisma7-adapter@1.0.0-rc.4
npm install --save-dev --save-exact @aventara/build@1.0.0-rc.4
# add @aventara/mcp@1.0.0-rc.4 and @aventara/testing@1.0.0-rc.4 to the first command if you use them
```

`@aventara/build` is a new package, a dev dependency, and its version must match `@aventara/core`'s. It needs `typescript` `>=5.7.0 <7`. Move the frontend's `@aventara/client` to the same version, and run `npx @aventara/cli@1.0.0-rc.4 skill` to refresh the agent skill.

### 2. Add `aventara-build` to `aventara:prepare`

The discovery artifact now imports the computed fields from `computed-fields.generated.ts`, a file `aventara-build` writes. A project that passes `--config` to the generate step (every project made by rc.2 or rc.3's `aventara`) must run `aventara-build` after it, or the artifact imports a file that does not exist. In `package.json`:

```json
"aventara:prepare": "aventara-prisma7-generate --schema prisma/schema.prisma --client src/generated/prisma --provider sqlite --driver @prisma/adapter-better-sqlite3 --out src/generated/aventara/discovery.artifact.ts --config src/aventara.config.ts && aventara-build"
```

The generate step no longer reads your configuration. `--config` only names the file whose sibling the artifact imports from.

### 3. Make the configuration a plain value

`aventara-build` runs `src/aventara.config.ts` and `src/aventara.adapter.ts` without a database client, so the configuration cannot build the adapter. Move the adapter out. Before:

```ts
// src/aventara.config.ts
export async function aventaraConfig(prisma: PrismaService) {
  return {
    api: "/api",
    exposed: true,
    adapter: await createPrismaAdapter({
      client: prisma,
      discovery,
      provider: "sqlite",
      driver: "@prisma/adapter-better-sqlite3",
    }),
  } as const;
}
```

After, in three files:

```ts
// src/aventara.config.ts
export const aventaraConfig = {
  api: "/api",
  exposed: true,
} as const;
```

```ts
// src/aventara.adapter.ts
import { describePrismaAdapter } from "@aventara/prisma7-adapter";
import { discovery } from "./generated/aventara/discovery.artifact.js";

export default describePrismaAdapter({
  discovery,
  provider: "sqlite",
  driver: "@prisma/adapter-better-sqlite3",
});
```

```ts
// src/app.module.ts
AventaraModule.forRootAsync({
  imports: [PrismaModule],
  inject: [PrismaService],
  useFactory: async (prisma: PrismaService) => ({
    config: {
      ...aventaraConfig,
      adapter: await createPrismaAdapter({ ...adapter, client: prisma }),
    },
  }),
}),
```

`import adapter from "./aventara.adapter.js"` goes at the top of `app.module.ts`. Wherever else you called `aventaraConfig(prisma)` (a `buildFramework`, a custom host, a script), spread `aventaraConfig` and add the adapter the same way. The Nest server still compiles its Contracts at startup, so it passes no `prebuilt`. Keep the configuration's top level free of side effects: `aventara-build` runs it.

### 4. Let the build gather your Resources (optional)

If your Resources are `defineResource` results in `src/resources/<name>.resource.ts`, delete the hand-written spreads and take the generated tree: `resources: aventaraResources.root`, and `client: { resources: aventaraResources.client }` where some Resource has a client block ([Configuration](/docs/configuration#the-generated-resource-tree)). Two files that define the same Resource now stop the build; spread by hand, the later one silently won.

### 5. Run it

```bash
npm run aventara:prepare      # pnpm: pnpm run aventara:prepare
```

It writes `resources.generated.ts`, `computed-fields.generated.ts` and `contracts.generated.ts` beside the discovery artifact, in `src/generated/aventara/`, which `.gitignore` already covers. Serverless and edge entries can pass the last one as `prebuilt` ([Deploying](/docs/deploying#build-time-contracts)); add `npx aventara-build --check` to CI.

### 6. What else changed

- `select` takes `"$defaults"` as an entry: `select: ["$defaults", "email"]` is the default projection plus `email` ([Querying](/docs/querying)).
- A service method can return `framework.application.Post.find.many` (or any other façade node) without a return type, and the declaration file writes a short reference instead of the whole Contract view ([Server-side usage](/docs/server-side-usage)). An annotation you wrote keeps working.
- `readConfigComputedFields`, `AvPrismaConfigReaderError` and `ConfigComputedFieldsReading` are gone from `@aventara/prisma7-adapter/generate`. Only code that imported them from there is affected.
- `A4002` now also answers a refusal by a configured policy. A project with no `policy` sees no change.
- With a `policy`, `A2003` also answers a unique read of a row outside the caller's read scope and a single-row update or delete of a row the caller cannot read: the caller cannot tell it from a row that does not exist. A row the caller can read but not change answers `A4002`. A project with no `policy` sees no change.

## From 1.0.0-rc.2 to 1.0.0-rc.3

Fixes only: no configuration key moves, nothing is renamed, and the contract's hash does not change, so a client generated against rc.2 keeps working. A few answers change, and code that matched the old ones needs a look.

### 1. Install the new versions

```bash
npm install --save-exact @aventara/core@1.0.0-rc.3 @aventara/nest@1.0.0-rc.3 @aventara/prisma7-adapter@1.0.0-rc.3
# add @aventara/mcp@1.0.0-rc.3 and @aventara/testing@1.0.0-rc.3 to the same command if you use them
npm run aventara:prepare      # pnpm: pnpm run aventara:prepare
npx @aventara/cli@1.0.0-rc.3 skill
```

If you use `@aventara/mcp` or `@aventara/testing`, put them in the same `npm install` command: `@aventara/nest` asks for the matching `@aventara/mcp`, so installing them one after the other fails with `ERESOLVE`. Move the frontend's `@aventara/client` to `1.0.0-rc.3` as well. `aventara skill` refreshes the agent skill's error reference, which describes `A2004`, `V1001` and `V1004` as rc.3 answers them.

### 2. Empty `NOT`, `AND` and `OR` in a write's `where`

In `update.many`, `update.count`, `update.first`, `delete.count`, `delete.first` and a to-many `$update` or `$delete`, an empty boolean node is now refused with `422` `A2004` and a `V1001` issue at the node, and nothing runs. That covers `NOT: {}`, `AND: {}`, `AND: []`, `OR: []` and an `AND` or `OR` entry that is `{}`, at any depth. In rc.2 the ORM read such a node as no condition, so `delete.count({ where: { NOT: {} } })` deleted every row.

Look for `where` objects you build from optional parts, such as `{ AND: filters }` where `filters` may be empty. Leave the key out when there is nothing to put in it:

```ts
const filters: { published: boolean }[] = []; // conditions collected from the request
const where = filters.length > 0 ? { AND: filters } : {};
```

A `where` that is `{}` itself still means every row, so write that when every row is what you mean. Reads are unchanged and still accept empty nodes, and a to-one relation's `{ author: {} }` still matches the rows that have a related row. See [Filtering](/docs/filtering-sorting-paging#and-or-not).

### 3. A unique value too long for its index

On PostgreSQL, a `@unique` value too long for its index is now answered `422` `A2004` with one `V1004` issue at `["arguments"]`; in rc.2 it was `500` `A3001`. If your error handling matched `A3001` to catch this case, match `A2004` with a `V1004` issue instead, the same answer a value too long for its column already gave. The message for a value too long now reads `The database refused this value: it is longer than the database can hold for its column.`; update any test that compared the old text.

### 4. Issue paths inside a directive's array

An issue inside one entry of a to-many directive's array now names the entry's index: `["arguments","data","posts","$update",1,"data","category"]`, where rc.2 gave `["arguments","data","posts","$update","data","category"]`. This holds for `$create`, `$connect`, `$connectOrCreate`, `$update`, `$delete`, `$upsert`, `$set` and `$disconnect`. Code that matches issue paths, for example to show an error next to a form row, should expect the number after the directive. A directive given one object rather than an array keeps its issue at the directive.

### 5. `--provider` must match the datasource

`aventara-prisma7-generate` now compares `--provider` with the `provider` in the schema's `datasource` block and refuses a mismatch before `prisma generate` runs, so neither the Prisma client nor the artifact is written:

```text
aventara-prisma7-generate: --provider postgresql contradicts the schema's datasource `db` (/home/you/app/prisma/schema.prisma:6), which names provider "sqlite"; pass --provider sqlite.
```

If `aventara:prepare` fails this way after the upgrade, set `--provider` in the script in `package.json` to the provider the schema names (PSL's `postgres` counts as `postgresql`). In rc.2 a wrong flag was accepted and wrote the wrong provider into the artifact and the wrong filter modes into the contract.

### 6. A computed value for a hidden field

When a `compute.create` or `compute.update` stage writes to a field the caller's layer hides, the value is now judged by the field's validators and Json shape as the server defines them, and a refusal answers `500` `A3000`, with an `AvComputedValueError` in your `diagnostics` sink and nothing of the hidden field in the answer. In rc.2 a hidden field's own validators answered the caller `422` `A2004` at the hidden field's path, and a hidden Json field's shape was not checked. A layer that shows the field still answers `A2004` at it. If a client handled that `A2004`, the fix is now on the server: make the compute stage return a value the field accepts. See [Field validators](/docs/field-validators#where-they-run).

## From 1.0.0-rc.1 to 1.0.0-rc.2

A smaller step: no configuration key moves and nothing is renamed. The contract's hash does change once you rerun `aventara:prepare`: each filterable field now lists the filter modes it offers (`filterModes`, and `pathFilterModes` on a `Json` field with path filters). A client generated against rc.1 is then refused as stale, so deploy the server and regenerate your clients together (steps 1 and 3d).

### 1. Install the new versions and regenerate the artifact

```bash
npm install --save-exact @aventara/core@1.0.0-rc.2 @aventara/nest@1.0.0-rc.2 @aventara/prisma7-adapter@1.0.0-rc.2
# add @aventara/mcp@1.0.0-rc.2 and @aventara/testing@1.0.0-rc.2 to the same command if you use them
npm run aventara:prepare      # pnpm: pnpm run aventara:prepare
```

If you use `@aventara/mcp` or `@aventara/testing`, put them in the same `npm install` command, or npm refuses with `ERESOLVE`. Move the frontend's `@aventara/client` to `1.0.0-rc.2` as well.

### 2. Smaller declarations

The discovery artifact now exports the model's type by name, `AvModel` (`typeof model` is that type). A project that emits declarations, as Nest does, writes that name instead of the whole model: the declaration of the scaffold's `aventaraConfig()` drops from about 485 KB to under 1 KB over 50 models, and a `buildFramework` / `AppFramework` module from about 930 KB to under 1 KB. You get it once `aventara:prepare` has regenerated the artifact, which the build and start scripts also do. Your code does not change; you may write `AvModel` where you wrote `typeof model`.

### 3. Typed stage arguments before compute

At a variant, a guard's `ctx.$args`, a pipe's `args` and a filter's `ctx.$args` no longer type the fields your configuration computes on create as present, because write compute runs after them and fills them. If `slug` has a `compute.create`, `args.data.slug` is `string | undefined` in those stages, and a pipe may return a create without it. Code that read such a field as a plain `string` now needs a check (`if (args.data.slug !== undefined)`) or a default. Every other required field is still required. Hooks and interceptors run after compute and still see every required field. See [Pipeline context](/docs/pipeline-context#typed-arguments).

The generated types learn which fields are computed from your configuration. A project created by `aventara` 1.0.0-rc.2 passes it to the generate step already. In a project set up before, add `--config src/aventara.config.ts` to the `aventara:prepare` script in `package.json`:

```json
"aventara:prepare": "aventara-prisma7-generate --schema prisma/schema.prisma --client src/generated/prisma --provider sqlite --driver @prisma/adapter-better-sqlite3 --out src/generated/aventara/discovery.artifact.ts --config src/aventara.config.ts"
```

Without it, those stages may leave any create field out. When you change a compute stage, run `aventara:prepare` again; until you do, the server prints a warning at startup, `generated types are stale: run aventara:prepare`, naming each field that differs. The warning changes nothing at runtime.

### 3a. A missing required field is refused before your stages

A create missing a required field is now refused by the framework's own validation (`A2004`, `V1000` at the field), before the first guard runs, where it was refused after the pipes and compute. Two things follow. Your guards and pipes always see a create that holds every required field except those a `compute.create` fills, which is what their types say. And a pipe can no longer fill a required field the caller left out: if one of yours did, give that field a `compute.create` stage or a database default instead. This holds for nested creates, an upsert's `create` branch and each step of a transaction, which is checked before the transaction opens (a `$ref` counts as a value). The required fields are already listed in the client contract, so callers learn nothing new from the earlier answer.

### 3b. A compute that returns `undefined` for a required field

A `compute.create` stage that returns `undefined` for a field the database requires (not nullable, no default), when the caller did not send it, now fails with `A3000`, and your `diagnostics` sink gets an `AvComputedValueError`: `compute.create on Post.slug returned undefined for a required field`. Before, the create reached the database without the field and its refusal answered `A3001`. Return a value from such a stage in every case, or keep the caller's value with `value ?? …`. See [Computed fields](/docs/computed-fields#what-to-know).

### 3c. `undefined` in data and in filters

- Write data: a field set to `undefined` now counts as not sent, the same as leaving it out. An optional field is omitted, an update leaves the field untouched, and a required create field is missing (`A2004`, `V1000`). A pipe may return a field as `undefined` to drop it. Before, these calls were refused with `V1001`.
- Filters: regenerate the frontend client (`avclient generate`). The new client refuses `undefined` in a `where`, a unique selector or a cursor, and a `where`, `cursor`, `limit` or `offset` key set to `undefined`, with `AvValidationError` `A2004` / `V1001`, before sending. An older client sends JSON without the value, so `where: { id: undefined }` matches every row. Server-side calls already refuse it. Look for filters built from values that may be missing (`where: { id: user?.id }`) and handle the missing case before the call. See [Filtering](/docs/filtering-sorting-paging#undefined-in-a-filter).

### 3d. Filter `mode` and operand types

A filter's `mode` now takes `"default"`, `"sensitive"` or `"insensitive"`, and each field offers only the modes its database can honor (`filterModes` in the contract). With Prisma 7 on PostgreSQL nothing you wrote changes; on SQLite, a `mode: "insensitive"` on a `Json` field, which reached the ORM and was ignored before, is now refused with `A2004` / `V1006` (on a string field rc.1 already refused it; only the message changed). Wrong-typed operands (`isEmpty: 3`, `path: "a.b"`) are refused with `V1001`. Run `aventara:prepare` and regenerate the client so the types list each field's modes. See [Filtering](/docs/filtering-sorting-paging#case-mode).

### 3e. `not`, `mode` and `path` in filters

- `not` holding operators now negates the whole object, on every database. In rc.1 the Prisma adapter got three cases wrong: a `Json` field's `not` with operators matched every row (writes included), a `not` with two operators (`not: { gt: 2, lte: 5 }`) matched none, and `mode` inside `not` answered `500`. Check filters of these shapes; they now return what they say.
- Each filter object stands alone. Rewrite `{ mode: "insensitive", not: { contains: "x" } }` as `{ not: { contains: "x", mode: "insensitive" } }`, and move a `path` next to a `not` inside it. A bare `{ mode }` or `{ path }` is refused with `V1001`.
- Run `aventara:prepare` and regenerate the client: the contract carries the new filter lists.
- A value the database refuses (out of range, a NUL character in PostgreSQL text, too long for its column) is answered `422` `A2004` with the database's reason; in rc.1 it was `500` `A3001`.
- A relation write inside the `data` of a to-many nested `$update` is answered `422` `A2004` / `V1006`; in rc.1 it was `500` `A3001`. Its `data` takes what `update.many`'s does.
- A step that meets an expired or closed transaction answers `500` `A3002`; in rc.1 it was `500` `A3001`.
- A nested write that writes back along the relation it sits in (`author` or `authorId` in a `Post` created in `User.posts`) is refused before the database with `422` `A2004` / `V1012`; in rc.1 it was `500` `A3001`. Relation fields in the contract now name their other end (`inverse`) and their reference fields (`referenceFields`), so the contract hash changes: run `aventara:prepare` and regenerate the client.
- A `compute.read` that writes into its `record` answers `A3000`; the record is the stage's own frozen copy.
- A computed value is checked against every `format` its field declares (`email`, `url`, ...), not only `uuid`; one that breaks it answers `A3000`. A relative path computed into a `format: "url"` field now fails: compute an absolute URL or drop the `format`.

### 4. MCP

- A request with no bearer token (no `Authorization` header, or another scheme such as `Basic`) now gets `WWW-Authenticate: Bearer resource_metadata="..."` with no `error` code, and a body that no longer says "Missing Authorization header". A bad bearer token still gets `error="invalid_token"`. A client that keyed on `invalid_token` for a missing token should read the `401` status instead.
- A `verify` that throws is still `401`, and is now also reported to your `diagnostics` sink as a diagnostic of `kind: "mcp"`.
- With `mcp` set and `@aventara/mcp` missing, the startup error prints the install command pinned to your `@aventara/core` version. See [MCP](/docs/mcp).

### 5. Computed values meet the validators

A `compute.create` or `compute.update` value is now judged by the field's validators, as the caller's input is, at the top level, in nested writes and in both branches of an upsert. A computed value a validator refuses used to be written; now the caller gets `A2004` at the field, like any refusal. A computed value of the wrong type or format still answers `A3000`, and your `diagnostics` sink receives an `AvComputedValueError`. Check that your compute stages return values your own validators accept. `compute.read` values are not judged. See [Field validators](/docs/field-validators#where-they-run).

### 6. A clearer type error for a widening overlay

A `client` (or `agent`) layer under `exposed: false` that names what its parent hid was already a type error. When the configuration comes from a function, the error now ends with a sentence such as `Error: client cannot expose 'User.internalNotes': hidden by root` instead of `not assignable to type 'never'`. A list written inline in `createFramework` still read `Type 'string' is not assignable to type 'never'` in rc.2; from rc.3 it names the sentence too, and both forms end at a line such as `Property '"Error: client cannot expose 'User.internalNotes': hidden by root"' is missing in type 'readonly ["select"]'`. See [Exposure](/docs/exposure#layers-overlays-only-narrow).

### 7. TypeScript 5.7 or later

The server and the client generator now need TypeScript 5.7 or later (below 7 on the server). Under 5.5 and 5.6 a variant's stages written inline in `createFramework` do not type their arguments. Upgrade `typescript` before upgrading Aventara.

### 8. The agent skill

rc.2 adds an agent skill for AI coding agents (`.claude/skills/aventara/` and a section in `AGENTS.md`). A project set up before gets it by running `npx @aventara/cli@1.0.0-rc.2 skill` in the project; run it again after each upgrade. See [AI agents](/docs/ai-agents).

## From 1.0.0-rc.0 to 1.0.0-rc.1

The configuration has a new shape, public type names take an `Av` prefix, and a stage's `ctx` members start with `$`. TypeScript flags each old key, and the startup error names the new place, so between the two you are walked through most of it. The client contract's hash changes for every application (the contract now lists `maxJsonDepth` under `limits`), so every generated client must be regenerated.

### 1. Install the new versions

```bash
npm install --save-exact @aventara/core@1.0.0-rc.1 @aventara/nest@1.0.0-rc.1 @aventara/prisma7-adapter@1.0.0-rc.1
npm run aventara:prepare      # pnpm: pnpm run aventara:prepare
# in the frontend:
npm install --save-dev --save-exact @aventara/client@1.0.0-rc.1
```

Run `aventara:prepare` right after the install: the discovery artifact imports a type that was renamed (`AdapterModel` is now `AvAdapterModel`), so the build fails until it is regenerated. If you use `@aventara/testing`, move it to `1.0.0-rc.1` as well.

### 2. Move the configuration

The mount path's key is `api` (it was `entrypoint`), and the framework reads it back as `framework.api`. Every layer (the root, `application`, `client`) now holds the same six keys: `exposed`, `exemptions`, `transactionsStyle`, `limits`, `pipelines` and `resources`. Everything about one Resource lives under `resources.<Resource>`.

| rc.0 | rc.1 |
|---|---|
| `restrictions` | `exposed` + `exemptions` ([below](#restrictions-become-exemptions)) |
| `fields: { Post: { url: { type, nullable, ... } } }` | `resources: { Post: { fields: { url: { definition: { type, nullable, ... } } } } }` |
| `behaviors: { Post: { fields: { slug: { create, update, read } } } }` | `resources: { Post: { fields: { slug: { pipelines: { compute: { create, update, read } } } } } }` |
| `entrypoint: "/api"` (the mount path) | `api: "/api"`; the generated client and `framework.client.ts` keep their `entrypoint` (the server's URL) |
| `transactions: "none" \| "interactive"` | `transactionsStyle: "none" \| "interactive"` |
| `import { AvZ } from "@aventara/core/json"` | `import { AvZ } from "@aventara/core/avz"` (the same `AvZ`) |
| `defineFields(adapter.model, { ... })` | gone: put each `definition` in `resources`, or use `defineResource<Model>()("Post", { ... })`, which returns `{ root, application?, client? }` to spread as `resources: { ...post.root }` |
| a field definition in `application` or `client` | refused: define the field at the root, hide it in the overlay that must not see it |
| a behavior stage set to `false` in an overlay | gone: compute stages chain (root first, then the overlay's with the root's result as `value`) and cannot be turned off from below |

Before:

```ts
createFramework({
  entrypoint: "/api",
  adapter,
  transactions: "interactive",
  fields: {
    Post: { url: { type: { scalar: "string" }, nullable: false, list: false, lifecycle: ["VIRTUAL"] } },
  },
  behaviors: {
    Post: { fields: { url: { read: { dependsOn: ["slug"], compute: ({ record }) => `/p/${record.slug}` } } } },
  },
});
```

After:

```ts
createFramework({
  api: "/api",
  adapter,
  transactionsStyle: "interactive",
  resources: {
    Post: {
      fields: {
        url: {
          definition: { type: { scalar: "string" }, nullable: false, list: false, lifecycle: ["VIRTUAL"] },
          pipelines: { compute: { read: { dependsOn: ["slug"], compute: ({ record }) => `/p/${record.slug}` } } },
        },
      },
    },
  },
});
```

A compute stage's input is now `{ field, value, data, ctx }` (`{ field, value, record, ctx }` on read). rc.0's `origin`, `resource` and `operation` members are gone: read `ctx.$origin` and `ctx.$operation`, and the stage's placement tells you the Resource. On a field the adapter discovered, you may restate its own `type`, `nullable` and `list`; a different type, a `format` or `capabilities` there is refused.

Each old key is a `CONFIG_MOVED_PROPERTY` at startup. `createFramework` (or `AventaraModule`) throws an `AvConstructionError` whose `stage` says which step failed and whose `diagnostics` list every problem found there, each with a `code`, a `path` and a `message`:

```ts
// error.name === "AvConstructionError"
// error.message === "Aventara framework configuration validation failed: CONFIG_MOVED_PROPERTY at restrictions: restrictions moved in rc.1: use exposed + exemptions (+1 more)"
{
  stage: "configuration",
  diagnostics: [
    { code: "CONFIG_MOVED_PROPERTY", path: "restrictions", message: "restrictions moved in rc.1: use exposed + exemptions" },
    {
      code: "CONFIG_MOVED_PROPERTY",
      path: "behaviors",
      message: "behaviors moved in rc.1: use resources.<Resource>.fields.<field>.pipelines.compute",
    },
  ],
}
```

The rest of these docs abbreviate a diagnostic to one line, `stage  code  path: message`:

```text
configuration  CONFIG_MOVED_PROPERTY  restrictions: restrictions moved in rc.1: use exposed + exemptions
configuration  CONFIG_MOVED_PROPERTY  behaviors: behaviors moved in rc.1: use resources.<Resource>.fields.<field>.pipelines.compute
```

#### `restrictions` become `exemptions`

Under `exposed: true` (the root's default), an exemption names what to hide:

| rc.0 `restrictions` | rc.1 `exemptions` (under `exposed: true`) |
|---|---|
| `User: { hidden: true }` | `resources: { User: true }` |
| `User: { fields: { passwordHash: { hidden: true } } }` | `resources: { User: { fields: { passwordHash: true } } }` |
| `passwordHash: { capabilities: { select: false, filter: false, order: false } }` | `passwordHash: ["select", "filter", "order"]` |
| `email: { capabilities: { filter: ["equals"] } }` (keep only `equals`) | `email: { filter: ["not", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith"] }` (every other operator the field offers; on PostgreSQL add `"mode"`) |
| `operations: { delete: { first: false, unique: false, count: false } }` | `operations: { delete: true }` or `operations: { delete: ["first", "unique", "count"] }` |
| `client: { restrictions: { ... } }` | `client: { exposed: true, exemptions: { resources: { ... } } }` |

Before and after:

```ts
// rc.0
restrictions: {
  User: { fields: { passwordHash: { hidden: true }, email: { capabilities: { filter: ["equals"] } } } },
},
client: {
  restrictions: { AuditLog: { hidden: true }, Post: { operations: { delete: { count: false } } } },
},

// rc.1
exemptions: {
  resources: {
    User: {
      fields: {
        passwordHash: true,
        // every operator except `equals`; on PostgreSQL also "mode"
        email: { filter: ["not", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith"] },
      },
    },
  },
},
client: {
  exposed: true,
  exemptions: { resources: { AuditLog: true, Post: { operations: { delete: ["count"] } } } },
},
```

To keep only `equals`, exempt every other operator the field offers. A Prisma string field offers the ten above plus `mode` (on every database since rc.2), so the list names `"mode"` too. Name the exact operators your adapter offers for that field (the client contract lists them); naming one it does not offer is a startup error. Three rules are new:

- A list always means "exempt these". rc.0's `filter: ["equals"]` meant "keep only `equals`".
- An overlay only narrows. rc.0's `hidden: false` in an overlay brought back what the root hid; that is now refused, with a message that names the other overlay. Expose the entry at the root and hide it in the overlay that must not see it.
- An overlay that sets `exemptions` must set its own `exposed`.

Where a relation may be projected or written (rc.0's `scopes` and position lists) is now the adapter's fact and cannot be narrowed. A unique operation left without an identifier used to disappear quietly; it is now refused (`COMPILER_MISSING_IDENTIFIER`): hide the operation too. See [Exposure](/docs/exposure).

### 3. Rename the `ctx` members

Every framework member of a stage's `ctx` starts with `$`. The rest of `ctx` is your Resources ([The pipeline context](/docs/pipeline-context)). The old names are gone with no alias: reading one is a type error, and `undefined` at runtime.

| rc.0 | rc.1 |
|---|---|
| `ctx.resource`, `ctx.family`, `ctx.variant`, `ctx.nested` | `ctx.$operation.resource`, `.family`, `.variant`, `.nested` |
| `ctx.args` | `ctx.$args` |
| `ctx.origin` | `ctx.$origin` |
| `ctx.requestId` | `ctx.$requestId` |
| `ctx.transport` | `ctx.$transport` |
| `ctx.contract` | `ctx.$contract` |

A model whose name starts with `$` is now refused at startup (`COMPILER_RESERVED_RESOURCE_NAME`).

### 4. Rename the types

Every public type and class is `Av` plus what it is. There are no aliases. The ones most projects import:

| Package | rc.0 | rc.1 |
|---|---|---|
| `@aventara/core` | `FrameworkError` | `AvError` |
| | `FrameworkConfig` | `AvConfig` |
| | `Framework` | `AvFramework` |
| | `Guard`, `Pipe`, `BeforeHook`, `AfterHook`, `Interceptor`, `Filter` | `AvGuard`, `AvPipe`, `AvBeforeHook`, `AvAfterHook`, `AvInterceptor`, `AvFilter` |
| | `PipelineContext` | `AvContext` |
| | `ComputeContext` | `AvComputeContext` (a compute stage's read-only `ctx`) |
| | `ComputedRead`, `ComputeOnCreate`, `ComputeOnUpdate` | `AvComputeRead`, `AvComputeCreate`, `AvComputeUpdate` |
| | `FrameworkConstructionError` | `AvConstructionError` |
| | `FrameworkDiagnostic`, `FrameworkMisuseEvent` | `AvDiagnostic`, `AvMisuseEvent` |
| | `Decimal` | `AvDecimal` |
| | `Contract`, `CoreContract`, `ApplicationContract`, `ClientContract` | `AvContract`, `AvContractCore`, `AvContractApplication`, `AvContractClient` |
| | `ExecutionOptions`, `Operation`, `ValidationIssue` | `AvExecutionOptions`, `AvOperation`, `AvValidationIssue` |
| | `defineFields` | removed; `defineResource` |
| generated client (`AvClient.ts`) | `FrameworkError` | `AvError` |
| | `ValidationError`, `NotFoundError`, `ConflictError`, `AuthError` | `AvValidationError`, `AvNotFoundError`, `AvConflictError`, `AvAuthError` |
| | `ContractMismatchError`, `InternalError`, `ProtocolError`, `TransportError` | `AvContractMismatchError`, `AvInternalError`, `AvProtocolError`, `AvTransportError` |
| | `CallOptions`, `Fetch`, `Cause`, `Decimal`, `Operation<T>` | `AvCallOptions`, `AvFetch`, `AvCause`, `AvDecimal`, `AvOperation<T>` |
| | `OperationCode`, `ValidationCode`, `ValidationIssue` | `AvOperationCode`, `AvValidationCode`, `AvValidationIssue` |
| `@aventara/client` (`framework.client.ts`) | `ClientConfigInput`, `ConfigValue`, `EnvReference` | `AvClientConfigInput`, `AvClientConfigValue`, `AvEnvReference` |
| `@aventara/testing` | `FakeAdapter`, `FakeAdapterOptions`, ... | `AvFakeAdapter`, `AvFakeAdapterOptions`, ... |
| `@aventara/prisma7-adapter` | `PrismaAdapterOptions`, `PrismaDiscoveryArtifact`, ... | `AvPrismaAdapterOptions`, `AvPrismaDiscoveryArtifact`, ... |

Functions keep their names (`createFramework`, `createPrismaAdapter`, `createFakeAdapter`, `defineClientConfig`, `env`), and so do `AventaraModule` and its option types. Error classes a log may name changed too (`AvComputedValueError`, `AvOutputValidationError`, `AvPipeOutputError`, `AvUnmountedRouteError`, ...). The complete list is in each package's `CHANGELOG.md`. In the generated client, an enum whose name now collides with one of these is renamed (`AvDecimal` becomes `AvDecimalEnum`); an enum named `Decimal` keeps its name.

### 5. Check your hooks and pipes

The stages run in one order: guards, pipes, validators, interceptors, `before` hooks, the operation, `after` hooks, then the interceptors unwind. Every interceptor now wraps every hook: in rc.0 every `before` hook ran ahead of every interceptor and every `after` hook after them, and the overlay's `after` hooks ran after the root's (now before). A hook that relied on that order needs a look ([Pipelines](/docs/pipelines#order)).

Field pipes and validators now run after the guards and the operation's pipes. A guard sees a value as the caller sent it, not trimmed by a field pipe. In a transaction, a step's guards and pipes run before the transaction opens, so a `ctx` call they make no longer joins it.

Pipes return new arguments. The arguments every stage gets are frozen, so a pipe that changed `args` in place and returned `undefined`, or a hook that changed `ctx.$args`, now throws a `TypeError` (answered `A3000`). Return a new object from a pipe instead:

```ts
// rc.0
pipes: [(args) => { (args as any).where.tenantId = tenant; }],
// rc.1
pipes: [(args) => ({ ...(args as object), where: { ...(args as { where: object }).where, tenantId: tenant } })],
```

A guard that read the signed-in user from somewhere else can now read `ctx.$state.user`, seeded by `AventaraModule`'s `state` option ([The pipeline context](/docs/pipeline-context#request-state)).

Nested writes now run the target Resource's own guards and field stages: a client `Post.create` with a nested `category: { $create }` is refused when `Category`'s create guard refuses it. If a guard of yours did not expect nested calls, `ctx.$operation.nested` is `true` for them.

### 6. Server-side calls return data and throw

`framework.application`, `framework.client` and `framework.transaction` now settle like the generated client: they resolve the data and throw every failure as an `AvError` subclass, exported from `@aventara/core`. Code that read the envelope reads the result directly:

```ts
// rc.0
const res = await framework.application.Post.find.unique({ where: { id }, select: ["id", "title"] });
if (res.code !== "A1000") return null;
return res.data;

// rc.1
try {
  return await framework.application.Post.find.unique({ where: { id }, select: ["id", "title"] });
} catch (error) {
  if (error instanceof AvNotFoundError) return null;   // A2003
  throw error;
}
```

A committed `framework.transaction([...])` resolves its steps' results in order (`const [user, post] = await framework.transaction([...])`); a failed one throws with `cause.operation`. `error.code` and `error.cause` are what the envelope carried. `framework.execute` and `framework.executeTransaction` are unchanged and still answer the envelope. A stage's `ctx` calls throw the same subclasses ([Server-side usage](/docs/server-side-usage#errors)).

### 6b. Send every required create field

Create calls are now typed by the contract's `createRequirements`. After regenerating the Prisma artifact (`npm run aventara:prepare`, which writes format 3) and the frontend client, a create that leaves out a required field, or writes a required relation neither way or both ways (`author` and `authorId`), no longer compiles. Fix each call by sending the field, or choose one way to write the relation. If a pipe fills a required field on the server, move it to a [`compute.create`](/docs/computed-fields) stage (or give the column a default) so callers may omit it. This matters most for a field you hid from a layer and filled with a pipe (a `tenantId`, an `ownerId`): while that layer can still create the Resource, startup now refuses the hidden field (`COMPILER_HIDDEN_REQUIRED_FIELD`) until a `compute.create` stage fills it or the layer's create operations are exempted. A layer that hides only `authorId` but keeps `create.many` or `create.count` is refused too, since a bulk record cannot write `author`: exempt those two variants there (`operations: { create: ["many", "count"] }`). See [Relations and nested writes](/docs/relations-and-nested-writes#required-relations-and-fields).

### 7. Regenerate the frontend client

```bash
npm run avclient:generate     # in the frontend
```

Then rename the imports from `AvClient.ts` (step 4). Until it is regenerated, an old client is answered `A2005` on every call. The regenerated client also types filter operators per field (an operator a field does not offer is a compile error) and runs [field validators](/docs/field-validators) before it sends.

### 8. Behaviour changes to know about

| What | rc.0 | rc.1 |
|---|---|---|
| `$connect` to a record that does not exist | `422 A2004` | `404 A2003`, same message (`The operation's arguments referenced a record that does not exist.`) |
| The same on `update.first` | `A2014` | `A2003`; a duplicate unique value through `update.first` is `409 A2008` (was `A3001`) |
| `cause.message` of `A2001` / `A2002` | `Operation arguments failed framework validation.` | `The requested Resource is not available.` / `The requested operation is not available on this Resource.` |
| A transaction step with an operation outside the grammar | `Operation is not part of the standard operation grammar.` | `Operation "dance.one" is not available on Resource "posts".`, as for a single call |
| A `$ref` with no `fingerprint` | `A2007` / `V1017` | `A2004` / `V1000` (a wrong fingerprint is still `V1017`) |
| A plan mixing `appTx` and `clientTx` steps | ran | refused: `A2004` / `V1020` |
| Operators inside `not` (`{ not: { contains: "a" } }`) | not checked against the field's operators | checked at every depth (`V1006`); each object `not` counts toward `maxNestingDepth` |
| A Json value nested very deeply | written, then `A3003` over HTTP | refused with `A2009` / `V1021` past `maxJsonDepth` (64) |
| Validator and Json-shape issues | `{ code, path, message }` | also `check` and `params` |
| `ctx.$sql` outside a transaction | (new in rc.1) | a plain statement: no transaction is opened around it, under any `transactionsStyle` |
| An error a transaction step throws that its own filters leave unhandled | answered | goes on to the Resource transaction filters first |
| A create missing a required field, or writing a required relation both ways | `A2004` at runtime | a type error first; the runtime answer is unchanged |
| The contract | no create requirements | each Resource's `createRequirements`; the client contract hash changes |

New things you can use: [field validators](/docs/field-validators), [stages at every level](/docs/pipelines#where-stages-go), field pipes and write guards, Resource transaction stages, `forceTransaction`, the [executor `ctx`](/docs/pipeline-context) with `ctx.$sql` and `ctx.$transaction`, and [`appTx.$sql`](/docs/transactions#sql-steps-apptxsql).

## From 0.1.0-pilot.4 to 1.0.0-rc.0

This section uses the names `1.0.0-rc.0` had (`FrameworkError`, `restrictions`, `ctx.origin`, ...). After it, continue with [From 1.0.0-rc.0 to 1.0.0-rc.1](#from-100-rc0-to-100-rc1).

One rename needs your hands, and the rest is regenerating. The steps were run on a project made by pilot.4's `aventara new` (a guard that read `scope` and a frontend generated by pilot.4's `avclient`), moved to the release candidate's packages. Nothing sent over HTTP changes.

### 1. Install the new versions

Exact versions, the three server packages together, then the frontend generator:

```bash
npm install --save-exact @aventara/core@1.0.0-rc.0 @aventara/nest@1.0.0-rc.0 @aventara/prisma7-adapter@1.0.0-rc.0
npm run aventara:prepare      # pnpm: pnpm run aventara:prepare
# in the frontend:
npm install --save-dev --save-exact @aventara/client@1.0.0-rc.0
```

`npm install <package>` does not run `postinstall` (verified with npm 11), so run `aventara:prepare` right after the install; until you do, the build stops with a type error from the old artifact.

`@aventara/core` now depends on `zod`; npm installs it for you, and only `@aventara/core/json` loads it.

### 2. Rename `scope` to `origin`

Where a request came from is now `origin` (`"application"` or `"client"`), everywhere it used to be `scope`. There is no alias:

| Where | Before | Now |
|---|---|---|
| The context a guard, pipe, hook, interceptor or filter receives | `ctx.scope` | `ctx.origin` |
| The context a computed field's behavior receives | `ctx.scope` | `ctx.origin` |
| What your `diagnostics` function receives | `d.scope` | `d.origin` |
| A request you give `framework.execute` / `framework.executeTransaction` (a custom host) | `{ scope: "client", ... }` | `{ origin: "client", ... }` |
| The type `OperationScope` (deprecated) | `OperationScope` | `RequestOrigin` |
| The Nest log line for an internal failure | `(client scope, request ...)` | `(client origin, request ...)` |

TypeScript finds every typed use. A guard written as `Pick<PipelineContext, "scope" | "family">` stops compiling (verified):

```text
src/aventara.config.ts(11,43): error TS2344: Type '"scope" | "family"' does not satisfy the constraint 'keyof PipelineContext'.
```

and a configuration that holds it is refused where it is used (`Property 'scope' is missing in type 'PipelineContext<...>'`). Replace `scope` with `origin` and the errors go. Search your code too: `grep -rn "scope" src`. A check in untyped code, or on a value typed `any`, is not caught: `ctx.scope === "client"` compiles and is simply never true, because the property is gone. If you grep your server log for `client scope`, grep for `client origin`.

### 3. Optional: drop the `Pick` workaround

Callbacks annotated with the exported `Guard`, `Pipe`, `BeforeHook`, `AfterHook`, `Interceptor` and `Filter` types now type-check in an `as const` configuration, so the structural annotation `Pick<PipelineContext, "family" | "transport">` is no longer needed. It keeps working, so this is optional cleanup:

```ts
// before
const requireSignIn = (ctx: Pick<PipelineContext, "family" | "transport">) => { /* ... */ };
// now
const requireSignIn: Guard = (ctx) => { /* ... */ };
```

An inline arrow in a function-returned `as const` configuration still needs an annotation ([Pipelines](/docs/pipelines#typing-a-stage)).

### 4. Regenerate the frontend client

```bash
npm run avclient:generate
```

The client is bound to the contract's hash, and a release can change what the contract states. This one does, for every Prisma-backed application: the Contract now carries `referenceWrites: "uniform"`, so its hash changes even for a project with a single `User` model and no relations (measured from `0.1.0-pilot.4` to `1.0.0-rc.0`). An old client is answered `A2005` until you regenerate it. A to-many relation adds a second change: the `where` of its nested `$update` and `$delete` now takes plain fields only. Regenerate the client after upgrading; the new one also gains the wider `$ref` types, the type error for a nested relation filter, and its guard against unreadable arguments ([Keeping in sync](/docs/keeping-in-sync)).

Regenerate the discovery artifact (step 1 ran it). Its format is now 2: it records, for each relation, the fields that hold its reference. An artifact from an earlier version is refused with a message that says so. Run `npm run aventara:prepare` (or `aventara-prisma7-generate`); `npm install` also runs it through `postinstall`.

Run the artifact step first, then `avclient generate` (`npm run avclient:generate`).

### 5. Behaviour changes to know about

| What | Before | Now |
|---|---|---|
| A server-side call (`framework.application`, `framework.client`, the `tx` builders, `execute`) | read your object lazily | copies it once at the door. An object you change or revoke afterwards no longer affects the call. |
| A class instance or `Map` where arguments belong, or a value that cannot be read | accepted, or `A3000`; from `appTx`/`clientTx` a `TypeError` | `422 A2004` / `V1001` at the value ([Server-side usage](/docs/server-side-usage#what-a-server-side-call-accepts)). A transaction builder never throws. |
| A literal `null` in a filter operator with no `null` meaning (`gt: null`, `contains: null`, `in: null`) | `500 A3001` | `422 A2004` / `V1001` |
| A relation filter in the `where` of a nested `$update` or `$delete` through a to-many relation | `500 A3001` | `422 A2004` / `V1006` |
| `diagnostics` | unexpected failures only | also your own `A3xxx` errors (`deliberate: true`), output-validation and computed-value failures, and an unmounted route in a custom host. A sink that pages on every report should check `deliberate` ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics#what-else-reaches-it)). |
| A reference field and its own relation in one record (`authorId` with `author: { $connect: … }`), or, on Prisma, one relation written through its field and another directly | the database refused it: `500 A3001` | `422 A2004` / `V1012` before the database is asked ([Relations and nested writes](/docs/relations-and-nested-writes#writing-relations)) |
| A malformed `framework.execute` request object | mostly `A3000`, or run as if well formed | `422 A2004`, one issue per wrong member |
| The `message` of an issue your own code throws | the standard text for its code | your text, if non-blank and at most 1,000 characters |
| `$ref` in a transaction | a value in `data` only | a value, `$connect`, `$disconnect`, `$set`, `$connectOrCreate`, a unique `where`, a `cursor`, any filter, nested writes ([Transactions with $ref](/docs/transactions-with-ref)). A `$ref` to a step that comes later is now `V1016`. |

### 6. Imports from `@aventara/core`

The main entry exports fewer names. Every name removed was undocumented; every documented name (`createFramework`, `FrameworkConfig`, `defineFields`, `Decimal`, `FrameworkError`, the pipeline types and the rest) is still exported. If your code imported something that is gone, it was reaching into internals: `@aventara/core/internal` exists for Aventara's own packages and has no stability promise, so do not move your imports there. If a name you relied on is missing, tell us what you needed it for.

### 7. If you wrote a host, a test setup or scripts

- Custom host: mount every entry of `protocol.surface()`. A route left out now produces a diagnostic ([Custom host](/docs/custom-host#a-route-the-host-left-out)).
- Testing kit: `@aventara/testing` loads from CommonJS, and gains `AvProtocolCorpus` and the corpus as JSON ([Testing and conformance](/docs/testing-and-conformance)).
- CLI output: `aventara new`, `aventara init`, `avclient init` and `avclient generate` write their steps to stderr and keep stdout for results; `aventara new` prints its next steps last, after the commit line (pilot.4 printed them before it). A script that read the old order should read the `Next:` block instead. `--verbose` is new on `aventara`. The `prebuild` and `prestart` hooks the scaffold writes are unchanged.
- Typed JSON: nothing to do unless you want it: [JSON fields](/docs/json-fields).

## From 0.1.0-pilot.3 to 0.1.0-pilot.4

Your code and the contract do not change; pilot.4 changes the discovery artifact's format and the scripts the scaffold writes. The steps follow from the release notes; this hop was not run as a separate upgrade.

Install the packages exact, then regenerate the artifact once:

```bash
npm install --save-exact @aventara/core@0.1.0-pilot.4 @aventara/nest@0.1.0-pilot.4 @aventara/prisma7-adapter@0.1.0-pilot.4
npm run aventara:prepare      # pnpm: pnpm run aventara:prepare
```

If you skip the second step, the build stops in `aventara.config.ts` with:

```text
error TS2741: Property 'regenerate_with_aventara_prepare' is missing in type ... but required in type 'PrismaDiscoveryArtifact<...>'
```

That is the symptom of an artifact from an older adapter; `aventara:prepare` fixes it ([Troubleshooting](/docs/troubleshooting#build-error-property-regenerate_with_aventara_prepare-is-missing)). At start-up the adapter also refuses an old artifact with a message that names `aventara:prepare`.

Projects made by pilot.4's `aventara new` or `aventara init` also get `prebuild`, `prestart`, `prestart:dev` and `prestart:debug` scripts, each `npm run aventara:prepare` (`pnpm run aventara:prepare` with pnpm), so building or starting regenerates the artifact first. An existing project does not get them from an upgrade; add them to `package.json` yourself if you want the same behaviour. They run under npm and pnpm; Yarn Berry, and pnpm with `enable-pre-post-scripts=false`, skip them, so run `aventara:prepare` yourself there.

The frontend client needs no regeneration for this release. Update `@aventara/client` to the same version, exact (`npm install --save-dev --save-exact @aventara/client@0.1.0-pilot.4`); its generated output differs only in the documentation comments it copies from `@aventara/core`.

## From 0.1.0-pilot.1 or pilot.2 to 0.1.0-pilot.3

For an unchanged schema and configuration, your server code does not change, and the contract the server serves keeps the same hash: a frontend client generated by pilot.1 still calls a pilot.3 server and is accepted. This was verified by creating a server and a Vite frontend with the `0.1.0-pilot.1` packages, then upgrading both to `0.1.0-pilot.3`; the old client counted users on the upgraded server before it was regenerated.

Three things need doing, though: regenerate the discovery artifact (its format changed), regenerate the frontend client (it is now written for your project's own imports), and, if the frontend runs in a browser on another origin, allow its origin on the server.

From pilot.2, the artifact and client are already in the new format, so the steps below shrink to the server's CORS lines (and re-running `avclient init`). That shorter path follows from the release notes; it was not run separately.

### What changed

| Area | Change |
|---|---|
| Discovery artifact | Its format changed: it now records the Prisma client it was generated from, and which fields a create requires. Regenerate it with `npm run aventara:prepare`. A pilot.1 artifact is refused. |
| Generated client | It is written for your project: its imports follow your `tsconfig.json` (extensionless, `.js` or `.ts`), and you import it like your own files. Next.js with Turbopack now works. Regenerate it. |
| Frontend config | `avclient init` writes `framework.client.ts` (it loads like `prisma.config`: `.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`). A pilot.1 `framework.client.mts` keeps working; you do not have to rename it. |
| Frontend `init` | It refuses a plain-JavaScript project (no `tsconfig.json`) before writing anything, type-checks with your own TypeScript, and adds `.env` to the frontend's `.gitignore`. `avclient --version` works. |
| CLI | `--orm` takes `prisma7`; `aventara new` ends with a git commit; `.env` is in the scaffold's `.gitignore`; `aventara --version`, `-v`. |
| Scaffold | `src/main.ts` enables CORS from `CORS_ORIGINS` and holds a commented-out rate limiter. |
| Errors | A create that omits a required field is `422` `A2004` / `V1000` (it was `500` `A3001`). A `BigInt` outside signed 64-bit is `V1004`. Orphaning a required child is `409` `A2008` (it was `A3001`). A pipe returning invalid arguments is `500` `A3004`. |
| Server log | Every internal failure (`A3000` to `A3004`) writes one line to Nest's log. |

### Steps: server

Use exact versions (the three packages move together), then regenerate the artifact yourself: `npm install <package>` does not run your `postinstall` script (verified with npm 11.19; a plain `npm install` does).

```bash
npm install --save-exact @aventara/core@0.1.0-pilot.3 @aventara/nest@0.1.0-pilot.3 @aventara/prisma7-adapter@0.1.0-pilot.3
npm run aventara:prepare
npm run build
npm run start:prod        # Aventara mounted 30 operations at /api (...)
```

If you skip `aventara:prepare`, the old artifact no longer fits the new adapter, and the build stops with a type error in `src/aventara.config.ts` (verified):

```text
src/aventara.config.ts:15:7 - error TS2739: Type '{ readonly prismaVersion: "7.10.0"; ... }' is missing the following properties ...
  node_modules/@aventara/prisma7-adapter/dist/prisma.adapter.d.ts:20:14
    20     readonly discovery: PrismaDiscoveryArtifact<M>;
```

Where the build does not stop, the server refuses to start with an instruction instead. Either way the fix is the same: `npm run aventara:prepare`.

To allow a browser frontend on another origin (this project was made before the scaffold did it), add the lines the new scaffold writes to `src/main.ts`, after the line that creates the application, and the variable to `.env`. `aventara init` will not do it for you: it refuses a project that already uses Aventara.

```ts
const app = await NestFactory.create(AppModule);
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false });
```

```bash
CORS_ORIGINS="http://localhost:5173,http://localhost:3001"
```

See [Deploying](/docs/deploying#cors-and-browsers) and [Rate limiting](/docs/limits-and-safety#rate-limiting).

### Steps: frontend

Pin the generator exactly. `npm install --save-dev @aventara/client@pilot` (or `@latest`) writes a caret range (`"^0.1.0-pilot.3"`), which lets the generator drift from the server; `--save-exact` keeps the pin that `avclient init` wrote (verified):

```bash
npm install --save-dev --save-exact @aventara/client@0.1.0-pilot.3
npm run avclient:generate
# avclient: regenerated 38 files into .../src/api (checked: types): ...
```

Regenerating rewrites `AvClient.ts` and `generated/` as TypeScript with imports spelled for your project. In the Vite `react-ts` project of this test, the `.js` specifiers of pilot.1 became `.ts`, `import avClient from "./api/AvClient"` stayed valid, and `tsc -b && vite build` passed. Check how your own imports of the client should read now: [Importing the client](/docs/client-setup#importing-the-client) (`./api/AvClient`, `./api/AvClient.js` under `nodenext`, `./api/AvClient.ts` where you import `.ts` files). `framework.client.mts` was used as it was.

Optionally run `npx avclient init --yes` once more: on a configured frontend it keeps your config and adds `.env` to `.gitignore` if it is not there (verified: it reported `initialized ...: .gitignore` and `up to date`).

If the frontend is a browser app on another origin, the server's `CORS_ORIGINS` must include it (above).

## From 0.1.0-pilot.0 to 0.1.0-pilot.1

This hop was verified separately against the published pilot.0 and pilot.1 packages. To reach pilot.3 from pilot.0, take this hop first (or go straight to pilot.3 with the steps above, then rename the config as below).

For an unchanged schema and configuration, nothing in your server code changes. This was verified by creating a project with `@aventara/cli@0.1.0-pilot.0`, generating a frontend client with `@aventara/client@0.1.0-pilot.0`, then upgrading both:

- the contract the upgraded server serves has the same hash as before, so the existing frontend client is still accepted (`avclient generate` answers `up to date`);
- regenerating the client with the new generator writes byte-identical files for that contract.

### What changed

| Area | Change in pilot.1 |
|---|---|
| Frontend config | `avclient init` wrote `framework.client.mts`, which loads in CommonJS and ESM projects alike. In pilot.0 the file was `framework.client.ts`, which a CommonJS project could not load (`Cannot use import statement outside a module`). From pilot.2 the loader reads `.ts` in every project again, and `init` writes `framework.client.ts`; with two config files present, generation is refused. |
| TypeScript | The frontend accepts TypeScript `>=5.5`, including 7. Under 7 the post-generate check is a syntax and shape check, with a warning. `@aventara/cli` and the Prisma adapter still need TypeScript `<7` on the server. |
| Startup | Nest logs one line: `Aventara mounted <N> operations at /api (+ GET /api/_contract, POST /api/_transactions, POST /api/_all)`. |
| Errors | A request missing identity headers answers `400 A2000` naming the missing headers (`The Aventara-Protocol-Version and Aventara-Contract-Hash headers are missing.`). |
| CLI | The next-step instructions print the right runner (`npx` or `pnpm dlx`) and `@pilot`; `--help` works on `aventara new\|init` and `avclient init\|generate`. |

### Steps

Server, in your NestJS project (use the exact version; the three packages move together):

```bash
npm install --save-exact @aventara/core@0.1.0-pilot.1 @aventara/nest@0.1.0-pilot.1 @aventara/prisma7-adapter@0.1.0-pilot.1
```

`npm install` runs your `postinstall` script, `aventara:prepare`, which rewrites the discovery artifact and the Prisma client. Then build and restart:

```bash
npm run build
npm run start:prod        # the log shows: Aventara mounted 15 operations at /api (...)
```

Frontend:

```bash
npm install --save-dev --save-exact @aventara/client@0.1.0-pilot.1
npx @aventara/client@0.1.0-pilot.1 init --yes     # renames framework.client.ts to framework.client.mts
npx avclient generate
# avclient: up to date: .../src/api already holds this deployment's client; nothing was written.
```

`init --yes` is safe to rerun on a configured frontend: it reports what it removed or replaced (here, `removed framework.client.ts, framework.client.mts`, meaning the `.ts` was replaced by the `.mts`) and then generates (`up to date` when nothing changed). If you would rather do it by hand, rename the file to `framework.client.mts`; its contents are unchanged.

If you have a CommonJS frontend that could not load `framework.client.ts` under pilot.0, the rename is the fix.

## The general upgrade flow

1. Read what changed. The [changelog](/docs/changelog) lists each release; look for entries under your packages. Each package also ships its own `CHANGELOG.md` in `node_modules/@aventara/<package>/`. A pilot release may change APIs; a release candidate changes them only to fix what testing finds.
2. Upgrade the server packages together. `@aventara/core`, `@aventara/nest` and `@aventara/prisma7-adapter` are released at the same version; install the same exact version of all three. The scaffold pins them exactly for this reason.
3. Regenerate the discovery artifact. `npm run aventara:prepare`. It runs on a plain `npm install` via `postinstall`, but not on `npm install <package>`, so run it yourself after upgrading packages by name. At startup the server checks the artifact against itself and against the installed Prisma major (read from the installed `@prisma/client`'s `package.json`; where it cannot be read, the server starts and warns `AVENTARA_PRISMA_VERSION_UNCHECKED`), and the Prisma adapter compares the models and field names recorded in the artifact with the live Prisma client. It refuses to start, with a message naming `npm run aventara:prepare`, when a model or field was added, removed or renamed since the artifact was written, or when the artifact was written by an older Aventara version. It does not detect a change that keeps every model and field name (a field's type, default or attribute changed), so regenerate after any schema change and run `aventara:prepare` in the same build as your schema and Prisma client, never from a stale checkout.
4. Rebuild and test. `npm run build`, your test suite, and a look at the startup log.
5. Deploy the server. If its contract changed, the hash changed.
6. Upgrade and regenerate the frontend. `@aventara/client` is a development dependency, pinned exactly: bump it with `--save-exact` (a plain `npm install -D @aventara/client@rc` turns the pin into a caret range), then `npm run avclient:generate`. Commit the diff: if the output is byte-identical, the contract did not change.
7. Deploy the frontend. A frontend built from an older contract is refused with `A2005` until it is regenerated ([Deploying](/docs/deploying#the-frontend-client)).

### Prisma

Aventara's Prisma adapter supports Prisma `^7.10.1` (its `peerDependencies`). A Prisma 6 or 8 project needs a different adapter package: Prisma vocabulary stays inside the adapter, and each major has its own. Upgrade Prisma itself the way Prisma documents, then `npm run aventara:prepare`.

### What changes the contract hash

Anything that changes the client contract: schema changes (a field, an enum member, a relation), exposure (`exposed`, `exemptions`) at the root or under `client`, a field `definition`, a field validator on a field the client sees, adding or removing a compute phase, `limits` and `transactionsStyle` under `client`. Server-only changes (stages, the code inside a compute stage, diagnostics, `application` overrides) do not. A package upgrade changes it only when the release changes the contract's content, which is why an unchanged schema can upgrade across releases with the same hash.

### Rolling back

Install the previous exact version of the three server packages, run `npm run aventara:prepare`, rebuild. If the schema changed in between, roll the database back with your migration tooling first. The frontend client generated against the newer contract needs the contract it was generated against: regenerate it from the rolled-back server.

## See also

- [Deploying](/docs/deploying)
- [Frontend client](/docs/keeping-in-sync)
- [CLI reference](/docs/cli-reference)
- [Troubleshooting](/docs/troubleshooting)
