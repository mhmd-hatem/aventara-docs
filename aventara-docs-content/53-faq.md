---
title: FAQ
description: Common questions - how Aventara compares with tRPC and GraphQL, using it without Nest, hiding fields, the generated client and the license in plain terms.
order: 92
section: about
---

# FAQ

## How is this different from tRPC?

tRPC shares TypeScript types between a server and a client by having you write procedures. Aventara has you write no procedures: the API (every Resource and operation) is derived from your Prisma schema and your configuration, compiled into a contract, and the client is generated from that contract. You trade hand-written endpoints for a fixed, standard set of operations with a rich query language. Choose tRPC when your API is mostly bespoke procedures; Aventara when it is mostly your data model. Business logic that does not fit `find`, `create`, `update`, `delete`, `upsert` and transactions still belongs in your own NestJS code, next to Aventara.

## How is this different from GraphQL?

GraphQL has a schema, but you write resolvers, and clients send query documents the server must interpret. Aventara needs no resolvers: the operations are standard, and a client's request is plain JSON arguments (`where`, `select`, `include`, ...) validated against the contract. Every operation is a `POST` to a predictable URL, so requests are easy to log and rate-limit. A client generated for one contract is refused (`A2005`) by a server whose contract changed, so it never sends queries the server may now misread.

## Can I use Aventara without NestJS?

Yes, for the framework itself. `@aventara/core` is transport-agnostic and `@aventara/core/protocol` is the HTTP protocol as plain data and functions. `framework.application.User.find.many(...)` runs with no HTTP at all, and `AvProtocol.bind(framework)` lets you serve the protocol from any server; [HTTP protocol](/docs/http-protocol#custom-hosts-with-aventaracoreprotocol) has a complete Express example that runs, and [Custom hosts](/docs/custom-host) goes further. The scaffolding (`aventara new` / `init`) and the ready-made host are NestJS 12 only today.

## Which databases and ORMs?

Prisma 7 on SQLite or PostgreSQL. More adapters are planned ([Roadmap](/docs/roadmap)); each ORM major is its own adapter package.

## Can I hide fields from the frontend?

Yes, per layer. A field hidden in the `client` layer (`exemptions: { resources: { User: { fields: { internalNotes: true } } } }`) does not exist for remote callers: not in the contract, the generated types, inputs, outputs, filters, ordering or nested projections. A field can also be made write-only (settable but never readable, filterable or orderable), which suits `passwordHash`. Your own server code can still read it through `framework.application`. See [Exposure](/docs/exposure) and [Contract layers](/docs/contract-layers).

## Can I turn operations off?

Yes: `exemptions: { resources: { <Resource>: { operations: { <family>: ["<variant>"] } } } }`, at the root or only in the `client` overlay ([Exposure](/docs/exposure#operations)). A switched-off operation has no route and no method in the generated client.

## Where does authentication go?

In [pipelines](/docs/config-reference#pipelines): guards that read request headers and return `false` or throw `A4000` / `A4001` / `A4002`. Nest guards, interceptors and pipes do not run on Aventara routes, and neither does `@nestjs/throttler`; for rate limiting see [Limits and safety](/docs/limits-and-safety#rate-limiting).

## Can a write update other rows in the same transaction?

Yes. Set `forceTransaction` on the operation and write the other rows from an after hook through `ctx` (`ctx.Post.update.unique(...)`, `ctx.$sql`...). The hook runs inside the operation's transaction, so both commit or neither does. [The pipeline context](/docs/pipeline-context) has an outbox and a likes-counter recipe.

## Can I run my own SQL?

From server code, yes: `framework.appTx.$sql` adds a SQL step to an application transaction, and `ctx.$sql` runs one from a pipeline stage. Both are tagged templates whose values are bound parameters. No remote caller can send SQL ([Transactions](/docs/transactions#sql-steps-apptxsql)).

## Is the generated client a runtime dependency?

No. `@aventara/client` is a dev dependency that writes TypeScript source into your project. The generated code imports nothing from `@aventara/client` or `@aventara/core`; commit it and ship it as your own code.

## What happens when I change my schema?

The contract's hash changes. A client generated before the change is refused with `A2005` (`AvContractMismatchError`) rather than misbehaving. Regenerate with `npm run avclient:generate`. See [Contract hash](/docs/contract-hash) and [Keeping in sync](/docs/keeping-in-sync).

## Why are reads `POST` requests?

Arguments are structured JSON (nested filters, projections), which does not fit a query string, and one rule for every operation keeps the protocol small. The contract is the only `GET`.

## Can anyone call my database through this?

Only what the client contract advertises, only with the arguments it allows, and only past your guards. Limits bound how much a caller can ask for (list size, nesting depth, body size). It is still your responsibility to add authentication; Aventara does not authenticate for you.

## Can I use it in production?

It is a release candidate (`1.0.0-rc.11`): until 1.0 the API can still change, breaking changes included (`1.0.0-rc.1` reshaped the configuration), and every change is listed in the Changelog with its upgrade steps. Pin exact versions and read the [Changelog](/docs/changelog) before upgrading.

## The license, in plain terms

Aventara is source-available under PolyForm Shield 1.0.0 with an additional permission.

- Using it for free, including in commercial products, is allowed. Your API, your SaaS, internal tools, client work.
- Modifying and redistributing it is allowed, keeping the license text and the `Required Notice` line.
- Not allowed: offering a product that competes with Aventara itself (the framework, its packages and its tooling), for example repackaging it and selling it as a framework.
- Writing your own framework is fine, and so is building a product with Aventara that competes with other products in the market.
- The name: don't present Aventara as your own, and don't publish under `@aventara`. "Built with Aventara" is welcome.

The texts are what binds; this is a summary, not legal advice. See [License](/docs/license).

See also: [Exposure](/docs/exposure), [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Authentication and guards](/docs/authentication-and-guards), [Limits and safety](/docs/limits-and-safety).
