---
title: Next.js API reference
description: Every export of @aventara/next, the generated @/aventara/client and @/aventara/universal entries, Aventara() options and members, and the errors the Next.js host raises.
order: 89
section: reference
---

# Next.js API reference

The reference for [`@aventara/next`](/docs/nextjs-host) and the two entries `aventara-build --client` generates. For how to use them, see [Next.js host](/docs/nextjs-host) and [TanStack Query and SWR](/docs/tanstack-query-and-swr).

## Package

| | |
|---|---|
| Install | `npm install --save-exact @aventara/next@<your @aventara/core version>` (`aventara new --host next` and `init` add it) |
| Peers | `next` `>=16.4 <17`, `react` `^19`; `@aventara/mcp` optional, loaded only when `mcp` is configured |
| Runtime | Next.js App Router, Node.js runtime |
| Entry | `@aventara/next`, server-only: a Client Component that imports it fails `next build` |
| Exports | `Aventara`, `avDehydrate`; types `AvNextHandlers`, `AvNextClientTransaction`, `AvNextAppTransaction`, `AvNextStateContext` |

## `Aventara(options)`

Hosts a framework. It returns at once and builds nothing; the framework is built on first use, or by `ready()`, once.

```ts
export const { handlers, avClient, avApp, ready } = Aventara({
  ...aventaraConfig,
  adapter: () => createPrismaAdapter({ ...adapter, client: prisma() }),
  prebuilt: process.env.NODE_ENV === "production" ? aventaraContracts : undefined,
  state: async ({ headers }) => ({ user: await userOf(headers.get("authorization")) }),
});
```

### Options: a configuration

| Option | Type | Meaning |
|---|---|---|
| everything `createFramework` takes | | `api`, `resources`, `exposed`, `exemptions`, `pipelines`, `limits`, `policy`, `access`, `mcp`, `prebuilt`, `diagnostics`, ... Checked as `createFramework` checks them ([Configuration reference](/docs/config-reference)). |
| `adapter` | an adapter, or `() => adapter \| Promise<adapter>` | A function is called once, on first use, so nothing connects when `next build` imports the module. |
| `state` | `(context: AvNextStateContext) => AvState \| Promise<AvState>`, where `AvNextStateContext` is `{ headers, request? }` | Seeds each request's `ctx.$state`. `headers` is a `Headers`; `request` is the route's `Request`, present only on calls through `handlers`. Not together with `access`. |

On Next.js, `mcp` must carry `authorization` (`{ path, authorization: { servers, verify } }`). Written without it, it is a type error on the `Aventara({...})` call. A configuration typed as `AvConfig` compiles and is refused when the framework is built.

### Options: a framework you built

| Option | Type | Meaning |
|---|---|---|
| `framework` | `AvFramework` | What `createFramework` resolved to. It is never built again. |
| `state` | as above | Optional. Not together with a framework built with `access`. |

A configuration key beside `framework` is a type error, and refused when `Aventara()` is called.

### Members

| Member | Type | Meaning |
|---|---|---|
| `handlers` | `AvNextHandlers`: `{ GET, POST, PUT, PATCH, DELETE }`, each `(request: Request) => Promise<Response>` | For the catch-all route file at `app<api>/[...aventara]/route.ts`, and the MCP route files. |
| `avClient` | `framework.serverClient`, plus `tx` and `transaction` | The client layer, in process, with this request's `state`. |
| `avApp` | `framework.application`, plus `appTx` and `transaction` | The application layer, for trusted server code. |
| `ready` | `() => Promise<void>` | Builds the framework once; rejects with the construction error; registers the in-process path of `@/aventara/universal`. |

The types are exported so that a project emitting declarations (`declaration: true`) can write `export const { handlers, avClient, avApp, ready } = Aventara(...)` with no annotation. `avClient.transaction` is `AvNextClientTransaction` and `avApp.transaction` is `AvNextAppTransaction`. `AvNextStateContext` is the `state` option's parameter (`{ headers, request? }`), for a `state` function written in its own file.

### `avClient`

