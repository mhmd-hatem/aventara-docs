---
title: Glossary
description: The terms Aventara uses - Resource, contract, layer, family, variant, envelope, A and V codes, ETag, api, entrypoint, generateAt, adapter and host.
order: 93
section: about
---

# Glossary

**A-code.** The outcome code in every response envelope, for example `A1000` (OK), `A2003` (not found), `A4001` (forbidden). The first digit is the class: `1` success, `2` request error, `3` server error, `4` authentication or authorization. The HTTP status is a function of the code alone. See [Error codes](/docs/error-codes).

**Adapter.** The part that knows an ORM. It discovers your schema, says which operations and capabilities the ORM can perform faithfully, and executes validated operations. `@aventara/prisma7-adapter` is the Prisma 7 adapter. The ORM's vocabulary stays inside it.

**Application layer.** The contract used by your own, trusted server-side code (`framework.application.*`). See *layer*.

**avclient.** The command of `@aventara/client`: `avclient init` sets up a frontend and `avclient generate` writes the typed client. See [CLI reference](/docs/cli-reference).

**aventara.** The command of `@aventara/cli`: `aventara new` and `aventara init` scaffold a server. Run once; not a dependency.

**Capability.** What can be done with one field or relation: select it, filter by which operators, order by it, write it with which directives. Capabilities are part of the contract and can be narrowed by exemptions.

**Client contract.** The contract of the client layer: what remote callers may do. It is the only contract served over HTTP and the input to the generated client.

**Compute.** A server-side stage that computes a field's value on create, update or read (`resources.<R>.fields.<f>.pipelines.compute`). The code never appears in a contract; the contract only records that the field is computed.

**Contract.** Plain, serializable data that says which Resources exist, which fields can be read, filtered, ordered or written, and which operations are available. Passive: no callbacks. See [Contract layers](/docs/contract-layers).

**Contract hash.** `sha256:` plus 64 hex characters, computed from the client contract. Clients send it on every request; a mismatch is `A2005`. See [Contract hash](/docs/contract-hash).

**Create requirements.** What a create of a Resource cannot do without, in the contract as `createRequirements`: the `required` fields, each required relation with the field or fields holding its reference (`oneOf`: write one way, not both), and what a create nested through a parent's relation gets from the parent (`parentSupplies`). Each layer lists only what it lets callers write. Create calls are typed by it. See [Resources and operations](/docs/resources-and-operations#what-a-create-requires).

**Cursor.** A pagination argument naming the row at which to start; that row is included in the result (add `offset: 1` to start after it). Requires an explicit `orderBy` ending in a unique field.

**Directive.** A `$`-prefixed key that acts on a value instead of assigning it: scalar directives (`$increment`, `$decrement`, `$multiply`, `$divide`, `$push`, `$unset`) and relation directives (`$create`, `$connect`, `$connectOrCreate`, `$disconnect`, `$set`, `$update`, `$delete`, `$upsert`). Directives apply to writes, never reads.

**Discovery artifact.** The file `aventara:prepare` writes (`src/generated/aventara/discovery.artifact.ts`) describing your Prisma schema to the adapter. Regenerate it whenever the schema changes.

