---
title: Concepts
description: The mental model in one page - contracts and layers, Resources, operations, results and the contract hash - with links to the detailed pages.
order: 10
section: concepts
---

# Concepts

Aventara has four ideas: contracts and layers, Resources and operations, results and typing, and the contract hash.

```text
 schema.prisma + aventara.config.ts
              │  compile
              ▼
   core ─► application      client ─► GET /api/_contract ─► avclient generate ─► typed client
              (server only)  (the only layer served)
```

## Contracts and layers

A contract is passive data: which Resources exist, which fields can be read, filtered, ordered or written, and which operations are available. It holds no code, so it can be serialized, hashed and versioned. Aventara compiles three from the same schema:

| Layer | Used for | Served over HTTP |
|---|---|---|
| Core | The baseline everything else starts from. | No |
| Application | Your trusted server-side code (`framework.application.*`). | No |
| Client | Remote callers: the HTTP protocol and the generated frontend client. | Yes, at `GET <entrypoint>/_contract` |

The root of your configuration is the default for all layers; an `application` or `client` block overrides it for one. A field hidden from the client layer is absent from the generated client's types. Details: [Contract layers](/docs/contract-layers).

## Resources and operations

A Resource is one Prisma model, keyed by its name (`User`, `Post`). Every Resource offers operations from five families, each with variants:

| Family | Variants |
|---|---|
| `find` | `first`, `unique`, `many`, `count` |
| `create` | `one`, `many`, `count` |
| `update` | `first`, `unique`, `many`, `count` |
| `delete` | `first`, `unique`, `count` (no `many` with the Prisma 7 adapter) |
| `upsert` | `unique` |

Their meaning is fixed by the protocol; configuration can only switch them off. Each variant, with an example, is in [Resources and operations](/docs/resources-and-operations).

## Results and typing

Every operation answers one envelope, `{ data, code, cause }`. The generated client resolves to `data` and throws a typed error for every failure; a `first` miss is `null`, a `count` is a number, and results are `readonly`. The type of a result follows your `select` exactly. Details: [Results and typing](/docs/results-and-typing).

```json
{ "data": { "id": 1, "email": "ada@example.com" }, "code": "A1002", "cause": null }
```

Branch on `code`, never on `cause.message`. The codes are listed in the [HTTP protocol](/docs/http-protocol#codes).

## The contract hash

The client contract has a hash over everything it advertises, served as the `ETag` of `/_contract` and sent by the generated client on every request. If the server's contract has changed, the request is refused with `A2005` (`CONTRACT_MISMATCH`) and the client throws `ContractMismatchError`:

```text
Generated client contract does not match the server. Regenerate the client.
```

Details and the regenerate workflow: [Contract hash](/docs/contract-hash).

## Where to go next

| To learn | Read |
|---|---|
| What each layer sees, and how to restrict | [Contract layers](/docs/contract-layers) |
| Every operation, with an example | [Resources and operations](/docs/resources-and-operations) |
| How results are typed | [Results and typing](/docs/results-and-typing) |
| Identity, ETag and stale clients | [Contract hash](/docs/contract-hash) |
| Changing what each layer exposes | [Configuration](/docs/configuration) |
| The query language | [Querying](/docs/querying) |

See also: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Restricting operations](/docs/restricting-operations), [Pipelines](/docs/pipelines), [Limits and safety](/docs/limits-and-safety).