| Call | Meaning |
|---|---|
| `avClient.<Resource>.<family>.<variant>(args, options?)` | One operation. Typed from the Client Contract's view; arguments and results are application values (`Date`, `bigint`, `AvDecimal`, `Uint8Array`). |
| `avClient.tx.<Resource>.<family>.<variant>(args)` | A client-layer transaction handle (`framework.serverClientTx`). Built on the built framework. |
| `avClient.transaction([handles], options?)` | Runs `avClient.tx` handles as one transaction, with this request's state. Resolves to the results as a tuple. |
| `avClient.all({ key: call, ... }, { settle?, signal? })` | Awaits an object of calls together, in process, one typed value per key. Strict by default; `settle: true` gives `{ status, value }` or `{ status, reason }` per key. Takes any number of calls (`limits.maxAll` bounds `POST /_all` only) and starts its `avLazy` calls (`avLazy` from `@aventara/core`) at most `limits.maxAllConcurrency` at once. See [Several operations in one round trip](/docs/operation-sets#on-the-server-avclientall-in-process). |

`options` is `AvExecutionOptions`: `requestId`, `state` (used as given instead of the request's), `as` (the principal the policy checks). See [Server-side usage](/docs/server-side-usage#avexecutionoptions).

Each call first awaits Next's `io()`: under `cacheComponents`, a page that calls `avClient` or `avApp` needs `<Suspense>`, `"use cache"` or `export const instant = false` ([Next.js host](/docs/nextjs-host#server-components-and-server-actions)).

`state` runs once per server render, however many calls the render makes, and once per call outside a render (a Server Action, a route handler of your own). A refusal throws its `AvError` class ([Error codes](/docs/error-codes)).

### `avApp`

| Call | Meaning |
|---|---|
| `avApp.<Resource>.<family>.<variant>(args, options?)` | One operation on the application layer. Reads no request. The policy checks it only when `options.as` names a principal. |
| `avApp.appTx.<Resource>.<family>.<variant>(args)`, `avApp.appTx.$sql` | Application transaction handles. Built on the built framework. |
| `avApp.transaction([handles], options?)` | Runs `avApp.appTx` handles as one transaction. |

A list that mixes `avClient.tx` and `avApp.appTx` handles is a type error, and refused at runtime (`A2004`).

A Resource the client layer shows as `tx` or `transaction`, or the application layer as `appTx` or `transaction`, would hide behind that member. The framework's build fails with `AvConstructionError`, code `COMPILER_RESERVED_RESOURCE_NAME`, naming each clash. Rename the model, or hide it from that layer.

## `avDehydrate`

```text
import { avDehydrate } from "@aventara/next";

avDehydrate(data: unknown): unknown
```

Server side. Copies `data`, turning each `Date`, `bigint`, `Uint8Array` and decimal into a tagged plain object that React can pass from a Server Component to a Client Component. Arrays and plain objects are copied with their members dehydrated; anything else is returned as it is. Use it as TanStack Query's `dehydrate(queryClient, { serializeData: avDehydrate })`, or on an SWR `fallback`.

Throws `TypeError` for a `Date` that has no wire form (an invalid date, or a year past four digits).

## `@/aventara/client` (generated)

`src/aventara/client.ts`, written by `aventara-build --client`. Import it in Client Components.

| Export | What it is |
|---|---|
| `avClient` | The typed client for the browser, calling the app's own `/api`. A call made on the server is refused and sends nothing. |
| `avHydrate(dehydrated: unknown): unknown` | Revives what `avDehydrate` sent: tagged dates, `bigint`s, byte arrays and decimals become `Date`, `bigint`, `Uint8Array` and this client's `AvDecimal`. Throws `TypeError` for a tagged value `avDehydrate` does not write. |
| `AvDecimal` | The client's decimal class |
| `AvError`, `AvValidationError`, `AvNotFoundError`, `AvConflictError`, `AvAuthError`, `AvInternalError`, `AvProtocolError`, `AvContractMismatchError`, `AvTransportError` | The error classes the client throws ([Client errors](/docs/client-errors)) |
| your Resource types and enums | As `avclient generate`'s `AvClient.ts` exports them |
| types `AvClient`, `AvClientOptions`, `AvCallOptions`, `AvFetch`, `AvOperation`, `AvCause`, `AvOperationCode`, `AvValidationCode`, `AvValidationIssue` | Type-only exports |

`AvClient` is exported as a type only; the client's calls and options are those of [the generated client](/docs/client-api-reference). The files import nothing from `@aventara/client` or `@aventara/next`; `universal.ts` imports `io` from `next/cache`.

## `@/aventara/universal` (generated)

`src/aventara/universal.ts`, written by `aventara-build --client`.

| Export | What it is |
|---|---|
| `avClient` | The browser client's type. In the browser it calls `/api`; on the server it calls the app in process, with the request's `state`, through what `ready()` registered. Same values on both sides. |

## Errors

What the Next.js host raises, with the message:

| When | Raised as | Message |
|---|---|---|
| `Aventara()` gets no object | `Error`, when called | `` Aventara: the options are not an object; pass `{ ...aventaraConfig, adapter, state }`, or `{ framework, state }`. `` |
| `state` is not a function | `Error`, when called | `` Aventara: `state` is not a function; pass `({ headers, request }) => ({ … })`, called once per request. `` |
| `state` beside `access` | `Error`, when called; a type error | `` Aventara: the options carry both `access` and `state`; `access` seeds each request's state, so remove `state`. `` |
| `framework` beside configuration keys | `Error`, when called; a type error | `` Aventara: the options carry both `framework` and configuration keys (`api`); pass `{ framework, state }` or `{ ...aventaraConfig, adapter, state }`, not both. `` |
| `framework` is not a framework | `Error`, when called | `` Aventara: `framework` is not an Aventara Framework (it has no string `api` and no `contracts.client`); pass what `createFramework` resolved to. `` |
| Another configuration on the same `api` path, in production | `Error`, when called | `` Aventara: another configuration already serves the `api` path /api in this process; give each Aventara() its own `api` path. `` |
| A configuration `createFramework` refuses | `AvConstructionError`, from `ready()` and the first request | the diagnostics, each `{ code, path, message, docs }` ([Startup codes](/docs/error-codes#startup-codes)) |
| A Resource named like a member (`tx`, `transaction`, `appTx`) | `AvConstructionError` | `COMPILER_RESERVED_RESOURCE_NAME`: `resource "tx" clashes with avClient.tx; rename the Resource or expose it under another name` |
| `mcp` without `authorization` | a type error; `Error` when the framework is built | `` Aventara: `mcp` on Next.js needs `authorization` (`mcp: { path, authorization: { servers, verify } }`). ... `` |
| `mcp` configured, `@aventara/mcp` not installed | the first request fails | names `npm install --save-exact @aventara/mcp@<your @aventara/core version>` |
| `avClient.tx` or `avApp.appTx` before the framework is built | `Error` | `` Aventara: `avClient.tx` builds its handles on the Framework, which is built on first use; `await ready()` before building them. `` |
| A request reaches `handlers` outside `api` | `Error` | `` Aventara: a request for /other reached handlers, which serve the configured `api` path /api; put the route file at app/api/[...aventara]/route.ts. `` |
| `@/aventara/client` called on the server | rejected `Error`, nothing sent | `avClient from @/aventara/client runs in the browser only, and this call ran on the server, ...` |
| `@/aventara/universal` called on a server where `ready()` never ran | rejected `Error` | `avClient from @/aventara/universal ran on the server, ... await ready() from @/aventara/server there.` |

On the routes, every answer is the protocol's: a wrong method on an operation route is `405` (`A2012`) with `Allow`, an unknown content coding `415` (`A2011`), a body over `limits.maxRequestBytes` `413`, and a path the protocol does not own goes to Next's `notFound()`. See [HTTP protocol](/docs/http-protocol#codes).

## See also

- [Next.js host](/docs/nextjs-host)
- [Server-side usage](/docs/server-side-usage): `serverClient`, `application` and their options.
- [Client API reference](/docs/client-api-reference): the generated client's calls.
- [CLI reference](/docs/cli-reference#aventara-build): `aventara-build --client`.