**Agent layer.** The layer an AI agent's calls run under (`agent` in the configuration), served over MCP. It narrows the view of the layer it `extends` (the client's by default) and compiles to the agent contract. See [Configuration](/docs/configuration#the-agent-layer-and-mcp).

**api.** Where the protocol is mounted on the server: a mount path such as `/api` (`AvConfig.api`, read back as `framework.api`). Before rc.1 this key was `entrypoint`.

**Entrypoint.** In the frontend, the server's full URL: origin plus mount path (`http://localhost:3000/api`), in `framework.client.ts` and `new AvClient({ entrypoint })`. On the server the mount path is `api`.

**Envelope.** The JSON every operation answers: `{ "data": ..., "code": "A1000", "cause": null }`. On failure `cause` holds `message`, optional `issues` and optional `operation`.

**ETag.** The header on `GET /_contract` holding the quoted contract hash. Send it back as `If-None-Match` to get `304 Not Modified` when nothing changed.

**Exemptions.** The entries of a layer that are the opposite of its `exposed` default: what to hide under `exposed: true`, the only things exposed under `exposed: false`. See [Exposure](/docs/exposure).

**Exposed.** A layer's default for exposure: `true` exposes everything the layer above offers, `false` nothing. See [Exposure](/docs/exposure).

**Family.** The kind of operation: `find`, `create`, `update`, `delete` or `upsert`.

**Fingerprint.** A short deterministic hash (`fp1:` plus base64url) of one transaction step, used to catch a `$ref` that points at the wrong step. Not a security mechanism.

**forceTransaction.** A setting on an operation family or variant that runs a plain call as a one-step transaction, so its after hooks commit with the write.

**Framework.** The object `createFramework(config)` returns (`AvFramework`): the compiled contracts, `application` and `client` operation facades, and transaction runners. A host serves it.

**generateAt.** The `framework.client.ts` option naming the directory the client is written into. The generator owns `AvClient.ts` and `generated/` in it and nothing else.

**Field validator.** A declarative `AvZ` check on a field's value (`AvZ.maxLength(80)`), part of the contract, checked by the server and by the generated client. See [Field validators](/docs/field-validators).

**Guard.** A pipeline stage that allows or refuses an operation. A field write guard refuses when the caller sends that field.

**Host.** Whatever serves a framework over a transport. `@aventara/nest` hosts it in NestJS 12 on Express or Fastify; `@aventara/core/protocol` lets you write another.

**Layer.** One of the views compiled from your schema and configuration: core (the root, the baseline), application (your server code), client (remote callers) and agent (AI agents over MCP). The `application` and `client` overlays start from the root and can only hide more; the `agent` layer starts from the layer it `extends` and can only hide more.

**Operation.** One standard action on a Resource, named by family and variant: `User.find.many`.

**Overlay.** The `application` or `client` block of the configuration. It holds the same six layer keys as the root.

**Pipeline.** Server-side stages (guards, pipes, hooks, interceptors, filters) that run around operations, registered at the layer, a Resource, a family, a variant or a field. Never part of a contract. A stage's `ctx` can also call the framework ([The pipeline context](/docs/pipeline-context)).

**Protocol version.** The number `1`, sent as `Aventara-Protocol-Version`.

**Reference Field.** A scalar field that holds a relation's reference on the referencing Resource, such as `authorId` for `author`. Setting it and its own relation in one record is refused (`V1012`). See [Relations and nested writes](/docs/relations-and-nested-writes#writing-relations).

**Reference Write Limit.** A data source's statement that one record writes its relations either all as relations or all through their reference fields. Prisma states it, and the Contract carries it as `referenceWrites: "uniform"`; a record that mixes the two is refused (`V1012`).

**Request id.** The correlation id of a request: the client's `Aventara-Request-Id` or one the framework generates; always on the response.

**Resource.** The unit a contract exposes, one per Prisma model, keyed by the model name exactly as written (`User`).

**Transaction.** An ordered plan of operations that commits or rolls back as one, where later steps can refer to earlier results with `$ref`. See [Transactions](/docs/transactions).

**Variant.** The shape of an operation within its family: `first`, `unique`, `many`, `count` or `one`. `unique` operations take an identifier and treat a miss as an error; `first` operations treat a miss as `null`.

**V-code.** A validation issue code, `V1000` to `V1021`, found in `cause.issues[]` under `A2004`, `A2007` or `A2009`, saying what is wrong and where (`path`). See [Error codes](/docs/error-codes#v-codes).

**Wire form.** How a value travels in JSON: `datetime` as an ISO string, `decimal` and `bigint` as strings, `bytes` as base64.

See also: [Exposure](/docs/exposure), [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Pipelines](/docs/pipelines).
