---
title: Client API reference
description: The generated client's surface - AvClient, AvClientOptions, CallOptions, Fetch, error classes, named types, and the defineClientConfig / env / avclient generator.
order: 85
section: reference
---

# Client API reference

`@aventara/client` is a development-time generator. It reads your deployment's client contract and writes a standalone typed client into your project; the generated client imports nothing from `@aventara/client` or `@aventara/core` at runtime. This page lists both halves: what you write (`framework.client.ts`, `avclient`) and what is generated. For a guided tour see [Frontend client](/docs/frontend-client).

## What `@aventara/client` exports

Only the generator's configuration helpers (used in `framework.client.ts`, never at runtime in your app):

| Export | Signature | Purpose |
|---|---|---|
| `defineClientConfig` | `(config: ClientConfigInput) => ClientConfigInput` | Gives the config file its type. Identity function. |
| `env` | `(name: string) => EnvReference` | Names an environment variable to be read when the config is evaluated. |
| `AVENTARA_CLIENT_GENERATOR_VERSION` | `string` | The generator's version. |
| types | `ClientConfigInput`, `ConfigValue`, `EnvReference` | |

```ts
// framework.client.ts
import { defineClientConfig, env } from "@aventara/client";

export default defineClientConfig({
  entrypoint: env("AVENTARA_API_URL"),   // or a literal: "https://api.example.com/api"
  generateAt: "./src/api",
});
```

### ClientConfigInput

