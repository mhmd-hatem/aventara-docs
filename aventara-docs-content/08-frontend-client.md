---
title: Frontend client
description: Overview of the generated, typed TypeScript client - what it is, how it fits your frontend, and where to read more.
order: 50
section: frontend
---

# Frontend client

`@aventara/client` is a **development-time generator**. It reads your deployed server's client contract and writes a standalone, typed TypeScript client into your project. The generated code imports nothing from `@aventara/client` or `@aventara/core` at runtime, so `@aventara/client` stays a dev dependency.

```ts
import avClient from "./api/AvClient";

const users = await avClient.User.find.many({ where: { email: { contains: "example.com" } } });
```

Calls resolve to the data (a record, a list, a count; a first-style miss is `null`) and everything else throws a typed error. Only what your server advertises exists on the client, in the type and at runtime.

## In this section

| Page | Read it for |
|---|---|
| [Client setup](/docs/client-setup) | `avclient init`, `framework.client.ts`, how to import the client, Vite, Next.js, Node and CORS |
| [Typed calls](/docs/typed-calls) | `avClient.User.find.many`, named types, readonly results, typing helpers |
| [Client errors](/docs/client-errors) | The error classes and how to handle them |
| [Client options](/docs/client-options) | `new AvClient({ entrypoint, fetch })`, `CallOptions`, authentication, aborting |
| [Keeping in sync](/docs/keeping-in-sync) | Regenerating, "up to date", CI checks, what a stale client does |

For the query language itself see [Querying](/docs/querying); for atomic multi-step writes see [Transactions](/docs/transactions).

## See also

- [Getting started](/docs/getting-started)
- [CLI reference](/docs/cli-reference)
- [HTTP protocol](/docs/http-protocol), for calling the API without the generated client
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics), [Upgrading](/docs/upgrading)
