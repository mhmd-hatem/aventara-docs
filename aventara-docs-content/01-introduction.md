---
title: Introduction
description: What Aventara is, how its pieces fit together, its current status and requirements.
order: 1
section: get-started
---

# Introduction

Aventara is a **contract-driven API framework** for TypeScript. You describe your data once, in a Prisma schema, and Aventara turns it into a typed HTTP API and a typed frontend client:

1. **Your ORM schema and your Aventara configuration compile into contracts.** A contract is plain, serializable data that says exactly which Resources exist, which fields can be read, filtered, ordered or written, and which operations are available.
2. **A NestJS host serves a typed HTTP protocol** built from those contracts: `find`, `create`, `update`, `delete` and `upsert` operations for every Resource, plus transactions and a `GET /_contract` discovery endpoint.
3. **A generator writes a typed client for your frontend** from the deployed contract. Arguments and results are typed by the contract, so the frontend and the server agree by construction.

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

- A complete CRUD-and-more API for every Prisma model, with no controllers to write.
- A rich, typed query language: filters, relation filters, `select`/`include`, ordering, pagination, nested counts and nested writes. Result types follow your `select` exactly ([Results and typing](/docs/results-and-typing)).
- Interactive transactions with references between steps (`$ref`) ([Transactions](/docs/transactions)).
- Restrictions per [contract layer](/docs/contract-layers): hide fields, make fields write-only, switch operations off for the frontend only, and add guards and hooks as pipelines.
- A generated frontend client with typed errors. It does not depend on any Aventara package at runtime ([Frontend client](/docs/frontend-client)).
- A stable response envelope with machine-readable codes (`A1000`, `A2003`, `V1005`, ...).
- A stale client is detected, not guessed at: the server refuses a client generated from an older contract with `A2005`. See [Contract hash](/docs/contract-hash).

## Packages

Which package goes where, and which are dev or runtime dependencies, is on [Installation](/docs/installation#packages). In short:

| Package | Purpose |
|---|---|
| `@aventara/cli` | The `aventara` command that scaffolds a server (`aventara new`, `aventara init`). Run once; not a dependency of your project. |
| `@aventara/core` | The framework: configuration, contract compilation, validation, execution, transactions. Also `@aventara/core/protocol`, the HTTP protocol as plain data and functions. |
| `@aventara/prisma7-adapter` | The Prisma 7 adapter (SQLite and PostgreSQL). |
| `@aventara/nest` | Hosts a framework in NestJS 12 on Express or Fastify. |
| `@aventara/client` | The `avclient` generator for your frontend (a dev dependency). |
| `@aventara/testing` | Conformance fixtures for adapters and hosts. |

## Status

Aventara is in **pilot**. The current release is `0.1.0-pilot.3`, published under the `pilot` dist-tag. Install with `@pilot`, as the commands in these docs do (the `latest` tag is not guaranteed to point at the newest pilot):

```bash
npx @aventara/cli@pilot new my-api
```

The public API **may change before 1.0**. Below 1.0, a minor version can be a breaking change. Pin exact versions (the generated projects already do).

## Requirements

The short version (the full table and notes are on [Installation](/docs/installation#requirements)):

| | Supported |
|---|---|
| Node.js | `^22.18.0 \|\| >=24.2.0` (on Node 22 use npm 11 or newer) |
| NestJS | 12 |
| ORM | Prisma `>=7.10 <8` (Prisma 7 only) |
| Database | SQLite or PostgreSQL |
| Package manager | npm or pnpm (yarn is not supported) |
| TypeScript | Server: 6 (`<7`). Frontend client generator: `>=5.5.0`, TypeScript 7 included |

## Where to go next

- [Why Aventara](/docs/why-aventara): the same feature written with plain NestJS, GraphQL, tRPC and Aventara, and the tradeoffs.
- [Installation](/docs/installation): requirements and what each package is for.
- [Getting started](/docs/getting-started): a running API and a typed call in a few minutes.
- [Add to an existing project](/docs/existing-project): `aventara init` on a NestJS 12 project.
- [Concepts](/docs/concepts): contracts, Resources, operations, results.
- [License](/docs/license): free to use, including in commercial applications.

See also: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Authentication and guards](/docs/authentication-and-guards), [Deploying](/docs/deploying).
