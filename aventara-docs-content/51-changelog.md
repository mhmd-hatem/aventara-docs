---
title: Changelog
description: User-facing changes in each Aventara release, newest first.
order: 90
section: about
---

# Changelog

`1.0.0-rc.0` was the first release candidate, `1.0.0-rc.1` the second, `1.0.0-rc.2` the third, `1.0.0-rc.3` the fourth, `1.0.0-rc.4` the fifth, `1.0.0-rc.8` the sixth, `1.0.0-rc.9` the seventh, `1.0.0-rc.10` the eighth and `1.0.0-rc.11` is the ninth (`1.0.0-rc.5`, `1.0.0-rc.6` and `1.0.0-rc.7` were never published); the releases before them are pilots, and a pilot's API could change. A release candidate changes the API only to fix what testing finds. Pin exact versions. All `@aventara/*` packages are released together at one version. Each package also ships this history for itself as a `CHANGELOG.md` beside its README.

## 1.0.0-rc.11

The current release, published under the `rc` dist-tag (install with `@rc`). It adds Operation Sets (several calls in one request), cached `GET` reads, and a stricter `avLazy`, and it moves the docs. Every ClientContract hash changes, so regenerate your clients. Upgrading from rc.8: see [Upgrading](/docs/upgrading#from-100-rc8-to-100-rc11).

**Operation Sets**

- `POST {api}/_all` answers an Operation Set: several independent operations in one request, under keys the caller names (`{ operations: { <key>: { resource, family, variant, args } } }`). Every entry runs concurrently and exactly as it would through its own route. The answer is `200 A1000` with each key holding that entry's own envelope. With `Accept: application/x-ndjson` it answers one line per entry as each settles, with `Cache-Control: no-store`, and a client that disconnects stops the entries not yet started. The state is seeded once and the principal derived once for the whole request.
- `limits.maxAll` (default 10) bounds the entries in one set and `limits.maxAllConcurrency` (default 4) caps how many run at once, at the root and per layer. Both are part of the ClientContract's limits, so its hash moves. `AvOperationDiagnostic.key` names the entry a failure met.
- The generated client groups the calls made in one tick into one `/_all`, split at `maxAll`. A call still runs when it is made, like `fetch`; new `avLazy(() => call)` makes one only when it is first awaited. A call with `headers` or a `requestId`, a transaction, and any call made with `grouping: false` (per call, or `new AvClient({ grouping: false })`) goes alone. A server without `/_all` gets the calls one by one. A call's `signal` aborts that call only.
- `avClient.all({ ... })` awaits an object of calls: strict by default, or `{ settle: true }` for one settled entry per key. A Resource named `all` is refused at construction (`COMPILER_RESERVED_RESOURCE_NAME`); rename the model or keep it out of the Client Contract.
- On the server, `framework.serverClient.all(entries, { settle?, signal? })` is `avClient.all` in process. `avLazy` is exported from `@aventara/core`; `all` starts its `avLazy` entries itself, at most `maxAllConcurrency` at once. `serverClient` calls stay eager. See [Several operations in one round trip](/docs/operation-sets).
- `@/aventara/universal` in a Next.js app now returns the generated client's own calls, so `signal`, `avClient.all` and `avLazy` reach it. In the browser it groups as before; on the server it groups nothing, and each call is sent from the async context of the code that made it. Before, one queue served every request, so calls from two concurrent requests could share a flush and run with the first one's headers and `state`.
- `avLazy` keeps no answer across requests on a server. The generated client's keeps its answer in a page and none on a server; `@aventara/core`'s keeps none; `@/aventara/universal` exports its own, which keeps one answer per request inside a React render. Before, an `avLazy` made at module scope handed the first request's answer to every request after it.

**Cached reads**

- A `cache({ for, maxAge })` stage (from `@aventara/core`) at `pipelines.cache` of the root or client layer, a Resource, the `find` family or one `find` variant serves those reads as `GET /_resources/<R>/find/<variant>?q=<arguments>&v=<contract hash>` beside their POST. The most specific level wins. A write, a transaction, or the application or agent layer refuses it (`CONFIG_INVALID_VALUE`).
- `for` says who may share one answer: `"user"` (`Cache-Control: private`), `"anonymous"` (`public` for an anonymous caller, `private` for a signed-in one) or `"everyone"` (`public`). Write `for` every time. A `200` carries an `ETag` and `Referrer-Policy: no-referrer`, and a matching `If-None-Match` is `304`. A `q` over `limits.maxRequestBytes` is `413 A2010`, and a `v` that is not the ClientContract's hash is `409 A2005`. Every answer to a `GET`, `/_contract` included, carries `X-Content-Type-Options: nosniff`.
- The ClientContract marks each cached read, so its hash moves. The generated client sends a cached read as a `GET`, alone and never grouped; a URL over 4096 characters is `POST`ed instead. `ctx.$transport.method` is `"POST" | "GET"`. See [Caching reads](/docs/caching-reads).

**Docs and types**

- The docs moved to https://aventara.razor34.dev/framework. Every `docs` link in the error catalog, and every docs link `aventara new`, `aventara init` and `aventara skill` write, now points there.
- `@aventara/core`'s declarations name no platform global: a `signal` is typed by the members core reads, so a project with neither DOM's lib nor Node's types type-checks against it.
- The agent skill's error reference names `all` as a reserved name.

## 1.0.0-rc.10

Published under the `rc` dist-tag before rc.11. It fixes a policy bypass through nested relinks, adds the `/_access/can` route and `$access` on `serverClient`, adds `managedElsewhere`, and tightens policy and startup checks. It raises the Node and Prisma floors. Upgrading from rc.8: see [Upgrading](/docs/upgrading#from-100-rc8-to-100-rc11).

**Security**

- A nested to-one relink could bypass a policy's update scope. In rc.9 and earlier, a to-one `$update` or `$upsert` beside `$connect`, `$connectOrCreate`, `$create`, `$set` or `$disconnect` on the same relation ran the relink first and then wrote the newly linked row, while the update scope, field grants, `grantsOf` and the after check had been asked about the row linked before the call. rc.10 refuses the combination for every caller (`A2004`, one `V1012` issue at the relation) before anything runs, and the argument types reject it. To relink and update, use two writes. A to-many operand may still combine them.
- `@aventara/mcp` pins `@modelcontextprotocol/sdk` 1.32.2 and `zod` `^4.6.7`, which clears six advisories (two high in the SDK, one high in `zod`, three moderate). No MCP API changes.
- An MCP endpoint without `authorization` also requires a loopback `Host` header (`localhost`, `127.x.x.x` or `[::1]`); any other `Host`, or none, is `403`. This closes DNS rebinding.
- An access section's `url` and each verb's `path` refuse control characters, `.`/`..` segments and a bare `/`, so `"/\t/evil.example"` no longer resolves to another host.

**Runtime floors**

- `engines.node` is `^22.23.4 || >=24.22.1`, the Node security releases of 2026-10-20. The bins refuse an older Node in one sentence naming that range.
- The Prisma 7 adapter's peer floor is `^7.10.1`. `aventara new` and `aventara init` install Prisma at the floor, and `aventara init` refuses a project whose Prisma is below it.

**Access seam**

- With `access` configured, `POST {api}/_access/can` answers a page's questions about all of its buttons in one request: one boolean per question, in order. It never answers `403`; it refuses malformed input only. `AvProtocol.bind(framework).handleCan` answers it, and the host mounts it on Express and Fastify. The ClientContract carries an `access` section exactly when `access` is configured.
- `framework.serverClient.$access` exists exactly when `access` is configured: `can(questions)` in process, and `me()` and the provider's other verbs. `AvAccessProvider.client` states where Access is mounted and the verbs it offers. The generated client gets `$access`, and the MCP server a `me` tool.
- A policy engine may answer `grantsOf` and receive `before` in its after check, state typed literals in their wire form, list `unheld` Resources and take `hosted({ held })`.

**Policy and startup checks**

- Writing a reference field itself (`authorId: "u2"`) is held to the target's read scope, as `$connect` is: a row the caller may not read is refused (`A4002`). A row a write names to link that is not there is refused the same way (`A4002`) wherever the target has a scope; before, it answered `A2008` or `A2003`. Without a scope the codes are unchanged. See [Policies](/docs/policies).
- A listed update (`afterChecks`) holds a to-one nested `$update` to its row as it was read, and a listed `update.many` or `update.count` that changes fewer rows than it read is refused (`A4002`) and rolled back.
- A model whose table another service owns can be marked `resources.<R>.managedElsewhere: true`: Aventara reads and joins it, and no standard operation writes it. The client and agent Contracts leave it out. A `client.resources` or `agent.resources` entry for it is refused (`COMPILER_UNKNOWN_RESOURCE`).
- The Prisma 7 generate step reads multiSchema's `@@schema("auth")`.
- `mcp.authorization.servers` accepts `http://127.0.0.1:4000` and `http://[::1]:4000` for local development. `localhost` is refused with the address to use, and every server is refused with a query, a fragment, an empty path segment or port 0.
- On PostgreSQL, a listed update no longer refuses an unchanged row, and a scalar list a create left out (stored as `NULL`) answers every list filter as `[]` does. `Bytes[]` columns no longer offer `equals`, `hasEvery` and `hasSome`.
- `aventara-build` reads the project's `.env` files before it runs the configuration, and prints a defect as `String(error)` when its stack is empty. The Next.js scaffold keeps one PrismaClient per generated schema, so `next dev` needs no restart.

## 1.0.0-rc.9

Published under the `rc` dist-tag before rc.10. It adds the Next.js host to the scaffold, `framework.serverClient`, and the access provider. Upgrading from rc.8: see [Upgrading](/docs/upgrading#from-100-rc8-to-100-rc11).

- `aventara new <name> --host next` runs `create-next-app@latest`, then the same `init` steps. `aventara init` tells the host by `package.json` (NestJS 12 or Next.js 16) and refuses a project that depends on both or neither. A Next.js app gets `src/aventara/` (config, adapter, server), an API route, `src/instrumentation.ts` and `src/prisma.ts`, and `serverExternalPackages` in `next.config.ts` so one core and one Prisma client serve every route. `aventara-build --client` writes the browser client with no running server. See [Next.js host](/docs/nextjs-host).
- `framework.serverClient` and `framework.serverClientTx` are the client layer for server code, called with application values (`Date`, `bigint`, `AvDecimal`, `Uint8Array`). Each call runs the same client pipelines, validation, exposure and policy as `framework.client`, with the same answers and errors.
- `createFramework` takes `access`, an access provider: the policy engine and the request state from one object (`policy` and `state({ headers, request })`). `access` together with `policy` is refused at startup. `AventaraModule` seeds each request's `ctx.$state` from the provider's `state`; its own `state` option beside `access` is refused.
- Values and errors from `@aventara/core` are recognized across duplicate copies of the package in one process (Next.js layers, a monorepo): `AvDecimal` and every `AvError` class pass `instanceof`, and the `diagnostics` sink receives reports raised through another copy. A `find.many` selecting a decimal no longer answers `500 A3003` there.
- The agent skill has a section "Calling the API over HTTP", with a working curl example. Run `aventara skill` to refresh it.

## 1.0.0-rc.8

Published under the `rc` dist-tag before rc.9. `1.0.0-rc.5`, `1.0.0-rc.6` and `1.0.0-rc.7` were never published; everything planned for them is in this release, plus the fixes their checks found. It adds two things for people who write a policy engine, fixes what testing a policy engine over HTTP and MCP found, and makes helpers that take or return a call's arguments compile in projects that emit declarations. A project with no `policy` serves the same Contracts and hashes as rc.4, so a client generated against rc.4 keeps working. Upgrading from rc.4: see [Upgrading](/docs/upgrading#from-100-rc4-to-100-rc8).

**Policy engines**

- An engine can check a create whose row reaches another Resource through a relation. Discovery now records, on the end of a relation that holds the reference, which of the target's fields its reference fields name (`Note.campaign`: `referenceFields: ["campaignId"]`, `references: ["id"]`). The engine reads them from the model it is built from or from `framework.contracts.core`, and asks one `exists` about the row they name, such as "a player creates a note only in a campaign they play in". The served Contracts, `/_contract`, the MCP tools and every ClientContract hash are unchanged.
- `fieldsOf({ access: "write" })` also names the action that writes the record, `action: "create" | "update"`, so an engine can lock a field on update and still let a create write it. A read question names none, and an engine that ignores it keeps working.
- `policy.principal` may answer with a promise. A rejection answers `A3000`, as a throw does.

**Fixes**

- A cursor on a row the caller cannot read is answered exactly as a cursor on a row that does not exist, at the root and in a to-many relation. Before, the page started at the hidden row, which told the caller the row exists and where its values sort. On the Prisma adapter a scoped cursor costs one extra lookup.
- A unique update with a nested write (`$create`, `$connect` and the rest) on a row the caller can read but not change answers `A4002`, as the same update without one does. It answered `A2003`. A row the caller cannot read still answers `A2003`.
- The `exists` questions a policy engine is asked select the Resource's primary identifier, never another unique field such as a governed `email`.
- Helpers that read the Core Contract compile in projects that emit declarations. A function returning a Resource or a field of `framework.contracts.core` without a return type, such as `core.resources[resource]?.fields[relation]`, failed `nest build` and `tsc` with `"declaration": true` (`TS2883`, or `TS2742` on TypeScript 5.9). `@aventara/core` now exports the types the Core Contract is written with: `AvCoreResource` (a Resource), `AvCoreField` (one of its fields) and `AvCoreRelationField` (a relation field, with the target fields its reference names in `references`).
- A policy's startup check states the path once: `CONFIG_INVALID_VALUE at policy.engine.governed.Nope: "Nope" is no Resource of the Core Contract`. Each diagnostic's `message` no longer starts with its `path`; read the path from `path`.
- Typed policy engines compile in projects that emit declarations. An engine written `as const satisfies AvPolicyEngine` failed `nest build` and `tsc` with `"declaration": true` (`TS2883`, or `TS2742` on TypeScript 5.9). A read question's `action` is now typed `undefined`, so an engine can write `fieldsOf({ resource, access, action })` for either question.
- `AvConstructionError.message` names the first problem and how many more there are, for example `Aventara framework configuration validation failed: CONFIG_INVALID_TYPE at adapter.execute: adapter.execute must be a function (+2 more)`. `stage` and `diagnostics` are unchanged; code that compares the message to the old sentence should compare `error.stage`.

**Declarations and types**

- Helpers typed off the façades compile in projects that emit declarations. A function that took `Parameters<AppFramework["application"]["Post"]["find"]["many"]>[0]` and returned its `where`, or built a new one from it, without a return type failed `nest build` and `tsc` with `"declaration": true` (`TS4023`: `has or is using name 'ScalarFilterOperands' … but cannot be named`, usually beside `TS7056`). A nested write's data could fail the same way, and a nested `$update`'s `where` was written into the `.d.ts` as `any`. The declaration now names the argument types `@aventara/core` exports (`AvWhereInput`, `AvCreateDataInput`, `AvUpdateDataInput`). See [Server-side usage](/docs/server-side-usage#a-helper-that-takes-or-returns-arguments).
- New exports from `@aventara/core`: `AvScalarFilterOperands` (one field's filter operators), `AvScalarWhereInput` (the `where` of a nested `$update` or `$delete` that takes plain fields only), `AvNoAdvertisedMember` (a write member that advertises nothing; it takes `{}`), and `AvSqlStatementBuilder` and `AvSqlStatementValue` (the type of `framework.appTx.$sql` and the values it binds). A method returning `framework.appTx.$sql` failed with `TS2883` (`TS2742` on TypeScript 5.9) before.
- `framework.execute` and `framework.executeTransaction` take request types exported from `@aventara/core`: `AvOperationRequest` and `AvTransactionRequest`, each with an application, client and agent member (`AvApplicationOperationRequest`, `AvClientOperationRequest`, `AvAgentOperationRequest`, and the three `…TransactionRequest`), and `AvRequestProtocol` for a remote request's `protocol`. They were named from `@aventara/core/internal` (`FrameworkOperationRequest`, `FrameworkTransactionRequest`, `ClientProtocolIdentity`, ...) and are gone from there; change the import.
- Reading a projecting variant's argument type (`Parameters<…["find"]["many"]>[0]`) type-checks faster: about 6,000 type instantiations over a three-field model, where rc.7's build took about 29,000. The part of the argument other than `select` and `include` is marked `NoInfer` in the call's parameter, so an editor shows it as `NoInfer<Omit<…>> & …`. What a call accepts is unchanged.
- A create's `data` type states each required field once, as a required member (`Readonly<{ title: string; } & { body?: … }>` in an editor's expanded hover). Before, a required field appeared as an optional member beside a separate `{ readonly title: WrittenValue }`. What a create accepts and refuses is unchanged.

**Discovery artifact and build**

- The discovery artifact's `referentialActions.<Resource>.owningEdges[]` call the fields that hold the reference `referenceFields`; they were `references`, which a model's relation fields use for the target's fields. Regenerate the artifact (`npm run aventara:prepare`). Only those keys change: the model hash and the prebuilt Contracts file are the same. See [Upgrading](/docs/upgrading#5-the-discovery-artifacts-referencefields).
- `aventara-build --check` says what changed when a file is stale, in the words of the `AVENTARA_PREBUILT_STALE` warning at startup: the `@aventara/core` version that wrote it against the installed one, a file format or protocol version that differs, the Resources that changed, are new or are gone, the configuration or model outside the Resources, or a file that no longer reads as a prebuilt Contracts file. See [CLI reference](/docs/cli-reference#aventara-build).

**Rebuild**

- The discovery artifact's model hash changes, and so does the fingerprint of a prebuilt Contracts file. Run your generate step and `aventara-build` again (`npm run aventara:prepare` in the scaffold; `pnpm run aventara:prepare` with pnpm, `yarn aventara:prepare` with yarn). Until you do, the prebuilt file reads as stale (`AVENTARA_PREBUILT_STALE`) and the Contracts compile at startup.

## 1.0.0-rc.4

Published under the `rc` dist-tag before rc.8. It adds `@aventara/build`, a build step for serverless and edge starts, changes the scaffold's configuration shape, and adds a policy seam for access rules. A project with no `policy` keeps the Contracts and hashes it had in rc.3, so a client generated against rc.3 keeps working. Upgrading from rc.3: see [Upgrading](/docs/upgrading#from-100-rc3-to-100-rc4).

**Build-time Contracts**

- New package `@aventara/build`, a development dependency with the bin `aventara-build`. It runs `src/aventara.config.ts` and `src/aventara.adapter.ts` without a database client, compiles the Contracts with your `@aventara/core` and writes `contracts.generated.ts` (`aventaraContracts`). A serverless or edge entry passes it to `createFramework` as `prebuilt`, so a cold start loads the Contracts instead of compiling them. A configuration that startup would refuse fails the build with the same diagnostics, and `aventara-build --check` writes nothing and exits 1 when a generated file is missing or stale. A file that does not match the running framework is ignored whole: the framework compiles at startup as it did before and warns once with `AVENTARA_PREBUILT_STALE`. See [Deploying](/docs/deploying#build-time-contracts) and [CLI reference](/docs/cli-reference#aventara-build).
- `aventara-build` also writes `resources.generated.ts`, the tree of your `defineResource` results from `src/resources/**/*.resource.ts`, and `computed-fields.generated.ts`, which fields your write compute fills. The scaffold takes its Resources from the tree (`resources: aventaraResources.root`), so a new Resource file needs no configuration edit, and two definitions of one Resource stop the build. See [Configuration](/docs/configuration#the-generated-resource-tree).
- The scaffold's `src/aventara.config.ts` is now a plain `export const aventaraConfig = { … } as const` with no adapter. A new `src/aventara.adapter.ts` default-exports `describePrismaAdapter({ discovery, provider, driver })`, and `app.module.ts` joins them with `createPrismaAdapter({ ...adapter, client: prisma })`. `aventara:prepare` ends with `&& aventara-build`.
- `aventara-prisma7-generate` no longer reads your configuration. With `--config`, the discovery artifact imports the computed fields from the file `aventara-build` writes. `readConfigComputedFields`, `AvPrismaConfigReaderError` and `ConfigComputedFieldsReading` are removed from `@aventara/prisma7-adapter/generate`.
- All of Aventara's generated files sit in one directory. In a project whose Prisma client is generated into `src/generated`, `prisma generate` used to delete the files `aventara-build` wrote there; they now go beside the configuration's `aventaraResources` import, and `.gitignore` gets one `/src/aventara/` line for all four files.

**Access policies**

- `createFramework` takes an optional root `policy: { engine, principal }`. The engine answers three questions (`can`, `scopeOf`, `fieldsOf`, each now or as a promise), and `principal` derives the caller from `ctx.$state`. Core never imports an engine; any object with that shape works.
- Client and agent requests are checked, and an application call is checked when it names a principal: `framework.application.Note.find.many(args, { as: user })`. A refusal is `403` `A4002`. The read scope is added to the root `where`, every to-many include and its count, and every relation filter. A to-one include of a row out of scope refuses the request instead of returning `null`.
- Fields the engine marks as governed are left out of every default projection and carry `governed: true` in the Contracts. Name one to get it: `select: ["$defaults", "email"]`, where `$defaults` is the level's default projection. A filter or sort by a governed field is checked before the query runs.
- Writes are checked too, nested writes included. The fields a write sends must be within the caller's write grant. An update or delete acts only on rows the caller may both read and change. An update that moves a row out of what the caller reads, or fails an `after` condition, is rolled back with `A4002`. One failed check in a nested write rolls the whole write back.
- A single-row update or delete of a row the caller cannot read answers `A2003`, the same as a row that does not exist, and a unique read of a row outside the read scope is a miss in the same way. A row the caller can read but not change answers `A4002`. See [Error codes](/docs/error-codes#a4002).
- A checked write costs few round trips. On PostgreSQL: `create.one` 1 (was 3), `delete.unique` 1 (was 4), `update.unique` 3 (was 5), `update.many` 3 (was 4), `update.count` 3 (was 5). Reads, and a framework without a `policy`, are unchanged.
- `policy` and `prebuilt` are root-only. A `policy` that names a governed field or path the Core Contract does not have is refused at startup, with a `CONFIG_…` code that names the rule.

**Types**

- A service method can return any façade node or variant without a return type. Under `declaration: true` (a Nest build) the declaration file now writes a short reference, under half a kilobyte per method, where it wrote the whole Contract view (about 440 KB per method over 50 Resources). A method that returns a variant such as `this.framework.application.Post.find.many` no longer needs an annotation, and one that returns a transaction variant no longer runs the compiler out of memory. An annotation you wrote keeps working. See [Server-side usage](/docs/server-side-usage).

**Performance**

- Reads are faster: the read-only copies that computed fields and hooks are given cost about half what they did, a row whose computed field returns a value at once no longer waits a turn per row, and the MCP endpoint builds its JSON Schema validator once instead of on every request. What stages are told, the order they run in and what a request answers are unchanged.

## 1.0.0-rc.3

Published under the `rc` dist-tag before rc.4. Fixes found while testing rc.2: no configuration key moves, nothing is renamed, and the contract hash does not change. Upgrading from rc.2: see [Upgrading](/docs/upgrading#from-100-rc2-to-100-rc3).

**Writes**

- An empty boolean node in the `where` of a write is refused, as an `undefined` there is, and nothing runs. In `update.many`, `update.count`, `update.first`, `delete.count`, `delete.first` and a to-many `$update` or `$delete`, an empty `NOT: {}`, `AND: {}` or `[]`, `OR: []`, or an `AND`/`OR` entry `{}`, at any depth, answers `422` `A2004` with a `V1001` issue at the node. Before, the ORM read it as no condition: `delete.count({ where: { NOT: {} } })` deleted every row, and `delete.first` with one deleted an arbitrary row. A `where` that is `{}` itself still means every row, reads pass empty nodes through as before, and a to-one relation's `{ author: {} }` still matches the rows that have a related row. See [Filtering](/docs/filtering-sorting-paging#and-or-not).
- An issue inside one entry of a to-many directive's array names the entry's index, such as `["arguments","data","posts","$update",1,"data","category"]`. This holds for `$create`, `$connect`, `$connectOrCreate`, `$update`, `$delete`, `$upsert`, `$set` and `$disconnect`.
- On PostgreSQL, a `@unique` value too long for its index is answered `422` `A2004` with one `V1004` issue at `["arguments"]`, instead of `500` `A3001`. The issue's message for a value too long now reads `The database refused this value: it is longer than the database can hold for its column.`

**Computed values**

- A value a compute stage writes to a field the caller's layer hides is judged by the root's validators and Json shape. A value they refuse answers `500` `A3000`, with an `AvComputedValueError` in the `diagnostics` sink and nothing of the hidden field in the answer. Before, a hidden shaped Json field was not judged at all, and a hidden field's own validators answered the caller `A2004` at the hidden field's path. See [Field validators](/docs/field-validators#where-they-run).

**Types**

- A `client` or `agent` list entry that names what its parent hid now names the sentence when written inline in `createFramework` or `AventaraModule.forRoot` too, where it read `Type 'string' is not assignable to type 'never'`. Inline or not, the error ends at `Property '"Error: client cannot expose 'User.internalNotes': hidden by root"' is missing in type …`.

**Generate step and CLI**

- `aventara-prisma7-generate` refuses a `--provider` that the schema's `datasource` block contradicts, naming the flag to pass; PSL's `postgres` counts as `postgresql`. Before, a wrong flag wrote the wrong provider into the artifact and the wrong filter modes into the contract.
- When the file system refuses the artifact file (`--out`), the generate step says so in one sentence naming the file and why, and leaves no staged file behind. Before, it printed a stack trace.
- A refusal from `aventara` that quotes a failed command's output (`npm install`, `nest new`) ends with that output as written, without an extra period.
- The error catalog (`AvErrorCatalog`, `ERRORS.md`) now describes `A2004`, `V1001` and `V1004` as the code answers them. See [Error codes](/docs/error-codes).

## 1.0.0-rc.2

Published under the `rc` dist-tag before rc.3. Upgrading from rc.1: see [Upgrading](/docs/upgrading#from-100-rc1-to-100-rc2).

**Smaller declarations**

- The discovery artifact exports the model's type by name, `AvModel`, and declares `model` with it. A project that emits declarations (Nest's default) writes the name instead of the whole model: over 50 models, the scaffold's `aventara.config.d.ts` goes from about 485 KB to under 1 KB, and a `buildFramework` / `AppFramework` module from about 930 KB to under 1 KB. Run `aventara:prepare` to regenerate the artifact.

**Types**

- TypeScript 5.7 is the floor: the Prisma adapter's `typescript` peer is `>=5.7.0 <7` and the client generator's `>=5.7.0`. Under 5.5 and 5.6 a variant's stages written inline in `createFramework` were told `unknown` arguments.
- A variant's guards, pipes and filters run before write compute, so their typed arguments no longer require any field of a create (create data, an upsert's `create`, nested creates): a pipe may return a create without a field `compute.create` fills. Hooks and interceptors keep the requirements.
- A `client` or `agent` layer under `exposed: false` that names what its parent hid is a type error that now ends with a sentence naming the key and who hid it, such as `Error: client cannot expose 'User.internalNotes': hidden by root`.

**Computed values**

- `compute.create` and `compute.update` values must pass the field's validators. One that does not is answered `A2004` at the field, like any refusal; a value of the wrong type stays `A3000`, with the details on an `AvComputedValueError` in the `diagnostics` sink. `compute.read` values are not judged.
- Validators now run after write compute, on every value that is written, so they see the piped and computed value. A call judges once.
- A pipe's output that fails Aventara's own checks (a wrong type, an unknown key, a required field it dropped, a reference written twice) answers `500` `A3004`, and so does a reference a compute stage wrote twice. A compute stage returning a value of the wrong type stays `A3000`.

**`undefined` values**

- An explicit `undefined` in write data counts as not sent, the same as leaving the key out: an optional field is omitted, an update leaves the field untouched, and a required create field is missing (`A2004`, `V1000`). This holds for server-side calls, `ctx` calls, pipe output and transaction steps. Before, it was refused with `V1001`.
- The generated client refuses `undefined` in a filter, a unique selector or a cursor (and a `where`, `cursor`, `limit` or `offset` key set to `undefined`; leaving the key out still means no filter) before anything is sent, with `AvValidationError` `A2004` / `V1001` at the same path the server uses. Before, JSON dropped the value and the request matched every row: `update.many({ where: { id: undefined } })` updated the whole table. Regenerate the client to get the check.
- `undefined` inside a `json` value becomes what JSON makes of it on every surface: a key holding it is left out, and an array element holding it is `null`. In rc.1 server-side calls refused the key with `V1001`, and a hole in an array was dropped, shifting the elements after it. Regenerate the client.

**Writes**

- One scalar action object holds one directive: `{ score: { $increment: 1, $decrement: 2 } }` is a type error and is refused with `A2004` / `V1001` at the field. In rc.1 the ORM refused it with `500` `A3001`.
- A `$divide` by zero is answered `422` `A2004` / `V1004` with the database's reason. In rc.1 it answered `500` `A3001`.
- A Json value whose top level is an object of `$` keys answers `A2004` / `V1006` in a plan step too. Before, it answered `A2007` / `V1016` there.
- A relation written together with its reference field (`V1012`) is refused before any guard, pipe or compute stage runs, and in a plan before the transaction opens. In rc.1 the developer's stages ran first.

**Filters**

- `mode` takes `"default"`, `"sensitive"` or `"insensitive"`, and each field lists the modes it offers in the contract (`filterModes`, `pathFilterModes`). An unoffered mode is a type error and is refused with `A2004` / `V1006` before the database is asked. With Prisma 7: PostgreSQL offers all three (a whole `Json` document not `"insensitive"`, which PostgreSQL could not run and answered `A3001`); SQLite offers `"default"`. Run `aventara:prepare` and regenerate the client.
- `mode`, `isEmpty`, `path` and a `Json` field's `string*` operands of the wrong type (`isEmpty: 3`, `mode: "loud"`, `path: "a.b"`) are refused with `A2004` / `V1001` at the operand. Before, they reached the ORM and answered `A3001`.
- `not` holding operators negates the whole object, with SQL's rule for unknown rows (a `NULL` or missing value matches neither). In rc.1 the Prisma adapter matched every row for a `Json` field's `not` with operators (updates and deletes included), matched no row for `not` with two operators, and answered `500` for `mode` inside `not`.
- Each filter object stands alone: a `mode` or `path` with no operator beside it is refused with `A2004` / `V1001` and is a type error.
- A value the database refuses (out of range, a NUL character in PostgreSQL text, too long for its column, an invalid character) is answered `422` `A2004` with the database's reason instead of `500` `A3001`.
- On D1, a `BigInt` beyond ±(2^53 − 1) (written, compared or in `$increment`) is answered `422` `A2004` / `V1004` at the value, instead of `500` `A3001`.
- `AvProtocol.handleTransaction` copies a parsed plan when it is called, and a `$sql` step never runs a getter inside an object carrying `$ref`.
- A server-side `appTx` builder never runs a getter inside an object carrying `$ref`, and `AvProtocol.handleOperation` copies a parsed body when it is called, as documented.
- Clearer `orderBy` refusals: a `$ref` in `orderBy`, and a malformed null ordering, say what is wrong.
- `AvJsonValue` admits a property holding `undefined`.
- On a `Json?` field, writing `null` stores the database `NULL`, and `field: null` / `equals: null` match every row that reads back `null`. In rc.1 the Prisma adapter stored a JSON `null`, `equals: null` matched only JSON `null`s, and `field: null` answered `500` `A3001`.
- An empty to-one relation filter (`{ author: {} }`) matches the rows that have one. In rc.1 the Prisma adapter matched every row, and its `NOT` did too, so `delete.count({ where: { NOT: { author: {} } } })` deleted every row.
- In a filter, `mode`, `isEmpty` and `path` set to `undefined` are refused (`A2004`, `V1001`), like every other operator. Before, they reached the database as no condition.

**MCP**

- A request with no bearer token, or with another scheme, gets `401` with `WWW-Authenticate: Bearer resource_metadata="..."` and no `error` code. A bad bearer token keeps `error="invalid_token"`.
- A `verify` that throws is answered `401` and reported to the `diagnostics` sink (`kind: "mcp"`).
- With `mcp` configured and `@aventara/mcp` missing, the startup error prints `npm install --save-exact @aventara/mcp@<version>` with your `@aventara/core` version.

**CLI**

- An agent skill for your AI coding agent: `aventara new` and `aventara init` write `.claude/skills/aventara/` (`SKILL.md` and `reference/config.md`, `stages.md`, `recipes.md`, `errors.md`) and a short Aventara section in `AGENTS.md`, between `<!-- aventara:start -->` and `<!-- aventara:end -->`. `CLAUDE.md` is never written.
- `aventara skill` refreshes those files for the `@aventara/core` installed in the project. It keeps a skill file you changed (`--force` replaces it) and replaces only the marked section of `AGENTS.md`.
- The scaffold's `aventara:prepare` script passes `--config src/aventara.config.ts`, so the generated types know which fields your configuration computes.

## 1.0.0-rc.1

Published under the `rc` dist-tag before rc.2. Upgrading from rc.0: see [Upgrading](/docs/upgrading#from-100-rc0-to-100-rc1). Every application's client contract hash changes (the contract now lists `maxJsonDepth`), so regenerate the frontend client.

**Breaking: the configuration has a new shape**

- The mount path's key is `api` (it was `entrypoint`), read back as `framework.api`. `entrypoint` is refused with `CONFIG_MOVED_PROPERTY`. The frontend's `entrypoint` (the server's URL in `framework.client.ts`) keeps its name.
- Every layer (the root, `application` and `client`) holds the same six keys: `exposed`, `exemptions`, `transactionsStyle`, `limits`, `pipelines` and `resources`. Everything about one Resource lives under `resources.<Resource>`: stages per Resource, family and variant, its transaction stages, and its fields with their `definition` and `pipelines`. See [Configuration](/docs/configuration).
- The rc.0 keys are refused at startup with `CONFIG_MOVED_PROPERTY`, naming the new place: `restrictions` (now `exposed` + `exemptions`), `fields` (now `resources.<R>.fields.<f>.definition`), `behaviors` (now `resources.<R>.fields.<f>.pipelines.compute`), `transactions` (now `transactionsStyle`), and `before`/`after` directly in `pipelines` (now `pipelines.hooks`). In a configuration TypeScript checks against your model, each is a type error at the key first, and so is any key that has no place where it is written.
- A field is defined at the root only. A `definition` in `application` or `client` is refused (`CONFIG_FORBIDDEN_IN_OVERLAY`). On a discovered field you may restate the adapter's `type`, `nullable` and `list`, and give a Json field its shape; a configured field's `format` must be one of zod's named string formats.
- `@aventara/core/json` is now `@aventara/core/avz`. `AvZ` is the same.
- `defineFields` is gone. `defineResource<Model>()("Post", rootBlock, { application?, client? })` defines one Resource's configuration in its own module, its root block and its overlay blocks, each typed as it is in place. It returns `{ root, application?, client? }`, to spread as `resources: { ...post.root }` and `client: { resources: { ...post.client } }`.

**Breaking: exposure replaces restrictions**

- `exposed` is a layer's default and `exemptions` lists the entries that are its opposite: with `exposed: true` they are what to hide, with `exposed: false` the only things exposed. A list always means "exempt these" (rc.0's `filter: ["equals"]` meant "keep only `equals`"). See [Exposure](/docs/exposure).
- Overlays only narrow. An overlay can no longer bring back what the root hid; that is refused, and the message names the other overlay to hide it in instead. An overlay that sets `exemptions` must set its own `exposed`.
- Every name in `exemptions` must exist and be offered by the adapter. A unique operation left without an identifier is refused (`COMPILER_MISSING_IDENTIFIER`) instead of disappearing. Where a relation is projected or written is the adapter's and cannot be narrowed.
- `aventara init` and `aventara new` write `exposed: true` into `src/aventara.config.ts`, with a comment linking the exposure page.

**Breaking: required create fields are typed**

- Each Resource's contract states what a create requires (`createRequirements`: `required` fields, `oneOf` required relations with their reference fields, and `parentSupplies` for nested creates), per layer. The generated client, `framework.application`, `framework.client`, the transaction builders and a stage's `ctx` require it: leaving out a required field, or writing a required relation neither way or both ways (`author` and `authorId`), is a type error. The runtime answers what it answered before (`A2004` with `V1000`, or `V1012` for both). See [Relations and nested writes](/docs/relations-and-nested-writes#required-relations-and-fields).
- The Prisma discovery artifact carries the requirements in its model (format 3): regenerate it with `npm run aventara:prepare`. The client contract hash changes for every schema with a required field.
- A field a pipe fills on the server is now required of callers. Give it a `compute.create` stage or a database default, or have callers send it.
- A layer that can still create a Resource can no longer hide a required field (or exempt its `create`), or a required relation together with a field that holds its reference (any one field of a composite reference), unless a `compute.create` stage fills it. Startup refuses it with `COMPILER_HIDDEN_REQUIRED_FIELD`, naming the layer, the Resource and the field. Keep the field exposed, move the pipe's value into a `compute.create` stage, or exempt the create operations. See [Exposure](/docs/exposure#creates-need-what-they-require).
- A `create.many` or `create.count` record cannot write a relation, so each record needs the reference field (`authorId`), in the types and at runtime (`V1000` at `data.<n>.authorId`). A layer that hides `authorId` while it keeps those variants is refused at startup, even with `author` exposed: keep `authorId`, give it a `compute.create`, or exempt `create.many` and `create.count` there. See [Exposure](/docs/exposure#bulk-creates-need-the-reference-field).
- A `compute.create` written inline in `createFramework({ ... })` counts in the create types without annotations, at the root and in an overlay. A `create` or `update` stage's `field` and `data` are keyed by `string`.

**Breaking: `Av` names**

- Every public type and class is `Av` plus what it is: `AvError`, `AvConfig`, `AvFramework`, `AvGuard`, `AvContext`, `AvConstructionError`, `AvDecimal`, `AvContractClient`, ... The generated client's names follow (`AvValidationError`, `AvNotFoundError`, `AvTransportError`, `AvCallOptions`, ...), as do `@aventara/client`'s, `@aventara/testing`'s and the Prisma adapter's. `PipelineContext` is `AvContext`, and `ComputeContext` is `AvComputeContext`, a compute stage's read-only `ctx`. Functions keep their names. No aliases.

**Breaking: server-side calls return data and throw**

- `framework.application`, `framework.client` and `framework.transaction` settle like the generated client: they resolve the data (a committed transaction its steps' results in order) and throw every failure as an `AvError` subclass, `AvValidationError`, `AvNotFoundError`, `AvConflictError`, `AvAuthError`, `AvInternalError`, `AvProtocolError` or `AvContractMismatchError`, now exported from `@aventara/core`, by the same code table as the generated client. A stage's `ctx` calls throw them too. `error.code` and `error.cause` are what the envelope carried. `framework.execute` and `framework.executeTransaction` still answer the envelope. See [Server-side usage](/docs/server-side-usage#errors).

**Breaking: pipelines**

- Every framework member of `ctx` starts with `$`: `ctx.$operation` (`{ resource, family, variant, nested }`), `ctx.$args`, `ctx.$origin`, `ctx.$requestId`, `ctx.$transport`, `ctx.$contract`, and the new `ctx.$state`. A model whose name starts with `$` is refused (`COMPILER_RESERVED_RESOURCE_NAME`).
- One stage order: guards, pipes, validators, interceptors, `before` hooks, the operation, `after` hooks, interceptors unwinding, filters. Every interceptor wraps every hook (in rc.0 every `before` hook ran ahead of every interceptor), and an overlay's `after` hooks run before the root's. A guard, a pipe's output or a validator that refuses a call runs no interceptor and no hook. In a transaction, every step's guards, pipes and validators run before it opens, so a refused step opens nothing. See [Pipelines](/docs/pipelines#order).
- Data is read-only once final. Only a pipe changes the arguments, by returning new ones; changing `args` or `ctx.$args` in place throws a `TypeError`. What the validators checked is what the adapter writes. An `after` hook gets a frozen copy of the result. See [Read-only data](/docs/pipelines#read-only-data).
- Nested writes run the target Resource's own guards and field stages. A nested `$create` of a `Category` under `Post.create` is refused when `Category`'s create guard refuses it (`A4001`).
- A transaction has one origin. A list that mixes `appTx` and `clientTx` steps is a type error, and `framework.transaction` refuses one that gets past the types: `A2004` with the new issue code `V1020`.
- A Json field's shape is one of its validators. It is checked where validators run, after every pipe (in rc.0 it was checked before the pipes), and its issues come in the order the call wrote the fields, with the other validators'. Before the pipes the framework only checks that the value is plain JSON. A field or operation pipe whose Json output breaks the shape is answered `A2004`, not `A3004`.
- A Resource's transaction filters are the transaction's outer layer: an error a step throws that its own filters leave unhandled continues to them before it is answered. A transaction interceptor's `next()` throws the failed step's `AvError` (`AvNotFoundError` for a unique miss), and catching it still rolls back. See [Pipelines](/docs/pipelines#resource-transaction-stages).
- A compute stage receives `{ field, value, data, ctx }` (`record` on read); its `ctx` is read-only (`AvComputeContext`). Compute stages chain across layers (the root's runs first, the overlay's gets its result); `false` no longer turns a stage off. An upsert computes its branches with `compute.create` and `compute.update`.

**New**

- The `agent` layer, for AI agents served over MCP: the six layer keys plus `extends` (`"client"` by default, `"application"` or `"root"`). It narrows that layer's view, its stages run after that layer's, and each stage sees `ctx.$origin === "agent"`. It compiles to `framework.contracts.agent`, with its own hash. `AvProtocol.bind(framework, { origin: "agent" })` runs agent calls through the same validation as HTTP calls. See [The agent layer and MCP](/docs/configuration#the-agent-layer-and-mcp).
- `mcp` turns MCP on: a mount path, or `{ path, authorization: { servers, verify } }` for OAuth. The resolved endpoint is `framework.mcp`. `@aventara/mcp` serves it: install it beside `@aventara/nest`, which mounts it. See [MCP](/docs/mcp).
- Stages at every level: `resources.<R>.pipelines`, `.operations.<family>.pipelines`, `.operations.<family>.<variant>.pipelines`.
- Field stages: [validators](/docs/field-validators), pure field `pipes`, field write `guards` (a relation field's guard covers `$connect` and friends).
- Field validators, written with `AvZ` in zod's check vocabulary (`AvZ.maxLength(80)`, `AvZ.gte(0)`, `AvZ.email()`, `AvZ.maxItems(5)`, ...). They are part of the contract, the server checks them after the guards and pipes, before any interceptor or hook and before a transaction opens, and the generated client checks them before it sends. A failure is `A2004` with `V1003` or `V1004`, and each issue carries `check` and `params`. Json shapes take the same checks: `AvZ.string().check(AvZ.maxLength(80))`.
- Resource transaction stages, `resources.<R>.transactions.pipelines`: once per transaction with a step on R, inside it, seeing the whole plan.
- `forceTransaction` on a family or a variant: a plain call runs as a one-step transaction, so its after hooks commit with the write or not at all.
- `ctx.$state`: one writable object per request, shared by every stage, a transaction's steps and the ctx calls they make. Declare its members by augmenting `AvState`. Seed it with `AventaraModule.forRoot({ state: (req) => ({ user: req.user }) })`, or per call with `{ state }` beside `requestId`. See [The pipeline context](/docs/pipeline-context#request-state).
- `ctx` is the framework's executor: `ctx.<Resource>.<family>.<variant>(args)` (raw, application-origin, joins the current transaction), `ctx.$sql` (outside a transaction, a plain statement with no transaction around it) and `ctx.$transaction(async (tx) => ...)`. See [The pipeline context](/docs/pipeline-context), with an outbox and a likes-counter recipe.
- A stage registered on one operation (`operations.<family>.<variant>.pipelines`) gets `ctx.$args` typed as that operation's arguments, read-only, and a pipe there takes and returns that type. See [Typed arguments](/docs/pipeline-context#typed-arguments).
- `framework.appTx.$sql`, a bound tagged-template SQL step in an application transaction. See [Transactions](/docs/transactions#sql-steps-apptxsql).
- A new limit, `maxJsonDepth` (default 64), for the depth of a Json value: `A2009` with the new code `V1021`.
- A `where` offers each field only the filter operators that field allows, in `framework.client`, `framework.application`, the transaction builders and the generated client.
- A project made by `aventara new` or `aventara init` has a `diagnostics` sink: it logs the raw error of a server failure, with its stack, through Nest's `Logger`.
- A server method that returns a call's result without a return type compiles in a project that emits declarations (Nest's default), Json shapes and transaction handles included. The new type exports `AvZShapedSchema` (`@aventara/core/avz`) and `AvOperationHandle` (`@aventara/core`) are what such a declaration names.

**Fixes and behaviour changes**

- A `$connect` to a record that does not exist answers `404 A2003` (it was `422 A2004`), also inside a transaction. On `update.first` it was `A2014`; a duplicate value through `update.first` is now `409 A2008` (it was `A3001`).
- `A2001` says `The requested Resource is not available.` and `A2002` says `The requested operation is not available on this Resource.` A transaction step with an unknown operation carries the same issue message as a single call.
- A `$ref` with no `fingerprint` is `A2004` / `V1000` (it was `A2007` / `V1017`).
- Operators inside `not` are checked against the field's allowed operators at every depth, and each object `not` counts toward `maxNestingDepth`.
- A forced operation no longer commits a failed step when a transaction interceptor catches the rollback. A transaction interceptor that calls `next()` twice or never rolls back with `A3002`.
- A `compute.read` dependency may be a field the root hides; it is read for the compute and never returned. The renamed compiler codes are `COMPILER_MISSING_READ_COMPUTE` and `COMPILER_INVALID_COMPUTE_DEPENDENCY`.
- Field write guards and field pipes are dispatched from lists planned at startup: a call to a Resource with none does no field-stage work, and a `create.many` reads its records for guards only when a guarded field is registered.

## 1.0.0-rc.0

Upgrading from pilot.4: see [Upgrading](/docs/upgrading#from-010-pilot4-to-100-rc0). The renames and behaviour changes are marked **Breaking** or **Behaviour change**; nothing sent over HTTP changes.

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