| Option | Type | Default (from `avclient init`) | Meaning |
|---|---|---|---|
| `entrypoint` | `string \| EnvReference` | `env("AVENTARA_API_URL")`, value `http://localhost:3000/api` | The deployed framework entrypoint: origin plus mount path, one absolute `http(s)` URL. No credentials (the platform's `fetch` refuses them, and the value ships inside the client). No query or fragment; the mount path follows the server's [entrypoint rules](/docs/config-reference#entrypoint). |
| `generateAt` | `string \| EnvReference` | `./src/api` | Directory the client is written into, relative to the config file. Shared: the generator owns exactly `AvClient.ts` and `generated/` there and never touches anything else. |

The file is `framework.client.ts`. The generator loads it like `prisma.config`: `.ts`, `.mts`, `.cts`, `.js`, `.mjs` or `.cjs`, in ESM or CommonJS syntax (a `framework.client.mts` from `0.1.0-pilot.1` keeps working). With two of them present the generator refuses.

**The `.env` cascade**, read from the current directory before the config is evaluated, highest precedence first: the process environment, `.env.<mode>.local`, `.env.<mode>`, `.env.local`, `.env`. `mode` is `NODE_ENV`, or `development`. `process.env` is never written.

Errors, one sentence and exit code 1 (verified):

```text
avclient: entrypoint must use http: or https:, not ftp:
avclient: entrypoint must not carry credentials: the platform's fetch refuses a URL that includes them, and the entrypoint is embedded in the generated client, which ships — authenticate through a custom fetch instead.
avclient: entrypoint reads AVENTARA_API_URL, which is not set in the process environment or in any of .env.development.local, .env.development, .env.local, .env (mode "development").
avclient: Could not fetch the ClientContract from http://localhost:3999/api/_contract: fetch failed (connect ECONNREFUSED 127.0.0.1:3999). Check that the deployment is running and that the entrypoint is its origin plus mount path.
```

## The avclient command

```text
avclient init [options]     Set up this frontend and generate.
avclient generate [--yes]   Fetch <entrypoint>/_contract and write AvClient.ts and generated/.
avclient --help             Print usage, exit 0.
avclient <command> --help   Print that command's usage, exit 0.
avclient --version, -v      Print the generator's version, exit 0.
```

Flags and exit codes are in the [CLI reference](/docs/cli-reference#avclient). `avclient generate` asks the server conditionally (`If-None-Match` with the stored hash): on `304` and identical output it prints `avclient: up to date: ... nothing was written.` and exits 0.

## The generated files

Written into `generateAt`:

| Path | Contents |
|---|---|
| `AvClient.ts` | The entry point you import. |
| `generated/client.ts` | The typed `AvClient` class, `AvClientOptions`, `CallOptions` and the ready instance. |
| `generated/types.d.ts` | The named Resource types. |
| `generated/enums.ts` | Each enum as a union type and a same-named `as const` object. |
| `generated/contract.ts`, `metadata.ts` | The contract the client was generated against; the hash, protocol version and default entrypoint it is bound to. |
| `generated/runtime/*` | Codecs, `Decimal`, errors, transport, and (when transactions are interactive) fingerprints and transaction handling. |
| `generated/derivation/**` | Type declarations that derive argument and result types from the contract. |

Every file is TypeScript source. The files import each other the way the project's `tsconfig.json` says (extensionless, `.js` or `.ts`; see [Client setup](/docs/client-setup#what-is-generated)), and you import `AvClient` the same way ([Importing the client](/docs/client-setup#importing-the-client)).

Never edit them: output is deterministic (two runs over one contract write the same bytes) and replaced on every run. Commit the tree; regenerating needs a running server.

## What `AvClient.ts` exports

| Export | Kind | Notes |
|---|---|---|
| `default` | `AvClient` instance | The client of the deployment the tree was generated from: `import avClient from "./api/AvClient"` (spelled per project; see [Importing the client](/docs/client-setup#importing-the-client)). |
| `AvClient` | class | `new AvClient(options?)`. |
| `AvClientOptions` | type | See below. |
| `CallOptions` | type | See below. |
| `Fetch` | type | The platform's `fetch` type. |
| `Operation` | type | A deferred transaction handle. |
| named Resource types | types | `User`, `UserWhere`, ... See [Named types](#named-types). |
| enums | type and value | `Role` as `"USER" \| "ADMIN"` and `{ USER: "USER", ADMIN: "ADMIN" }`. |
| `Decimal` | class | The client's decimal value: a constructor, `toString`, `toJSON`. |
| `FrameworkError`, `AuthError`, `ConflictError`, `ContractMismatchError`, `InternalError`, `NotFoundError`, `ProtocolError`, `ValidationError` | classes | See [Error classes](#error-classes). |
| `TransportError` | class | |
| `Cause`, `ValidationIssue`, `OperationCode`, `ValidationCode` | types | |

## AvClient

```ts
class AvClient {
  constructor(options?: AvClientOptions);
  readonly tx: /* deferred operations, only when transactions are interactive */;
  readonly transaction: /* only when transactions are interactive */;
  // plus one property per Resource:
  readonly [Resource]: { [family]: { [variant]: (args?, options?: CallOptions) => Promise<Result> } };
}
```

Only what the client contract advertises exists, in the type and at runtime: one property per Resource, one per family, one per advertised variant. A call is `avClient.<Resource>.<family>.<variant>(args, options?)`.

A Resource whose name collides with a client member (`tx`, `transaction`, `then`, `constructor`, names of `Object.prototype`) is reached as `<name>Model`, with one warning at generation; its wire name is unchanged.

A call **resolves to the data** (record, list, count; `null` for a first-style miss, `A1001`). Every other outcome throws.

Values are application values: `bigint`, `Date`, `Uint8Array`, the client's `Decimal`, and JSON as is. Arguments are encoded and results revived for you.

### AvClientOptions

| Option | Type | Default | Meaning |
|---|---|---|---|
| `entrypoint` | `string` | the entrypoint the client was generated from | Another deployment that serves **exactly the same** client contract (tests, SSR). Re-binds nothing: the hash still decides whether it accepts you. |
| `fetch` | `Fetch` | the platform's `fetch`, read when a call is made | A custom fetch: authentication, tests, retries. |

If no `fetch` is available a call throws `No fetch is available here; pass one: new AvClient({ fetch })`. Importing the client never fails.

```ts
const client = new AvClient({
  fetch: (input, init) =>
    fetch(input, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } }),
});
```

### CallOptions

The last argument of every call. Never sent in the body.

| Option | Type | Meaning |
|---|---|---|
| `signal` | `AbortSignal` | Aborts the request; the call rejects with what `fetch` rejected with (`AbortError`). |
| `headers` | `Record<string, string>` | Extra request headers. The framework's own identity headers are refused: `The "Aventara-Contract-Hash" header is the framework's own; a request cannot set it` (a `TypeError`). |
| `requestId` | `string` | Sent as `Aventara-Request-Id`; wins over the same header in `headers`. The empty string means absent. |

```ts
await avClient.User.find.count({}, { requestId: "from-client-1", signal });
```

### Fetch

`typeof globalThis.fetch` when your TypeScript `lib` declares one (DOM, `@types/node`); otherwise a structural `(url, init) => Promise<response>` type. The platform `fetch` therefore needs no cast.

## Transactions

When the contract advertises interactive transactions the client has `tx` and `transaction`; otherwise neither exists.

| Member | Signature | Meaning |
|---|---|---|
| `avClient.tx.<R>.<family>.<variant>(args)` | returns a handle (`Operation`) | Builds a deferred step; sends nothing. A handle's selected fields expose `$ref("field")`. |
| `avClient.transaction(steps, options?)` | `Promise<tuple of results>` | Sends the plan once; resolves one typed result per handle, in order. A failing step throws its error with `cause.operation` set. |

```ts
const user = avClient.tx.User.create.one({ data: { email: "tx@example.com" }, select: ["id"] });
const post = avClient.tx.Post.create.one({ data: { title: "from tx", authorId: user.$ref("id") } });
const [u, p] = await avClient.transaction([user, post]);
```

Refused before anything is sent: the same handle twice (`ValidationError`, `A2004`/`V1001`) and a `$ref` to a handle not in the list (`A2007`/`V1010`). More than `maxTransactionOperations` steps throws `ValidationError` `A2009`/`V1014`. See [Transactions](/docs/transactions).

## Error classes

```ts
class FrameworkError<C extends OperationErrorCode = OperationErrorCode> extends Error {
  readonly code: C;        // branch on this
  readonly cause: Cause;   // { message, issues?, operation? }
}
class TransportError extends Error {
  readonly status: number | null;   // null: no response arrived
}
interface Cause { readonly message: string; readonly issues?: readonly ValidationIssue[]; readonly operation?: number }
interface ValidationIssue { readonly path?: readonly (string | number)[]; readonly code: ValidationCode; readonly message: string }
```

| Class | `code` values |
|---|---|
| `ProtocolError` | `A2000` `A2001` `A2002` `A2006` `A2010` `A2011` `A2012` |
| `NotFoundError` | `A2003` |
| `ValidationError` | `A2004` `A2007` `A2009` |
| `ContractMismatchError` | `A2005` |
| `ConflictError` | `A2008` `A2013` `A2014` (`A2013`/`A2014` may succeed if sent again; no retry is automatic) |
| `InternalError` | `A3000` `A3001` `A3002` `A3003` `A3004` |
| `AuthError` | `A4000` `A4001` `A4002` |

Each has `name` equal to its class name. `cause` is rebuilt member by member from the envelope, so nothing the protocol does not define reaches it. `TransportError` carries no cause. Full table with fixes: [Error codes](/docs/error-codes).

## Named types

For each Resource `R`, exported only when the operation it reads is advertised:

| Type | Is |
|---|---|
| `R` | The default record (`find.unique` with no projection). Fields are `readonly`. |
| `RWhere` | `find.many`'s `where`. |
| `RUniqueWhere` | `find.unique`'s `where`. |
| `ROrderBy` | `find.many`'s `orderBy`. |
| `RCreateData` | `create.one`'s `data`. |
| `RUpdateData` | `update.unique`'s `data`. |
| `RSelect` | `find.many`'s `select`. |
| `RInclude` | `find.many`'s `include`. |

A name that would clash (a Resource `UserWhere` beside `User`) walks a rename ladder (`User` becomes `UserModel`), one warning each. For the sample schema: `User`, `UserWhere`, `UserUniqueWhere`, `UserOrderBy`, `UserCreateData`, `UserUpdateData`, `UserSelect`, `UserInclude`, and the same for `Post` and `Category`.

```ts
import avClient, { type User, type UserWhere } from "./api/AvClient";

const where: UserWhere = { email: { equals: "ada@example.com" } };
const users: readonly User[] = await avClient.User.find.many({ where });
```

List results are `readonly` arrays, so type them `readonly User[]`.

## Bound to a contract

A generated client is bound to the **exact contract hash and protocol version** it was generated from (both in `generated/metadata.ts`) and sends them on every request. A deployment whose contract differs answers `A2005`, thrown as `ContractMismatchError`, including when the stale client calls an operation the server no longer advertises. Generate against the deployment the client will call, and regenerate when it changes. See [Contract hash](/docs/contract-hash).

## Verified behavior

Run against a live server: `find.unique` miss throws `NotFoundError`; `find.first` miss resolves `null`; an `AbortSignal` already aborted rejects with `AbortError`; a client with the wrong hash throws `ContractMismatchError`; an unreachable server throws `TransportError` with `status === null` and the message `The request for "User" find.many failed before any response arrived.`; a 404 without an envelope throws `TransportError` with `status === 404`: `The response to "User" find.many (HTTP 404) is not an Aventara response envelope.`

> In a CommonJS project, importing the default export (`import avClient from`) can resolve to the module object under some TypeScript runners. Use `new AvClient()` there, or a bundler/ESM setup.

## See also

- [Frontend client](/docs/frontend-client), [CLI reference](/docs/cli-reference), [Error codes](/docs/error-codes)
- [Protocol API reference](/docs/protocol-api-reference): the wire the client speaks.
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics), [Transactions with $ref](/docs/transactions-with-ref)
