---
title: Next.js host
description: Serve Aventara from a Next.js App Router app with @aventara/next - scaffold or init, the src/aventara folder, Aventara() and its four members, request state, the three clients, serverExternalPackages and MCP.
order: 65
section: hosting
---

# Next.js host

`@aventara/next` hosts a framework inside a Next.js App Router app. One catch-all route file serves the API, and your Server Components, Server Actions and Client Components call it through typed clients. There is no separate server to deploy and no frontend to point at it.

It needs Next.js `>=16.4 <17` on the Node.js runtime, and React 19. The protocol's rules (routes, statuses, envelopes, headers) are the same as on any host: see [HTTP protocol](/docs/http-protocol).

The App Router only: the Pages Router is not supported.

## Create an app

```bash
npx @aventara/cli@rc new my-app --host next
```

It runs `create-next-app@latest` (TypeScript, the App Router under `src/`, the `@/*` alias), adds Aventara, installs everything and commits. create-next-app asks its own questions on your terminal. `--yes` takes its defaults, and a run without a terminal needs `--yes`. Pass create-next-app's own flags after `--`:

```bash
npx @aventara/cli@rc new my-app --host next --yes -- --tailwind
```

The other flags are the ones a NestJS project takes (`--orm`, `--db`, `--package-manager`, `--skip-install`, `--skip-git`, `--yes`, `--verbose`); see the [CLI reference](/docs/cli-reference#flags). The run ends with the next steps:

```text
Next:
  1. Enter the project: cd my-app
  2. Create the database tables: npx prisma db push
  3. Start the app: npm run dev
  4. Call the API with curl: see "Calling the API over HTTP" in .claude/skills/aventara/SKILL.md
```

With the app running, `GET http://localhost:3000/api/_contract` answers.

### Add it to an existing app

```bash
npx @aventara/cli@rc init
```

`init` tells NestJS and Next.js apart by `package.json`: a project that depends on `next` is a Next.js app. A project that depends on both `next` and `@nestjs/core`, or on neither, is refused in one sentence and nothing is written. The app must use the App Router under `src/app/`, map `@/*` to `./src/*` in `tsconfig.json` (create-next-app writes both), and have no ORM yet.

## What it writes

Everything Aventara is in one folder, `src/aventara/`:

| Path | What it is | Owner |
|---|---|---|
| `src/aventara/config.ts` | `aventaraConfig`: the configuration, a plain value `as const` with no adapter | you |
| `src/aventara/adapter.ts` | the adapter's description, `describePrismaAdapter(...)` | you |
| `src/aventara/server.ts` | `Aventara({...})`, exporting `handlers`, `avClient`, `avApp` and `ready`. Import it as `@/aventara/server` | you |
| `src/app/api/[...aventara]/route.ts` | the catch-all route file: every method of `handlers` | you |
| `src/instrumentation.ts` | awaits `ready()` when the server starts | you |
| `src/prisma.ts` | `prisma()`, the app's one Prisma client, made on first use | you |
| `prisma/schema.prisma`, `prisma.config.ts` | the schema (a `User` model) and Prisma's config | you |
| `next.config.ts` | gains `serverExternalPackages` ([below](#serverexternalpackages)) | you |
| `src/aventara/client.ts` | `@/aventara/client`: the browser client | generated |
| `src/aventara/universal.ts` | `@/aventara/universal`: the client for code that runs on both sides | generated |
| `src/aventara/generated/` | the discovery artifact, the Contracts and the client's modules | generated |

The generated files are in `.gitignore`. Never edit them. An `instrumentation.ts` of your own is never replaced: `init` prints the lines to add.

`package.json` gets `@aventara/core`, `@aventara/next`, `@aventara/prisma7-adapter`, `@aventara/build` (a dev dependency), `server-only` and Prisma, and the `aventara:prepare` script, which `postinstall` and `prebuild` run.

There is no CORS setup (the browser calls the same origin), no Pages Router, no proxy file and no MCP route. You add an MCP route yourself ([below](#mcp)).

## aventara:prepare

`aventara:prepare` runs the adapter's generate step, then `aventara-build --client`:

```text
aventara-prisma7-generate --schema prisma/schema.prisma --client src/generated/prisma --provider sqlite --driver @prisma/adapter-better-sqlite3 --out src/aventara/generated/discovery.artifact.ts --config src/aventara/config.ts && aventara-build --client
```

`aventara-build` compiles the Contracts from `src/aventara/config.ts` and `src/aventara/adapter.ts`, and `--client` writes the browser client from the ClientContract it just compiled. No server has to run. It runs on every install and before every `next build`, so after a schema change you run your migration and `npm run aventara:prepare`, then restart `next dev`. The browser client changes with it: there is no separate frontend to regenerate.

`aventara-build --check --client` writes nothing and exits `1` when a generated file is missing or stale. Run it in CI. See the [CLI reference](/docs/cli-reference#aventara-build).

## The server entry

```ts
// src/aventara/server.ts
import "server-only";
import { Aventara } from "@aventara/next";
import { createPrismaAdapter } from "@aventara/prisma7-adapter";
import { prisma } from "../prisma";
import adapter from "./adapter";
import { aventaraConfig } from "./config";
import { aventaraContracts } from "./generated/contracts.generated";

export const { handlers, avClient, avApp, ready } = Aventara({
  ...aventaraConfig,
  // Built on first use, never when a module is imported.
  adapter: () => createPrismaAdapter({ ...adapter, client: prisma() }),
  // In production, the Contracts aventara:prepare compiled; in development they compile at startup.
  prebuilt: process.env.NODE_ENV === "production" ? aventaraContracts : undefined,
});
```

`Aventara()` takes everything `createFramework` takes, flat, checked the same way, plus two host options:

| Option | What it is |
|---|---|
| `adapter` | The adapter, or a function that builds it. The function may return a promise, and it runs once, on first use. |
| `state` | `({ headers, request }) => state`: seeds each request's `ctx.$state` ([Request state](#request-state)). |

`Aventara()` returns at once and builds nothing. `next build` imports this module, so nothing may connect at import time. The framework is built on the first request, or by `ready()`, once.

It returns four members:

| Member | What it is |
|---|---|
| `handlers` | `{ GET, POST, PUT, PATCH, DELETE }` for the catch-all route file |
| `avClient` | The client layer for Server Components and Server Actions, in process. `avClient.tx` and `avClient.transaction([...])` |
| `avApp` | The application layer, for trusted server code. `avApp.appTx` and `avApp.transaction([...])` |
| `ready` | `() => Promise<void>`: builds the framework once, and rejects with its construction error |

### The route file

```ts
// src/app/api/[...aventara]/route.ts
import { handlers } from "@/aventara/server";

export const { GET, POST, PUT, PATCH, DELETE } = handlers;
```

The folder must match `api`: `api: "/api"` is `src/app/api/[...aventara]/route.ts`. `handlers` answers the operation routes, `GET /api/_contract` (with its `ETag`, and `304` on `If-None-Match`) and `POST /api/_transactions` when transactions are interactive. Every method is exported so that a wrong method gets the protocol's `405` (`A2012`) with `Allow`. A path the protocol does not own goes to Next's `notFound()`.

A request body is read up to `limits.maxRequestBytes` decoded bytes. `gzip`, `deflate` and `br` bodies are inflated, and any other content coding is `415` (`A2011`).

### Startup: `instrumentation.ts`

```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ready } = await import("@/aventara/server");
    await ready();
  }
}
```

`ready()` builds the framework when the server starts. A configuration `createFramework` would refuse fails `next start` with its `AvConstructionError`, instead of failing the first request. A second call returns the same promise. It reads no request, so it runs where there is none.

Keep this file. `ready()` also does two things the app relies on:

- It registers the in-process path `@/aventara/universal` takes on the server. Without it, a universal call on the server is refused ([The three clients](#the-three-clients)).
- `avClient.tx` and `avApp.appTx` build handles on the built framework. Before it is built they throw `` `await ready()` before building them ``.

### A framework you built

To build the framework yourself, with `createFramework`, pass it as `framework`. This is the same as `AventaraModule.forRoot({ framework })` in NestJS:

```ts
// src/aventara/server.ts
import "server-only";
import { createFramework } from "@aventara/core";
import { Aventara } from "@aventara/next";
import { createPrismaAdapter } from "@aventara/prisma7-adapter";
import { prisma } from "../prisma";
import adapter from "./adapter";
import { aventaraConfig } from "./config";

const framework = await createFramework({
  ...aventaraConfig,
  adapter: await createPrismaAdapter({ ...adapter, client: prisma() }),
});

export const { handlers, avClient, avApp, ready } = Aventara({ framework });
```

`state` can sit beside `framework`. Every member works on that framework, which is never built again. A configuration key beside `framework` is a type error, and `Aventara()` refuses it when called, naming the keys. So is a `framework` that is not an Aventara framework. `ready()` still checks it (see [Errors](/docs/next-api-reference#errors)) and registers the universal path.

In this form the framework is built when the module is first imported, `next build` included. Prefer the configuration form unless you need the framework object yourself.

## Request state

`state` seeds `ctx.$state`, the object every stage of a request reads and writes: the signed-in user, for example, which guards and a [policy](/docs/policies#where-the-principal-comes-from) read.

```ts
// src/aventara/server.ts
import "server-only";
import { Aventara } from "@aventara/next";
import { createPrismaAdapter } from "@aventara/prisma7-adapter";
import { userOf, type User } from "@/auth/session"; // your auth library
import { prisma } from "../prisma";
import adapter from "./adapter";
import { aventaraConfig } from "./config";

declare module "@aventara/core" {
  interface AvState {
    user?: User | null;
  }
}

export const { handlers, avClient, avApp, ready } = Aventara({
  ...aventaraConfig,
  adapter: () => createPrismaAdapter({ ...adapter, client: prisma() }),
  state: async ({ headers }) => ({ user: await userOf(headers.get("authorization")) }),
});
```

It is called with `{ headers, request? }`:

| Where the call comes from | `headers` | `request` | How often `state` runs |
|---|---|---|---|
| A request to `handlers` (the browser client, curl) | the request's | the route's `Request` | once per request |
| `avClient` in a Server Component | from `next/headers` | none | once per server render, however many calls the render makes |
| `avClient` in a Server Action or a route handler of your own | from `next/headers` | none | once per call |
| `@/aventara/universal` on the server | from `next/headers` | none | as `avClient` above |

Without `state`, every request starts from `{}` and no headers are read. A call that passes its own `state` in its options uses it as given. With or without `state`, a call runs at request time: see [Server Components and Server Actions](#server-components-and-server-actions).

A `state` that is not a function is refused when `Aventara()` is called. Throw `new AvError("A4001", "...")` from `state` to refuse a request (`403`); any other throw is `500` `A3000`.

### An access provider

Instead of `policy` and `state`, a framework can take `access`: one object that holds the policy engine and the `state` function. Its `state` gets the same `{ headers, request? }`. See [Policies](/docs/policies#an-access-provider).

```ts
// src/aventara/server.ts (tillAccess is an AvAccessProvider)
export const { handlers, avClient, avApp, ready } = Aventara({
  ...aventaraConfig,
  adapter: () => createPrismaAdapter({ ...adapter, client: prisma() }),
  access: tillAccess,
});
```

`state` beside `access` is refused when `Aventara()` is called, and is a type error. `Aventara({ framework })` uses the access provider of a framework built with `access`.

## The three clients

| Import | Where it runs | Layer | How it calls | Use it for |
|---|---|---|---|---|
| `avClient` from `@/aventara/server` | server only | client | in process, no HTTP | Server Components, Server Actions, your own route handlers |
| `avApp` from `@/aventara/server` | server only | application | in process | trusted server code: jobs, seeding, admin actions |
| `avClient` from `@/aventara/client` | browser only | client | `fetch` to `/api` | Client Components: event handlers, effects, `useQuery` |
| `avClient` from `@/aventara/universal` | both | client | `/api` in the browser, in process on the server | code shared by both sides, such as a prefetched query |

All three `avClient`s run the client layer: the same exposure, client pipelines, validation and policy as a request from a browser. `avApp` is the application layer, and the policy checks it only when a call names a principal (`{ as: user }`).

### Server Components and Server Actions

```tsx
// src/app/posts/page.tsx
import { Suspense } from "react";
import { avClient } from "@/aventara/server";

async function Posts() {
  const posts = await avClient.Post.find.many({
    where: { publishedAt: { lt: new Date() } },
    select: ["id", "title", "publishedAt"],
  });
  return <ul>{posts.map((post) => <li key={post.id}>{post.title}</li>)}</ul>;
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Posts />
    </Suspense>
  );
}
```

A call reads the database, so it runs at request time: every `avClient`, `avApp` and `@/aventara/universal` call first awaits Next's `io()`. Under `cacheComponents` (create-next-app's default), a page that calls one needs one of three things: `<Suspense>` around the component that makes the call (or a `loading.tsx`), as here; `"use cache"` on a function that makes the call, which caches the result for every visitor; or `export const instant = false`, which renders the whole page at request time. Without one, `next build` fails with Next's own message, which names the three. `connection()` is not needed. A refusal is thrown as its error class: a policy refusal is `AvAuthError`, a guard's `AvError("A4000", ...)` is `AvAuthError` too. `@/aventara/server` and `@/aventara/config` import `server-only`, so a Client Component that imports either fails `next build`.

A Server Action, with a transaction:

```ts
// src/app/posts/actions.ts
"use server";
import type { Post } from "@/aventara/client";
import { avClient } from "@/aventara/server";

export async function publish(id: Post["id"]) {
  const publish = avClient.tx.Post.update.unique({
    where: { id },
    data: { published: true, publishedAt: new Date() },
    select: ["id"],
  });
  const count = avClient.tx.Post.find.count({ where: { published: true } });
  const [, published] = await avClient.transaction([publish, count]);
  return published;
}
```

Transactions keep their layer. `avClient.tx` builds client-layer handles and `avClient.transaction` runs them with this request's state. `avApp.appTx` builds application handles (and `avApp.appTx.$sql`) and `avApp.transaction` runs them. A list that mixes the two is a type error, and is refused at runtime (`A2004`). See [Transactions with $ref](/docs/transactions-with-ref).

### Client Components

```tsx
// src/app/posts/new-post.tsx
"use client";
import { useState } from "react";
import { avClient, type User } from "@/aventara/client";

export function NewPost({ authorId }: { readonly authorId: User["id"] }) {
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await avClient.Post.create.one({ data: { title, authorId }, select: ["id"] });
      }}
    >
      <input value={title} onChange={(event) => setTitle(event.target.value)} />
    </form>
  );
}
```

`@/aventara/client` exports `avClient`, `avHydrate`, your Resource types, enums, `AvDecimal` and the error classes, as the client `avclient generate` writes does ([Client API reference](/docs/client-api-reference)).

A Client Component renders on the server first. A call to `@/aventara/client` made while it renders there sends nothing and is refused:

```text
avClient from @/aventara/client runs in the browser only, and this call ran on the server, where a Client Component renders first: on the server, call avClient from @/aventara/server, or from @/aventara/universal for data the browser then hydrates.
```

Calls in event handlers, `useEffect` and `useQuery` run in the browser and never meet this. In code that must also run on the server, import `@/aventara/universal`. Importing `@/aventara/client` there is a deliberate choice: those calls never run on the server.

### `@/aventara/universal`

The universal `avClient` has the browser client's types. In the browser it calls `/api`. On the server it answers the same request in process, with the request's `state`, through the path `ready()` registered. A query prefetched in a Server Component and refetched in the browser gets the same values. [TanStack Query and SWR](/docs/tanstack-query-and-swr) shows the whole pattern. On the server it waits for the request as `avClient` does, so a component that calls it while a page prerenders needs the same `<Suspense>`, `"use cache"` or `instant = false`.

On a server where `ready()` never ran (no `instrumentation.ts`), a universal call is refused:

```text
avClient from @/aventara/universal ran on the server, where it calls this app in process through what ready() registers, and nothing is registered: export register() from src/instrumentation.ts and, when process.env.NEXT_RUNTIME is "nodejs", await ready() from @/aventara/server there.
```

### One value model

All three clients take and return application values, on both sides:

| Prisma type | Value |
|---|---|
| `DateTime` | `Date` |
| `BigInt` | `bigint` |
| `Decimal` | `AvDecimal` (from `@aventara/core` on `@/aventara/server`; the client's own from `@/aventara/client` and `@/aventara/universal`) |
| `Bytes` | `Uint8Array` |
| `Json` | the JSON value |

React can pass a `Date` and a `bigint` from a Server Component to a Client Component, but not an `AvDecimal`, which is a class instance. `avDehydrate` from `@aventara/next` turns each `Date`, `bigint`, `Uint8Array` and decimal into a tagged plain object, and `avHydrate` from `@/aventara/client` turns them back. See [TanStack Query and SWR](/docs/tanstack-query-and-swr).

### Several calls at once: `avClient.all`

The server's `avClient` has `all`, as the browser's does: an object of calls, one typed value per key, in process.

```tsx
// src/app/dashboard/page.tsx
import { avLazy } from "@aventara/core";
import { avClient } from "@/aventara/server";

export default async function Dashboard() {
  const { recent, drafts } = await avClient.all({
    recent: avClient.Post.find.many({ select: ["id", "title"], limit: 5 }),
    drafts: avLazy(() => avClient.Post.find.count({ where: { published: false } })),
  });
  return <p>{recent.length} recent posts, {drafts} drafts</p>;
}
```

A plain call starts when you make it; `avLazy(() => call)` lets `all` start it, at most `limits.maxAllConcurrency` at once. On the server `all` takes any number of calls (`limits.maxAll` guards `POST /_all` only), and nothing is grouped: each call runs on its own in the request that made it. That holds for `@/aventara/universal` too: it groups calls in the browser only. On the server, `avLazy` keeps no answer: awaited again, it calls again. More: [Several operations in one round trip](/docs/operation-sets).

### Caching reads

A [`cache` stage](/docs/caching-reads) on a read lets the browser or a CDN keep its answer: the generated client sends it as a `GET`, and `handlers` answer it with the caching headers. React also exports a `cache`, for memoizing a function within a render. When one module needs both, import Aventara's under the `av` prefix:

```ts
// src/aventara/config.ts
import "server-only";
import { cache as avCache } from "@aventara/core";

export const aventaraConfig = {
  api: "/api",
  resources: {
    Category: { pipelines: { cache: avCache({ for: "everyone", maxAge: 300 }) } },
  },
} as const;
```

The stage sets HTTP headers only. It does not store anything on the server, and it has nothing to do with Next's `"use cache"` or `unstable_cache`.

## `serverExternalPackages`

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@aventara/core", "@aventara/prisma7-adapter"],
};

export default nextConfig;
```

Keep this line. Next.js bundles a package into each layer of the server (instrumentation, route handlers, Server Components) as a copy of its own. Listed here, Node.js loads `@aventara/core` and the adapter once per server process instead: one core and one Prisma client for every route and page.

`aventara new --host next` and `init` add the line to create-next-app's config, or to any config whose `const nextConfig = {` object has no `serverExternalPackages`. An app with no config gets a `next.config.ts`. A config that already lists `serverExternalPackages`, or is written another way, is never changed: the line to add is printed, with a warning. Add the two names to your list yourself.

`@aventara/next` itself stays bundled: it relies on Next.js's server aliases (`next/navigation`, `next/headers`, `server-only`).

## One framework per `api` path

Next.js evaluates `src/aventara/server.ts` more than once in one server process: once for `instrumentation.ts`, again for the routes and pages. Every copy that calls `Aventara()` with the same options shares one framework, held per `api` path for the process. So `ready()` in `instrumentation.ts` builds the framework the routes use, with one adapter, and `avClient.tx` works from the first request.

- Two `Aventara()` calls on two `api` paths hold two frameworks. Each needs its own route folder.
- In production, a different configuration on a path already held is refused when `Aventara()` is called: `` Aventara: another configuration already serves the `api` path /api in this process; give each Aventara() its own `api` path. ``
- In development the new configuration replaces the held one, because `next dev` evaluates the file again after an edit.
- A framework passed as `{ framework }` belongs to that call only.

## MCP

With `mcp` in the configuration, the same `handlers` serve [`@aventara/mcp`](/docs/mcp)'s endpoint and its OAuth protected-resource metadata. On Next.js, `mcp` needs `authorization`:

```ts
// src/aventara/server.ts (verify: your token check, as on the MCP page)
export const { handlers, avClient, avApp, ready } = Aventara({
  ...aventaraConfig,
  mcp: {
    path: "/mcp",
    authorization: { servers: ["https://auth.example.com"], verify },
  },
  adapter: () => createPrismaAdapter({ ...adapter, client: prisma() }),
});
```

Add one route file per path:

```ts
// src/app/mcp/route.ts
import { handlers } from "@/aventara/server";

export const { GET, POST, DELETE } = handlers;
```

```ts
// src/app/.well-known/oauth-protected-resource/mcp/route.ts
import { handlers } from "@/aventara/server";

export const { GET } = handlers;
```

Install `@aventara/mcp` at your `@aventara/core` version (`npm install --save-exact @aventara/mcp@<version>`). It is loaded only when `mcp` is configured. When it is missing, the first request fails with a sentence that names the install command.

Why `authorization` is required: without it, the endpoint answers only callers on the same machine that send no `x-forwarded-for`, and Next.js adds that header to every request. So an `mcp` without `authorization` is a type error on the `Aventara({...})` call, and a configuration typed as `AvConfig` that has none is refused when the framework is built.

The endpoint's metadata and its `401` name the endpoint at the origin the agent called: `X-Forwarded-Host` and `X-Forwarded-Proto` when present, else `Host`. The rest is `@aventara/mcp`'s, as on NestJS: [MCP](/docs/mcp).

## What is not here yet

- Caching helpers for Next.js's cache come in a later release.
- The Pages Router is not supported.
- Only the Node.js runtime. The Edge runtime is not supported.

## See also

- [Next.js API reference](/docs/next-api-reference): every export, option and error.
- [TanStack Query and SWR](/docs/tanstack-query-and-swr): prefetch on the server, hydrate in the browser.
- [Server-side usage](/docs/server-side-usage): `serverClient`, `application`, call options.
- [Policies](/docs/policies) and [Authentication and guards](/docs/authentication-and-guards).
- [Deploying](/docs/deploying#nextjs).
