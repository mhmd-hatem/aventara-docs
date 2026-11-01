---
title: Introduction
description: What Aventara is, how its pieces fit together, its current status and requirements.
order: 1
section: get-started
---

# Introduction

Aventara is a contract-driven API framework for TypeScript. You describe your data once, in a Prisma schema, and Aventara turns it into a typed HTTP API and a typed frontend client:

1. Your ORM schema and your Aventara configuration compile into contracts. A contract is plain, serializable data that says exactly which Resources exist, which fields can be read, filtered, ordered or written, and which operations are available.
2. A NestJS host serves a typed HTTP protocol built from those contracts: `find`, `create`, `update`, `delete` and `upsert` operations for every Resource, plus transactions and a `GET /_contract` discovery endpoint.
3. A generator writes a typed client for your frontend from the deployed contract. Arguments and results are typed by the contract, so the frontend and the server work from the same contract.

```text
 schema.prisma + aventara.config.ts
              │  compile
              ▼
          contracts ───────────────►  GET /api/_contract
              │                                │
   NestJS host serves the protocol             │ avclient generate
   POST /api/_resources/User/find/many         ▼
              ▲                         typed AvClient (frontend)
              └──────── HTTP ──────────  avClient.User.find.many(...)
```

## What you get

- `find`, `create`, `update`, `delete` and `upsert` for every Prisma model, with no controllers to write.
- A typed query language: filters, relation filters, `select`/`include`, ordering, pagination, nested counts and nested writes. Result types follow your `select` exactly ([Results and typing](/docs/results-and-typing)).
- Interactive transactions with references between steps (`$ref`) ([Transactions](/docs/transactions)).
- [Exposure](/docs/exposure) per [contract layer](/docs/contract-layers): hide fields, make fields write-only, switch operations off for the frontend only, or expose only what the frontend calls.
- [Pipelines](/docs/pipelines) at every level (the layer, a Resource, an operation family or variant, a field): guards, pipes, hooks, interceptors and filters, with hooks that can [write other rows in the same transaction](/docs/pipeline-context). [Which stage do I use?](/docs/which-stage) says which one fits a task.
- [Field validators](/docs/field-validators) written with `AvZ` (`maxLength`, `gte`, `email`, ...), checked by the server and by the generated client before it sends.
- A generated frontend client with typed errors. It does not depend on any Aventara package at runtime ([Frontend client](/docs/frontend-client)).
- Typed `Json` fields: declare a shape once and every write is checked and the field is typed in server code and in the generated client ([JSON fields](/docs/json-fields)).
- A stable response envelope with machine-readable codes (`A1000`, `A2003`, `V1005`, ...).
- The server refuses a client generated from an older contract with `A2005`. See [Contract hash](/docs/contract-hash).

## Packages

Which package goes where, and which are dev or runtime dependencies, is on [Installation](/docs/installation#packages). In short:

| Package | Purpose |
|---|---|
| `@aventara/cli` | The `aventara` command that scaffolds a server (`aventara new`, `aventara init`). Run once; not a dependency of your project. |
| `@aventara/core` | The framework: configuration, contract compilation, validation, execution, transactions. Also `@aventara/core/protocol`, the HTTP protocol as plain data and functions, and `@aventara/core/avz`, the `AvZ` builder for typed JSON fields and field validators. |
| `@aventara/prisma7-adapter` | The Prisma 7 adapter (SQLite and PostgreSQL). |
| `@aventara/nest` | Hosts a framework in NestJS 12 on Express or Fastify. |
| `@aventara/mcp` | Serves your API to AI agents over MCP, mounted by `@aventara/nest` ([MCP](/docs/mcp)). |
| `@aventara/client` | The `avclient` generator for your frontend (a dev dependency). |
| `@aventara/testing` | Conformance fixtures for hosts and clients, and a fake adapter ([Testing and conformance](/docs/testing-and-conformance)). |

## Status

Aventara is a release candidate. The current release is `1.0.0-rc.12`, published under the `rc` dist-tag. Install with `@rc`, as the commands in these docs do, so you get the newest release candidate:

```bash
npx @aventara/cli@rc new my-api
```

Until 1.0, a release candidate can still change the public API, including breaking changes; `1.0.0-rc.1` reshaped the configuration ([Upgrading](/docs/upgrading#from-100-rc0-to-100-rc1)). Every change is listed in the [Changelog](/docs/changelog) with its upgrade steps. From 1.0 on, a breaking change needs a new major version. Pin exact versions (the generated projects already do) and read the [Changelog](/docs/changelog) before moving to the next release candidate.

## Easy for tools to work with

A script, an editor or a code assistant can read and change an Aventara project from facts the project states:

- Every answer has a stable code (`A2004`), and every validation issue has its own code, the exact path in the request, and for a failed field validator the check's name and parameters (`"check": "max_length", "params": { "maximum": 80 }`). A tool can fix the argument the issue points at without parsing a sentence. See [Error codes](/docs/error-codes).
- The configuration is one typed object with one shape at every layer, and everything about a Resource sits under `resources.<Resource>`. A misplaced or misspelled key is a type error at that key, and startup errors name the path and the fix (`restrictions moved in rc.1: use exposed + exemptions`).
- The frontend client is generated and typed: its types come from the deployed contract, so a wrong field, operator or operation is a compile error before it is a request, and the contract itself (`GET /api/_contract`) is plain JSON that describes every operation.
- `aventara new` and `aventara init` give your AI coding agent the project's rules as an agent skill, with an `AGENTS.md` section pointing to it. See [Working with AI agents](/docs/ai-agents).

## Requirements

The full table and notes are on [Installation](/docs/installation#requirements). In short:

| | Supported |
|---|---|
| Node.js | `^22.23.4 \|\| >=24.22.1` (on Node 22 use npm 11 or newer) |
| NestJS | 12 |
| ORM | Prisma `^7.10.1` (Prisma 7 only) |
| Database | SQLite or PostgreSQL |
| Package manager | npm or pnpm (yarn is not supported) |
| TypeScript | Server: 6 (`>=5.7.0 <7`). Frontend client generator: `>=5.7.0`, TypeScript 7 included |

## Where to go next

- [Why Aventara](/docs/why-aventara): the same feature written with plain NestJS, GraphQL, tRPC and Aventara, and the tradeoffs.
- [Installation](/docs/installation): requirements and what each package is for.
- [Getting started](/docs/getting-started): a running API and a typed call in a few minutes.
- [Add to an existing project](/docs/existing-project): `aventara init` on a NestJS 12 project.
- [Concepts](/docs/concepts): contracts, Resources, operations, results.
- [License](/docs/license): free to use, including in commercial applications.

See also: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Authentication and guards](/docs/authentication-and-guards), [Deploying](/docs/deploying).
