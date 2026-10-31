---
title: Working with AI agents
description: How Aventara keeps an AI coding agent on track - the agent skill and AGENTS.md section the CLI writes (shown in full, to copy), precise types, an error catalog with a docs link per code, one way per task, the generated client, and a local MCP endpoint for your coding agent.
order: 1
section: ai
---

# Working with AI agents

An AI coding agent does well on a codebase where each task has one right place, mistakes fail loudly at the exact spot, and every error says what to do. Aventara is built that way, and it hands your agent the rules in a form it reads.

- **A skill for your agent.** `aventara new` and `aventara init` write an agent skill into your project, and a short section of `AGENTS.md` that points agents to it. Both are shown in full below, so you can also copy them by hand.
- **Types as the guardrail.** A wrong configuration key or call is a type error at that key, not a runtime surprise.
- **Errors an agent can act on.** Every code has a cause, a fix and a docs link, in code, in a file and on [Error codes](/docs/error-codes).
- **One way per task.** [Which stage do I use?](/docs/which-stage) maps each task to the one stage that fits.
- **A generated client that cannot drift.** The frontend client is generated from the server's contract, and a stale one is refused.

## The skill aventara writes

`aventara new` and `aventara init` write these files, for the Aventara version they install:

```text
AGENTS.md
.claude/skills/aventara/
  .aventara-skill.json
  SKILL.md
  reference/client.md
  reference/config.md
  reference/errors.md
  reference/recipes.md
  reference/stages.md
```

- `SKILL.md` follows the Agent Skills format: a `name`, a `description` whose words tell the agent when to load it, and the rules. Claude Code reads skills from `.claude/skills/`; other agents find it through `AGENTS.md`.
- `reference/config.md`, `reference/stages.md` and `reference/recipes.md` are the detail the rules point to. Every code block in them is compiled against the release before it ships.
- `reference/errors.md` is `ERRORS.md` from the installed `@aventara/core`: every code with its cause and fix, generated from the same catalog as [Error codes](/docs/error-codes).
- `.aventara-skill.json` records what was written (a hash per file), so a refresh can tell which files you changed.

To refresh them after upgrading, run `aventara skill` in the project, with the CLI at your `@aventara/core` version:

```bash
npx @aventara/cli@1.0.0-rc.11 skill
```

It reads the installed `@aventara/core`'s version and `ERRORS.md` (it runs none of your packages), then:

- rewrites the skill's files it wrote before;
- keeps a skill file you changed, and says so; `aventara skill --force` replaces it;
- adds the Aventara section to `AGENTS.md`, or replaces only the text between its markers. The rest of `AGENTS.md` is yours and is never touched, and no second section is added. It never writes `CLAUDE.md`.

## The AGENTS.md section

Appended to your `AGENTS.md`, or written as a new one:

```markdown
<!-- aventara:start -->
## Aventara

This project's API is built with Aventara (https://aventara.razor34.dev/framework). Before changing `src/aventara.config.ts`, `src/resources/` or `prisma/schema.prisma`, read `.claude/skills/aventara/SKILL.md` and follow its rules.
Every error code (`A2004`, `V1000`, `COMPILER_…`) is explained in `.claude/skills/aventara/reference/errors.md`.
Refresh these files after upgrading Aventara: `npx @aventara/cli@<your @aventara/core version> skill`.
<!-- aventara:end -->
```

## SKILL.md

````markdown
---
name: aventara
description: Build and change this project's Aventara API (NestJS or Next.js, Prisma, @aventara/core). Use when editing src/aventara.config.ts, src/aventara/config.ts, src/resources/*.resource.ts or prisma/schema.prisma; when exposing or hiding Resources, fields or operations (exposed, exemptions); when adding guards, pipes, field validators (AvZ), computed fields (compute.create/update/read), hooks, interceptors, filters, transactions, forceTransaction, an outbox, ctx.$state or the agent layer; when caching reads (cache stage, avCache) or loading several calls at once (avClient.all, POST /_all, avLazy, grouping, limits.maxAll); and when an Aventara code appears (A2004, V1000, CONFIG_*, COMPILER_*, AvConstructionError, AvValidationError).
---

# Aventara

Aventara turns the Prisma schema into a typed API: every model is a Resource with standard operations (`find`, `create`, `update`, `delete`, `upsert`), served at `api` (`/api`) and called from the generated frontend client. You configure it; you do not write controllers. Written for `@aventara/core` 1.0.0-rc.11.

There is one way to do each task. Follow these rules; the reference files hold the detail:

- `reference/config.md`: the configuration tree, where every key goes, exposure, limits.
- `reference/stages.md`: which stage fits a task, the order stages run in, the rules.
- `reference/recipes.md`: complete, type-checked examples for the common tasks.
- `reference/client.md`: calling the API from frontend and server code: several calls in one request (`avClient.all`, `POST /_all`), aborting, `avLazy`, `grouping: false`, cached reads.
- `reference/errors.md`: every code (`A…`, `V…`, `CONFIG_…`, `COMPILER_…`) with its cause and fix.

If `@aventara/access` is installed, read its own skill, `node_modules/@aventara/access/skill/SKILL.md`, for policies.

## Where things are

| File | What it is |
|---|---|
| `prisma/schema.prisma` | The data model. Every model is a Resource, named exactly as the model. |
| `src/aventara.config.ts` | `aventaraConfig`: the configuration, a plain value `as const`, without `adapter`. Keep the `as const`. |
| `src/aventara.adapter.ts` | The adapter's description, `describePrismaAdapter({ discovery, provider, driver })`. |
| `src/resources/<name>.resource.ts` | One Resource's configuration, an exported `defineResource(...)`. `aventara:prepare` gathers every one into `aventaraResources`: no spread to write, no config edit. |
| `src/generated/aventara/` | Generated by `aventara:prepare`: `discovery.artifact.ts` and, beside it, `resources.generated.ts`, `computed-fields.generated.ts` and `contracts.generated.ts`. When Prisma's client output is `src/generated` itself, these four live in `src/aventara/` instead (the `--out` of `aventara:prepare`, and where `src/aventara.config.ts` imports `aventaraResources` from). Never edit them. |
| Prisma's client output | Generated by `aventara:prepare` (`prisma generate`), at your schema generator's `output`. Never edit it. |
| `src/app.module.ts` | `AventaraModule.forRootAsync(...)` builds the framework from `aventaraConfig` and the adapter (the description plus the Prisma client). |

### In a Next.js project

A Next.js app (`@aventara/next`, App Router under `src/app/`) keeps everything Aventara in one folder, `src/aventara/`. Everything else on this page applies; read these paths for the NestJS ones above.

| File | What it is |
|---|---|
| `src/aventara/config.ts` | `aventaraConfig`, as `src/aventara.config.ts` above. Its `api` (`/api`) is the folder of the route file. |
| `src/aventara/adapter.ts` | The adapter's description, as `src/aventara.adapter.ts` above. |
| `src/aventara/server.ts` | `Aventara({ ...aventaraConfig, adapter, prebuilt, state })`, exporting `handlers`, `avClient`, `avApp` and `ready`. Import it as `@/aventara/server`, in server code only. It replaces `app.module.ts`: `state` seeds `ctx.$state` from each request's headers. |
| `src/aventara/client.ts`, `src/aventara/universal.ts`, `src/aventara/generated/` | Generated by `aventara:prepare` (`aventara-build --client`): the browser client (`@/aventara/client`), the universal entry and the generated modules. Never edit them; they are in `.gitignore`. |
| `src/app/api/[...aventara]/route.ts` | Exports every method of `handlers`. One line; keep it. |
| `src/instrumentation.ts` | Awaits `ready()` on the Node.js runtime, so a bad configuration stops `next start`. |
| `src/prisma.ts` | `prisma()`, the app's one Prisma client, made on first use. |
| `next.config.ts` | Keeps `serverExternalPackages: ["@aventara/core", "@aventara/prisma7-adapter"]`: Node.js loads them once per server process, so every route and page shares one core, one Framework and one Prisma client. Keep the line. |

Server Components and Server Actions call `avClient.<Resource>.<family>.<variant>(args)` (checked as the caller) or `avApp` (trusted code); Client Components call the generated `avClient` from `@/aventara/client`. There is no separate frontend to regenerate: `aventara:prepare` writes the browser client too, and `next build` runs it first. An `mcp` endpoint on Next.js needs `authorization`.

A call reads the database, so Next.js runs it at request time (Cache Components is on: `cacheComponents: true`). Give a page that calls `avClient` or `avApp` one of: the calling component inside `<Suspense fallback={…}>` (or a `loading.tsx`), `"use cache"` on a function that makes the call (the result is shared by every visitor: never with `state`), or `export const instant = false` to render the whole page at request time. Without one, `next build` fails naming these three: add one (no `connection()` is needed).

## Rules

1. **Change the schema, then prepare.** After editing `prisma/schema.prisma` run your migration (`npx prisma migrate dev` or `npx prisma db push`), then `npm run aventara:prepare`. Run `aventara:prepare` again after adding or removing a Resource file, and after adding, moving or removing a `compute` stage; the server warns `generated types are stale` until you do. Restart the server and regenerate the frontend client (`npm run avclient:generate` in the frontend): the contract hash changed.
2. **Configure, never wrap.** Do not write a Nest controller, service or REST route for a model. Every model already has its operations; shape them with `exposed`/`exemptions` and pipelines. Server code calls `framework.application.<Resource>.<family>.<variant>(args)`.
3. **Expose with exemptions.** `exposed: true` (the root's default; an overlay that lists `exemptions` must say it) exposes everything the adapter offers and `exemptions` lists what to hide; `exposed: false` exposes nothing and `exemptions` lists what to expose. Hide at the root what no caller may reach; hide in `client` what only your server code may reach. An overlay (`application`, `client`, `agent`) only narrows the root's view: to expose something in one overlay only, expose it at the root and hide it in the other.
4. **Pick the stage from the table below.** Each task has one stage. Do not authorize in an interceptor, transform in a guard, or write other rows from a compute stage.
5. **Never cast types away.** No `as`, no `!`, no `any`, no `@ts-ignore` / `@ts-expect-error` to silence an Aventara type. The types are the contract: a type error names the exact key that is wrong (a misspelled field, an overlay granting what the root hid, a missing required field). Fix the key. To get typed arguments in a stage, register it on the operation (`resources.<R>.operations.<family>.<variant>.pipelines`) inside a `defineResource` block; to type `ctx.<Resource>` calls, give the stage type your model (`AvAfterHook<Model>`).
6. **Annotate stages in the `as const` config.** An inline arrow in `aventaraConfig` has no contextual type (TS7006). Declare it with its stage type (`const requireUser: AvGuard = (ctx) => …`) or move it into a `defineResource` block, where stages are typed from where they sit.
7. **Fill server-side values with `compute.create`.** A required field the caller must not send (an owner id, a slug, a hash) gets `pipelines.compute.create`; that also makes it optional on create. A pipe cannot fill a missing required field: the framework refuses the create (`A2004`, `V1000`) before any pipe runs. Hiding a required field from a layer that still creates the Resource needs a `compute.create`, or startup fails with `COMPILER_HIDDEN_REQUIRED_FIELD`.
8. **Validate values with `AvZ`.** Length, range, pattern and format rules are field validators (`AvZ.maxLength(80)`, `AvZ.email()`); they are part of the contract, so the generated client checks them before sending. A rule across fields or one that needs the database is a guard.
9. **Read the user from `ctx.$state`.** Declare it once (`declare module "@aventara/core" { interface AvState { user?: … } }`), set it from `AventaraModule`'s `state` option (remote requests) or a call's `{ state }` option (server code), and read `ctx.$state.user` in every stage. Never parse headers again in each stage.
10. **Side effects that must commit with the write: `forceTransaction` + an `after` hook.** Set `forceTransaction: true` on the operation and write the related rows (an outbox event, a counter) through `ctx.<Resource>` or `ctx.$sql` in its `after` hook. Without it the write has already committed when the hook runs.
11. **Errors are codes.** Branch on `code` or the error class (`AvNotFoundError`, `AvValidationError`, …), never on a message. Throw `new AvError("A4000", "Sign in first.")` from a stage to answer a code. Look up any code in `reference/errors.md` (or `AvErrorCatalog[code]` from `@aventara/core`); a startup diagnostic carries its `docs` URL.
12. **Do not edit generated files.** Prisma's client, the files beside the discovery artifact (`src/generated/aventara/`, or `src/aventara/` when Prisma's client output is `src/generated`) and the frontend's generated client are rebuilt by `aventara:prepare` and `avclient generate`.
13. **The configuration runs at build time.** `aventara:prepare` ends with `aventara-build`, which runs `src/aventara.config.ts` without a database client and compiles the Contracts. Keep it a value with no `adapter`, and keep its top level free of side effects (no connection, no request). A `CONFIG_…` or `COMPILER_…` problem fails `aventara:prepare` with the diagnostics startup would print.
14. **Load together; write atomically in a transaction.** Calls made in the same tick already go out as one `POST <api>/_all`: use `Promise.all`, or `avClient.all({ key: call }, { settle, signal })` for one typed value per key (strict by default; `settle: true` never rejects for one key). It is not atomic: writes that must hold together, or use another's result, go in `avClient.transaction([...])`. Never write a batching route or loader. Details: `reference/client.md`.
15. **Cache a read with the `cache` stage, `for` written first.** `pipelines: { cache: cache({ for: "user", maxAge: 60 }) }` on a `find` (root or `client` layer, Resource, `find` family or variant; the most specific wins). `for`: `"user"` (the default: only the caller's browser keeps it), `"anonymous"` (a CDN shares it among anonymous callers) or `"everyone"` (a CDN shares it with every caller): pick the narrowest that is true. Write `for` even when it is the default `"user"`: it states who the answer is for (the one exception to rule 16). Where React's `cache` is imported too, `import { cache as avCache } from "@aventara/core"`. Details: `reference/config.md`, Caching reads.
16. **Write only what changes behaviour.** Leave out what the framework already does: no option set to its default value (no `limits: { maxAll: 10 }`, no `grouping: true`, no `extends: "client"` on `agent`, no `exposed: true` at the root), no config key, stage or wrapper that repeats a built-in, and no type annotation the inference already gives (a stage inside a `defineResource` block is typed from where it sits). One exception: `cache({ for, maxAge })` always writes `for`, even the default `"user"`, because it reads as a sentence and states the audience.

## Which stage

| You want to | Use | Where it goes |
|---|---|---|
| Check a permission | a guard | `pipelines.guards`, at the layer, a Resource, a family or a variant |
| Refuse a write to one field | a field write guard | `resources.<R>.fields.<f>.pipelines.guards` |
| Normalize input (trim, lower-case, default, scope a query) | a pipe, or a field pipe for one value | `pipelines.pipes`, or `resources.<R>.fields.<f>.pipelines.pipes` |
| Enforce a rule on a value (length, range, pattern, format) | a validator | `resources.<R>.fields.<f>.pipelines.validators` |
| Fill in or derive a field's value | compute | `resources.<R>.fields.<f>.pipelines.compute` (`create`, `update`, `read`) |
| React after a write (event, audit row, counter) | an `after` hook writing through `ctx`, with `forceTransaction` when it must commit with the write | `pipelines.hooks.after` |
| Wrap execution (timing, a server-side cache, retries, `AsyncLocalStorage`) | an interceptor | `pipelines.interceptors` |
| Let the browser or a CDN keep a read's answer | `cache({ for, maxAge })` | `pipelines.cache` on a `find`: layer, Resource, family or variant |
| Turn an error into an answer | a filter | `pipelines.filters` |
| Check a whole transaction | the Resource's transaction stages | `resources.<R>.transactions.pipelines` |
| Share request information (the signed-in user) | `ctx.$state` | `AventaraModule`'s `state` option, or a call's `{ state }` |
| Call another operation from a stage | `ctx.<Resource>.<family>.<variant>(args)` | the `ctx` every stage gets (compute can only read) |

Order: framework validation → guards → pipes (operation, then field) → write compute (create/update) → re-check (Aventara's checks on pipe and compute output: `A3004`, `A3000`; then field validators and Json shapes on every value, computed included: `A2004`) → interceptors → `hooks.before` → the operation (then compute read) → `hooks.after` → interceptors unwind; filters handle a failure. `ctx` calls are raw: they run validation, field pipes, compute and validators, and none of your guards, pipes, hooks, interceptors or filters.

## The shape of a configuration

```ts
// src/aventara.config.ts
import { type AvGuard, AvError } from "@aventara/core";
import { aventaraResources } from "./generated/aventara/resources.generated.js";

const requireUser: AvGuard = (ctx) => {
  if (ctx.$state.user === undefined) throw new AvError("A4000", "Sign in first.");
  return true;
};

export const aventaraConfig = {
  api: "/api",
  // Root: hidden from every caller.
  exemptions: {
    resources: { User: { fields: { passwordHash: ["select", "filter", "order"] } } },
  },
  // Every defineResource() in src/resources/, gathered by aventara:prepare.
  resources: aventaraResources.root,
  // Remote callers (HTTP, the generated client).
  client: {
    exposed: true,
    exemptions: { resources: { User: { operations: { delete: true } } } },
    pipelines: { guards: [requireUser] },
  },
} as const;
```

`app.module.ts` joins the adapter to it: `config: { ...aventaraConfig, adapter: await createPrismaAdapter({ ...adapter, client: prisma }) }`, where `adapter` is the default export of `src/aventara.adapter.ts`.

## Calling the API over HTTP

The generated client does all of this for you. To call the API by hand (curl, a REST tool, a test), each operation is `POST <api>/_resources/<Resource>/<family>/<variant>`, where `<Resource>` is the model's name exactly as in `prisma/schema.prisma` (`User`, not `users`). Send two headers: `Aventara-Protocol-Version: 1` and `Aventara-Contract-Hash`, the hash `GET <api>/_contract` serves (its body's `protocol.hash`, and its `ETag`). The JSON body holds the operation's arguments: a create sends `{ "data": … }`.

```sh
HASH=$(curl -s http://localhost:3000/api/_contract | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).protocol.hash')
curl -X POST http://localhost:3000/api/_resources/User/create/one \
  -H 'Content-Type: application/json' \
  -H 'Aventara-Protocol-Version: 1' \
  -H "Aventara-Contract-Hash: $HASH" \
  -d '{ "data": { "email": "ada@example.com", "name": "Ada" } }'
```

It answers `201` with `{"data":{"email":"ada@example.com","id":1,"name":"Ada"},"code":"A1002","cause":null}`. Without the two headers the answer is `400 A2000`; a lower-case `user` is `404 A2001`; arguments outside `data` are `422 A2004`. After a schema or configuration change the hash changes and an old one is `409 A2005`: fetch it again. Several operations in one request: `POST <api>/_all` (`reference/client.md`, By hand).

## Before you finish

- `npx tsc --noEmit` passes with no casts added.
- The server starts: an `AvConstructionError` lists each problem as `{ code, path, message, docs }`; fix the key at `path`.
- After a schema or compute change you ran `npm run aventara:prepare`, and the frontend regenerated its client.

These files are generated by `aventara` for this project's Aventara version. Refresh them after upgrading: `npx @aventara/cli@<your @aventara/core version> skill`. A file you edited is kept (pass `--force` to replace it).
````

## The reference files

### reference/client.md

````markdown
# Calling the API

How frontend and server code call the operations: several calls in one round trip, aborting, `avLazy`, and how cached reads go out. The generated client is the default export of the file `avclient generate` writes (`api/AvClient.ts`, at the frontend's `generateAt`); in a Next.js app it is `@/aventara/client` in the browser and `@/aventara/server` on the server.

## Calls made together share one request

Calls made in the same tick (before the microtask queue settles) go out as one `POST <api>/_all`, an Operation Set. Each call still resolves or throws on its own. Write nothing for it: no batching endpoint, no loader.

```ts
import avClient from "./api/AvClient";

const [posts, published] = await Promise.all([
  avClient.Post.find.many({ where: { published: true }, select: ["id", "title"] }),
  avClient.Post.find.count({ where: { published: true } }),
]); // one POST /api/_all
```

- Each call runs exactly as alone: validation, exposure, policy, limits and pipelines are those of its own route, and so is its answer.
- Not atomic and in no order: the calls run concurrently, and a write that ran stays written whatever the others answered. Writes that must hold together, or a call that needs another's result, belong in a transaction (`avClient.transaction([avClient.tx.Post.create.one(…), …])`, `POST /_transactions`).
- Reads and writes mix. A group larger than `limits.maxAll` (10) or `limits.maxRequestBytes` is split by the client.
- Always sent alone: a call with `headers` or `requestId` in its options, a call or client with `grouping: false`, a transaction, and a cached read (a `GET`).
- A server older than rc.11 answers `/_all` with `A2002`; the client resends the calls one by one and stops grouping.

## Calls run when you make them

A call is checked, encoded and queued when it is made, as `fetch` is: a call never awaited still runs, and awaiting it twice sends it once. To describe a call now and make it later, wrap it in `avLazy`:

```ts
import avClient, { avLazy } from "./api/AvClient";

const drafts = avLazy(() => avClient.Post.find.many({ where: { published: false }, select: ["id"] })); // nothing sent
const list = await drafts; // sent now
```

| Where `avLazy` comes from | Awaited again |
|---|---|
| The generated client (browser) | Keeps its one answer. |
| `@aventara/core` (server code) | Calls again each time; it keeps no answer, so never hold one in module scope expecting a cache. |
| Next.js `@/aventara/universal` on the server | Keeps its answer within one request's React render only. |

## `avClient.all`

An object of calls in, one typed value per key out. The keys are yours and never sent.

```ts
import avClient, { AvNotFoundError } from "./api/AvClient";

// Strict (default): the first failure rejects `all` with that error and aborts its other calls.
const { list, total } = await avClient.all({
  list: avClient.Post.find.many({ select: ["id", "title"] }),
  total: avClient.Post.find.count({}),
});

// settle: true: every key settles on its own; `all` never rejects for one key.
const panels = await avClient.all(
  {
    posts: avClient.Post.find.many({ select: ["id", "title"] }),
    me: avClient.User.find.unique({ where: { id: 1 }, select: ["id", "email"] }),
  },
  { settle: true },
);
if (panels.me.status === "rejected") {
  if (panels.me.reason instanceof AvNotFoundError) console.log("no such user");
} else {
  console.log(panels.me.value.email, list.length, total);
}
```

Strict is fail-fast, not atomic: a write that already ran stays written. Use strict when the page needs every value, `settle: true` when each panel renders or fails alone. Every entry must be a call (or an `avLazy`); a plain value does not compile.

## Aborting

Each call has its own abort: `{ signal }` in a call's options aborts that call only; `avClient.all({ … }, { signal })` aborts every call of that `all`, and a call inside it stops on whichever signal fires first.

```ts
import avClient from "./api/AvClient";

const page = new AbortController();
const search = new AbortController();

const result = avClient.all(
  {
    hits: avClient.Post.find.many({ where: { title: { contains: "rc" } } }, { signal: search.signal }),
    count: avClient.Post.find.count({}),
  },
  { signal: page.signal },
);
search.abort(); // only `hits` stops; strict `all` then rejects with its AbortError
```

- Aborted before the request is sent: the call is dropped. After: it rejects at once; the other calls of the same request go on.
- Calls grouped into the same request but not in that `all` are never touched. The HTTP request itself is aborted only when every call in it is.
- A started database query still finishes on the server (no cancel); a started write is written.
- Nothing aborts for you: no default timeout, no abort on navigation. Pass the signal your data library gives (TanStack Query's and SWR's `queryFn` receive one), or abort in an effect's cleanup.

## Turning grouping off

```ts
import avClient, { AvClient } from "./api/AvClient";

await avClient.Post.find.many({ select: ["id"] }, { grouping: false }); // this call, on its own route
const plain = new AvClient({ grouping: false }); // every call of this client
await plain.Post.find.count({});
```

Only for a reason: debugging in the network tab, per-route monitoring or rate limits, or a proxy that lets through `/_resources/…` but not `/_all`. A transaction takes no `grouping` option.

## On the server

Server code has the same `all`: `framework.serverClient.all` (NestJS, any host) and `avClient.all` from `@/aventara/server` (Next.js). `framework.application` and `avApp` have no `all`.

```tsx
// src/app/dashboard/page.tsx
import { avLazy } from "@aventara/core";
import { avClient } from "@/aventara/server";

export default async function Dashboard() {
  const { posts, published } = await avClient.all({
    posts: avClient.Post.find.many({ select: ["id", "title"] }),
    published: avLazy(() => avClient.Post.find.count({ where: { published: true } })),
  });
  return <p>{posts.length} posts, {published} published</p>;
}
```

- Nothing is grouped and nothing goes over HTTP: each call runs in process, in the request that made it, with that request's state and principal (`framework.serverClient` calls take `{ state }` like any server call).
- Any number of entries: `limits.maxAll` guards `POST /_all` only.
- A plain call has already started when made, so `all` can only await it. An `avLazy` entry is started by `all`: at most `limits.maxAllConcurrency` (4) at once, in key order, and none after a strict `all` failed or was aborted.
- Next.js `@/aventara/universal` groups in the browser only; on the server each of its calls runs on its own.

## The two limits

| Limit | Default | Bounds |
|---|---|---|
| `limits.maxAll` | `10` | Operations in one `POST /_all`. More is refused whole: `422 A2009` / `V1014`. The generated client splits for you. |
| `limits.maxAllConcurrency` | `4` | Operations of one set (HTTP or in process) running at once; the rest wait, in key order. At least `1`. |

Ordinary limits: set them at the root, override them in `client` or `application` (`limits: { maxAll: 20 }`). Do not grow the database pool for `/_all`; the concurrency limit keeps one request to its share.

## Cached reads from the client

A read with a `cache` stage (`reference/config.md`, "Caching reads") is sent by the generated client as `GET <api>/_resources/<R>/find/<variant>?q=<args>&v=<contract hash>`, alone, never in an Operation Set. Leave `requestId` off a cached cross-origin read (it adds a CORS preflight). A URL over 4096 characters goes as a `POST` and is not cached. The `POST` route stays for any client.

## By hand (curl, a custom client)

`POST <api>/_all` takes the two identity headers and `{ "operations": { "<key>": { "resource": "Post", "family": "find", "variant": "many", "args": { … } } } }` (keys are identifiers; each entry is exactly those four members). It answers `200 A1000` with `data` holding each key's own envelope (`{ data, code, cause }`): read each key's `code`, not the status. With `Accept: application/x-ndjson` it streams one line per entry as it finishes, `{"key":"…","envelope":{…}}`; the generated client does this for you, so write it only in a client of your own. Too many entries: `422 A2009`; none: `422 A2004`.
````

### reference/config.md

````markdown
# Configuration reference

`aventaraConfig` in `src/aventara.config.ts` is one object `as const`, without `adapter`. Every name in it (Resource, field, operation) is checked against your model by TypeScript, again by `aventara-build` (in `aventara:prepare`) and again at startup.

## The tree

```text
root
  api            "/api": where the protocol is mounted (root only)
  mcp            "/mcp" or { path, authorization: { servers, verify } }: turns MCP on (root only)
  adapter        joined in app.module.ts, never written here: await createPrismaAdapter({ ...adapter, client }) (root only)
  prebuilt       serverless and edge only, joined where the framework is created: aventaraContracts (root only)
  diagnostics    (d: AvDiagnostic) => void: the real error behind every A3xxx (root only)
  misuse         (e: AvMisuseEvent) => void: refused unreadable server-side input (root only)
  application    overlay for your server code (framework.application, appTx, ctx calls)
  client         overlay for remote callers (HTTP, the generated client)
  agent          overlay for AI agents over MCP, plus extends: "client" | "application" | "root"
  -- the six layer keys, at the root and in every overlay --
  exposed            true: exemptions hide; false: exemptions are all that is exposed
  exemptions         { resources: { <R>: true | { operations?, fields? } } }
  transactionsStyle  "interactive" | "none"
  limits             { maxListLimit, maxNestingDepth, maxTransactionOperations, maxBooleanNodes, maxJsonDepth, maxRequestBytes, maxAll, maxAllConcurrency }
  pipelines          { guards, pipes, hooks: { before, after }, interceptors, filters, cache }   cache: find only, never in application or agent (see Caching reads)
  resources
    <Resource>
      managedElsewhere               root only: true when another service owns and migrates the table: read and joined, never written
      pipelines                      every operation of the Resource
      operations
        <family>                     find | create | update | delete | upsert
          pipelines                  every variant of the family
          forceTransaction           true: a plain call runs as a one-step transaction
          <variant>                  e.g. create.one, find.many
            pipelines                that one operation (typed ctx.$args)
            forceTransaction
      transactions
        pipelines                    once per transaction with a top-level step on the Resource
      fields
        <field>
          definition                 root only: add a virtual field, or give a Json field its AvZ shape
          pipelines
            validators               AvZ checks
            pipes                    (value) => value
            compute                  { create, update, read }
            guards                   (value, ctx) => boolean
```

## How a layer combines with the root

| Key | Rule |
|---|---|
| `exposed` + `exemptions` | Narrowing only. An overlay starts from the root's view and can hide more, never bring back what the root hid. |
| `transactionsStyle` | Override: the overlay's value when present, else the root's. |
| `limits` | Override per limit. |
| `pipelines` (every level) | Additive: the root's stages run, then the overlay's. Nothing removes a stage. |
| `pipelines.cache` | Not additive: the most specific level wins (variant, family, Resource, layer); at one level the `client` layer's replaces the root's. |
| field `validators` | Additive. |
| field `compute` | Chained: the root's stage runs, then the overlay's, which receives the root's result as `value`. |
| field `definition` | Root only (`CONFIG_FORBIDDEN_IN_OVERLAY` in an overlay). |
| `managedElsewhere` | Root only (`CONFIG_FORBIDDEN_IN_OVERLAY` in an overlay). |
| `forceTransaction` | Forced when the root or the operation's overlay sets it. |

An override wins when present, not when truthy (`false` overrides). An explicit `undefined` is refused: leave the key out. The `agent` layer narrows the layer it `extends` (default `"client"`).

## Exposure

| Value in `exemptions` | Under `exposed: true` (Omit) | Under `exposed: false` (Pick) |
|---|---|---|
| `true` | hide the entry and everything under it | expose the entry and everything under it |
| `false` | nothing (same as leaving it out) | nothing |
| a list | hide the listed entries one level down | expose only the listed entries |
| an object | go one level deeper | go one level deeper |

| Level | Names you can list |
|---|---|
| `operations` | `find`, `create`, `update`, `delete`, `upsert` |
| a family | `find`: `first`, `unique`, `many`, `count`; `create`: `one`, `many`, `count`; `update`: `first`, `unique`, `many`, `count`; `delete`: `first`, `unique`, `count`; `upsert`: `unique` |
| a scalar field | `select`, `filter`, `order`, `orderNulls`, `create`, `update` |
| a relation field | `select`, `include`, `filter`, `order`, `pagination`, `reducers`, `create`, `update` |
| a capability's tokens | `filter`: operators (`equals`, `in`, `contains`, …); `create`/`update`: directives (`$increment`, `$push`, …); relation `create`/`update`: `$create`, `$connect`, `$connectOrCreate`, `$disconnect`, `$set`, `$update`, `$delete`, `$upsert` |

Prisma has no `delete.many`. Common shapes:

- Write-only field: `fields: { passwordHash: ["select", "filter", "order"] }`.
- Read-only for remote callers: `client.exemptions…fields: { likeCount: ["create", "update"] }`.
- Hide a Resource from remote callers: `client.exemptions.resources.AuditLog: true`. Hide the relations that point at it too, or startup fails with `COMPILER_DANGLING_RELATION`.
- A public client that reaches only what the frontend calls: `client: { exposed: false, exemptions: { resources: { Post: { operations: { find: ["many", "unique"] }, fields: { id: ["select"], title: ["select"] } } } } }`. A unique operation needs its identifier exposed (`COMPILER_MISSING_IDENTIFIER`).

A hidden field disappears from that layer's inputs, outputs, filters, ordering and the generated client. A client exemption changes the contract hash: regenerate the frontend client.

## A model managed elsewhere

When another service owns a table and migrates it (Better Auth's `user`, say, or another service's schema in the same
database), mark its model `managedElsewhere: true` at the root. Aventara then reads it and joins through it, and no
standard operation writes it:

- it has no `create`, `update`, `delete` or `upsert`, and its fields take no write;
- a relation into it keeps only `$connect`/`$disconnect`, and only where your model holds the key (`authorId`);
- the client and agent layers leave it out, with every relation into it; your server code reads and joins it;
- a stage on one of its write families is refused at startup (`COMPILER_UNAVAILABLE_OPERATION`), and so is any
  `client.resources` or `agent.resources` entry for it (`COMPILER_UNKNOWN_RESOURCE`): nothing there would run;
- a delete whose `onDelete` would cascade into it or null its reference is refused at startup (`CONFIG_INVALID_VALUE`);
  hide that delete at the root or make the reference `onDelete: Restrict`;
- a create only the hidden relation could satisfy is refused (`COMPILER_HIDDEN_REQUIRED_FIELD`): expose the reference
  field.

Still yours: a key update follows the owner's foreign key (`ON UPDATE`), and `ctx.$sql` or a stage calling Prisma can
still write the table.

Keep Prisma from migrating it too: list it in `prisma.config.ts` as an external table (Prisma 7.10:
`experimental: { externalTables: true }`, `tables: { external: ["auth.user"] }`), and give the model its
`@@schema("auth")` when the owner keeps it in another PostgreSQL schema. If the owner's own `_prisma_migrations` table
sits in a schema your datasource lists, list it as external as well, or `prisma migrate` stops with
`migration persistence is not initialized`.

## Limits

| Limit | Default | Exceeded |
|---|---|---|
| `maxRequestBytes` | `1048576` | `A2010` |
| `maxNestingDepth` | `12` | `A2009` / `V1013` |
| `maxListLimit` | `250` | `A2009` / `V1014` |
| `maxTransactionOperations` | `20` | `A2009` / `V1014` |
| `maxBooleanNodes` | `50` | `A2009` / `V1015` |
| `maxJsonDepth` | `64` | `A2009` / `V1021` |
| `maxAll` | `10` | operations in one `POST /_all`: `A2009` / `V1014` (the generated client splits; in-process `all` ignores it) |
| `maxAllConcurrency` | `4` | operations of one set running at once; the rest wait (at least `1`) |

## Caching reads

A read with a `cache` stage is also served as a `GET` the browser, or a CDN, may keep for `maxAge` seconds; the generated client sends it that way. Without one, every read is a `POST` and nothing caches it.

```ts
// src/resources/post.resource.ts
import { cache, defineResource } from "@aventara/core";
import { discovery } from "../generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;

export const post = defineResource<Model>()("Post", {
  // Post.find.unique, .first, .count: each caller's own browser keeps its answer.
  pipelines: { cache: cache({ for: "user", maxAge: 30 }) },
  operations: {
    // Post.find.many: anonymous callers share one answer a CDN may keep.
    find: { many: { pipelines: { cache: cache({ for: "anonymous", maxAge: 60 }) } } },
  },
});
```

- `cache({ for, maxAge })` is data, not a function that runs. Always write `for`, and write it first, even for the default `"user"`: it is the promise the read makes, and nothing checks it. This is the one exception to writing only what changes behaviour (SKILL.md rule 16).
- `maxAge` is whole seconds.
- Where: `pipelines.cache` at the root or the `client` layer (every find), a Resource (every find of it), its `find` family, or one `find` variant. Anywhere else (a write family or variant, `transactions`, the `application` or `agent` layer) fails startup with `CONFIG_INVALID_VALUE` at its path.
- Precedence: the most specific level wins (variant, family, Resource, layer); at one level the `client` layer's stage replaces the root's. It never adds up.
- A module that also imports React's `cache` (Next.js) imports ours as `import { cache as avCache } from "@aventara/core"`.
- Adding, changing or removing a stage changes the contract hash: regenerate the frontend client.

| `for` | Promise | A `200` carries |
|---|---|---|
| `"user"` (default) | The answer is this caller's own. | `Cache-Control: private, max-age=…`, `Vary: Authorization, Cookie` |
| `"anonymous"` | Every anonymous caller gets the same answer. | `public` to an anonymous caller (a CDN may keep it), `private` to a signed-in one; `Vary: Authorization, Cookie` |
| `"everyone"` | Every caller gets the same answer. | `Cache-Control: public, max-age=…`: a CDN hands it to anyone |

Pick the narrowest true one. `"everyone"` only when nothing makes the answer differ by caller: no guard, pipe, compute or policy that reads the caller, or a CDN serves one caller's answer to all. Anonymous means: with a policy, the principal it derives is `null`/`undefined`; without one, no `Cookie` and no `Authorization` header. Callers who sign in with a header of their own (`X-Api-Key`) need a policy, or no `"anonymous"`/`"everyone"`.

Also: the arguments land in the URL (server and proxy logs, history), so never cache a read whose arguments are secret; prefetches run the read and its stages; Aventara keeps no server-side copy; a stage tells the two routes apart by `ctx.$transport.method` (`"GET"` or `"POST"`). Behind a CDN: honor `Vary` (or bypass on `Cookie`/`Authorization`) and keep `Set-Cookie` off `GET <api>/_resources/…`.

## Fields

- Add a virtual field at the root: `definition: { type: { scalar: "string" }, nullable: false, list: false, lifecycle: ["VIRTUAL"], capabilities: { select: true } }` plus a `compute.read` stage. A write-only virtual input says `capabilities: { select: false, create: [], update: [] }`.
- Type a `Json` column: `definition: { json: AvZ.object({ … }) }`; every write is checked against it and the client types follow it.
- A `compute.create` stage makes its field optional on create, and must return a value when the caller sent none.
- A `compute.read` stage with no `dependsOn` declares no field it reads, so it computes from the same inputs for every row: such a value usually belongs in response metadata or `ctx.$state`, not in a field.

## Startup

A wrong configuration throws one `AvConstructionError` before the server listens: `stage` (`configuration`, `discovery` or `contract-compilation`) and `diagnostics`, each `{ code, path, message, docs }`. `path` names the key; `reference/errors.md` explains each code.
````

### reference/stages.md

````markdown
# Stages reference

## The stages

| Stage | Key | Receives | Returns |
|---|---|---|---|
| Guard | `guards` | `(ctx)` | `true`/`undefined` to allow, `false` to deny (`A4001`); or throw an `AvError` |
| Pipe | `pipes` | `(args, ctx)` | new arguments, or `undefined` to keep them; the only stage that changes arguments |
| Hook | `hooks.before`, `hooks.after` | before `(ctx)`; after `(result, ctx)` | nothing |
| Interceptor | `interceptors` | `(ctx, next)` | the result of `next()`, called exactly once |
| Filter | `filters` | `(error, ctx)` | an `AvError` to answer with, or `undefined` to pass it on |
| Validators (field) | `fields.<f>.pipelines.validators` | `AvZ` checks | data, part of the contract |
| Field pipe | `fields.<f>.pipelines.pipes` | `(value)` | the new value; no `ctx` |
| Compute (field) | `fields.<f>.pipelines.compute` | `create`/`update`: `({ value, data, ctx })`; `read`: `{ dependsOn, compute: ({ record }) }` | the field's value |
| Field write guard | `fields.<f>.pipelines.guards` | `(value, ctx)` | `false` refuses when the caller sends the field |

A relation field takes write guards only. Stage types to annotate with: `AvGuard`, `AvPipe`, `AvBeforeHook`, `AvAfterHook`, `AvInterceptor`, `AvFilter`, `AvFieldPipe`, `AvFieldGuard`, and `AvTransactionGuard`, `AvTransactionPipe`, `AvTransactionBeforeHook`, `AvTransactionAfterHook`, `AvTransactionInterceptor`, `AvTransactionFilter`. Pass your model (`AvAfterHook<Model>`, `type Model = typeof discovery.model`) when the stage calls `ctx.<Resource>`.

## Levels

| Level | Key | Runs for |
|---|---|---|
| Layer | `pipelines` | every operation of the layer |
| Resource | `resources.<R>.pipelines` | every operation of R |
| Family | `resources.<R>.operations.<family>.pipelines` | every variant of the family |
| Variant | `resources.<R>.operations.<family>.<variant>.pipelines` | that operation; `ctx.$args` is typed |
| Field | `resources.<R>.fields.<f>.pipelines` | field f's value |
| Resource transactions | `resources.<R>.transactions.pipelines` | once per transaction with a top-level step on R |

The root's stages run for every origin; an overlay's only for its own (`ctx.$origin`: `"application"`, `"client"` or `"agent"`). Register a stage once, at the outermost level it applies to: a root stage copied into an overlay runs twice. Registering a stage does not expose an operation.

## Order

```text
framework validation (required create fields included; a field compute.create fills is not required yet)
-> guards       layer -> Resource -> family -> variant (root, then overlay, at each), then field write guards
-> pipes        the same levels, then field pipes
-> compute      create or update (write compute)
-> re-check     Aventara's own checks on the pipe and compute output (A3004, A3000), then field validators and Json shapes on every value, computed included (A2004)
-> interceptors enter, outer to inner
-> hooks.before
-> operation    one adapter call, then compute read on the returned rows
-> hooks.after
-> interceptors unwind
on a failure after validation: filters, inner to outer; the first that handles it wins
```

A call refused by a guard, the re-check or a validator runs no interceptor and no hook. A `unique` operation that matches no row fails at the operation (`AvNotFoundError`, `A2003`); no `after` hook runs.

With `forceTransaction` (or as a step of a transaction plan), guards and pipes run before the transaction, and validators judge the literal values no write compute changes; a refusal there opens nothing. Then: `BEGIN -> the Resource's transaction stages -> write compute -> re-check (computed and $ref values included) -> interceptors -> hooks.before -> adapter call -> hooks.after -> interceptors -> COMMIT`. A refusal inside rolls the transaction back. The hooks' `ctx` calls and `ctx.$sql` join it; the guards' and pipes' calls do not.

## Rules that are easy to miss

- `ctx` calls (`ctx.<Resource>.<family>.<variant>(args)`) are raw: validation, field pipes, compute and validators run; guards, pipes, hooks, interceptors, filters and transaction stages do not. They are application-origin: the `application` overlay's exposure applies, the `client` overlay's does not. They resolve data directly and throw the `AvError` subclass of a failure.
- `ctx.$args` is frozen. A pipe returns new arguments; an `after` hook gets a frozen result. To answer with a different result, use an interceptor. A `Date` or bytes value cannot be frozen, so each stage gets its own copy: changing one in place changes nothing another stage sees, what is written or what the caller receives.
- `ctx.$state` is the only thing a stage writes in place: one object per request, shared by every stage and inherited by `ctx` calls. Compute can read it, not write it.
- `compute.read` gets the row (`record`) frozen, with its own copy of each `Date` or bytes value: return the field's value. Writing into `record` throws and answers `A3000`; the answer is built from the row as read.
- Compute gets a read-only `ctx`: `find.*` calls only, no writes, no `$sql`, no `$transaction` (reaching one answers `A3000`). Effects on other rows belong in an `after` hook under `forceTransaction`.
- A required create field the caller left out is refused before the guards; no pipe can fill it. Use `compute.create` or a database default.
- Validators run after write compute, so they judge the computed value too: a `compute.create` result that fails a validator answers `A2004`. Aventara's own re-check comes first: a pipe that returns a wrong type or an unknown key, or drops a required field, answers `A3004`, as does a pipe or compute that writes a reference twice; a compute that returns a wrong type or a value its field's `format` refuses (a relative path for `format: "url"`), or leaves a required field missing, answers `A3000`.
- Validators do not judge a directive's operand (`{ $increment: 500 }`); `$push` entries are judged.
- `pipelines.cache` runs nothing: it is data that lets a read be served as a cacheable `GET` (`reference/config.md`, Caching reads), and the one `pipelines` key that does not add up across levels. Every stage runs on that `GET` as on the `POST`; `ctx.$transport.method` tells them apart.
- Calls grouped into one `POST /_all` each run their own full pipeline, exactly as alone (`reference/client.md`).
- A Resource reached only through a nested write runs that Resource's guards and field stages, not its transaction stages, hooks or interceptors.
- Without a transaction, a write has committed when its `after` hook runs.
- A guard or pipe that throws a non-`AvError` answers `A3000` and the real error goes to `diagnostics`; throw `new AvError(code, message)` to answer a code. A thrown `A2004` may carry `issues: [{ path: ["arguments", …], code: "V1001", message }]`.
- A pipe's output is re-checked against the server's own contract before compute and validators see it: returning a field the Resource does not have, or a wrong type, answers `A3004`. Name pipes (`function scopeToTenant(…)`) so the server log names them.
````

### reference/recipes.md

````markdown
# Recipes

Every block here compiles against the Aventara release this skill was written for. Model names (`User`, `Post`, `Order`, `OutboxEvent`) are examples: use your schema's.

## The signed-in user, for every stage

Declare what the request state holds, once:

```ts
// src/aventara.state.ts
declare module "@aventara/core" {
  interface AvState {
    user?: { id: number; role: "member" | "admin" };
  }
}
export {};
```

Seed it from your auth middleware's result, in `src/app.module.ts`:

```ts
// src/app.module.ts
import { Module } from "@nestjs/common";
import { AventaraModule } from "@aventara/nest";
import { createPrismaAdapter } from "@aventara/prisma7-adapter";
import type { Request } from "express";
import adapter from "./aventara.adapter.js";
import { aventaraConfig } from "./aventara.config.js";
import { PrismaModule, PrismaService } from "./prisma.service.js";

type AuthedRequest = Request & { user?: { id: number; role: "member" | "admin" } };

@Module({
  imports: [
    PrismaModule,
    AventaraModule.forRootAsync({
      imports: [PrismaModule],
      inject: [PrismaService],
      useFactory: async (prisma: PrismaService) => ({
        config: {
          ...aventaraConfig,
          adapter: await createPrismaAdapter({ ...adapter, client: prisma }),
        },
        state: (req: AuthedRequest) => ({ user: req.user }),
      }),
    }),
  ],
})
export class AppModule {}
```

Server code passes it per call: `framework.application.Post.create.one({ data }, { state: { user } })`. Guards read it:

```ts
import { AvError, type AvGuard } from "@aventara/core";

export const requireUser: AvGuard = (ctx) => {
  if (ctx.$state.user === undefined) throw new AvError("A4000", "Sign in first.");
  return true;
};
export const adminOnly: AvGuard = (ctx) => ctx.$state.user?.role === "admin";
```

Put `requireUser` in `client: { pipelines: { guards: [requireUser] } }` (remote callers only), and `adminOnly` where it applies (`client: { resources: { Post: { operations: { delete: { pipelines: { guards: [adminOnly] } } } } } }`).

## A Resource in its own file, with a server-filled owner

`Post.authorId` is required; remote callers must not choose it. `compute.create` fills it from the signed-in user, which also makes it optional on create; the `client` exemption takes both `authorId` and the `author` relation out of the remote create and update inputs. Hiding only `authorId` is not enough: `author: { $connect: … }` would still let a caller set or move the owner.

```ts
// src/resources/post.resource.ts
import { AvError, defineResource } from "@aventara/core";
import { AvZ } from "@aventara/core/avz";
import { discovery } from "../generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const post = defineResource<Model>()("Post", {
  fields: {
    title: { pipelines: { validators: [AvZ.regex(/\S/), AvZ.maxLength(200)] } },
    slug: {
      pipelines: {
        compute: {
          create: ({ data }) => slugify(String(data.title)),
          update: ({ data, value }) => (data.title === undefined ? value : slugify(String(data.title))),
        },
      },
    },
    authorId: {
      pipelines: {
        compute: {
          create: ({ value, ctx }) => {
            const user = ctx.$state.user;
            if (user !== undefined) return user.id;
            if (typeof value === "number") return value;
            throw new AvError("A4000", "Sign in first.");
          },
        },
      },
    },
  },
});
```

Run `npm run aventara:prepare`: it adds `post` to `aventaraResources` (`resources.generated.ts`, beside the discovery artifact), which the configuration's `resources: aventaraResources.root` already takes, so `aventara.config.ts` needs no edit. Two files defining the same Resource stop `aventara:prepare` with both named. A Resource that gives a layer a block (`defineResource<Model>()("Post", { … }, { client: { … } })`) needs that layer's line once: `client: { resources: aventaraResources.client }`. Take `authorId`, `author` and `slug` out of the remote inputs in the `client` layer's `exemptions` (next recipe): exposure lives in a layer's `exemptions`, never in a `defineResource` block.

## Exposure: what each caller may reach

```ts
// in aventaraConfig (src/aventara.config.ts)
exemptions: {
  resources: {
    User: { fields: { passwordHash: ["select", "filter", "order"] } },   // write-only everywhere
  },
},
client: {
  exposed: true,
  exemptions: {
    resources: {
      AuditLog: true,                                                     // remote callers never see it
      User: { operations: { delete: true }, fields: { internalNotes: true } },
      Post: { fields: { authorId: ["create", "update"], author: ["create", "update"], slug: ["create", "update"] } }, // filled by the server; a caller writing `author` gets A2004 (V1006)
    },
  },
},
```

## Values: validators and a field pipe

```ts
// in a defineResource block's fields, or resources.<R>.fields
email: {
  pipelines: {
    pipes: [(value) => (typeof value === "string" ? value.trim().toLowerCase() : value)],
    validators: [AvZ.email(), AvZ.maxLength(254)],
  },
},
```

Validators are `AvZ` checks only (`minLength`, `maxLength`, `regex`, `email`, `uuid`, `gte`, `lte`, `multipleOf`, `maxItems`, …). A rule across two fields, or one that reads the database, is a guard.

## An outbox event that commits with the order

```ts
// src/resources/order.resource.ts
import { defineResource } from "@aventara/core";
import { discovery } from "../generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;

export const order = defineResource<Model>()("Order", {
  operations: {
    create: {
      one: {
        forceTransaction: true,
        pipelines: {
          hooks: {
            after: [
              async (result, ctx) => {
                // The result holds what the caller selected: narrow it, never cast it.
                const id = typeof result === "object" && result !== null && "id" in result ? result.id : undefined;
                // Runs inside the order's transaction: a throw rolls the order back.
                if (typeof id !== "number") throw new Error('create orders with select: ["id"]');
                await ctx.OutboxEvent.create.one({
                  data: { topic: "order.created", payload: { orderId: id } },
                  select: ["id"],
                });
              },
            ],
          },
        },
      },
    },
  },
});
```

Orders are created by server code, which selects `id`: `framework.application.Order.create.one({ data, select: ["id"] })`. Hide both from remote callers: `client.exemptions.resources: { OutboxEvent: true, Order: { operations: { create: true } } }`. A consumer reads new `OutboxEvent` rows (or, on PostgreSQL with a queue, the hook sends the event's id with ``ctx.$sql`…` ``).

## Server code

Nest's injection carries no type argument, so a module of its own exports the framework's type once:

```ts
// src/aventara.framework.ts
import { createFramework } from "@aventara/core";
import { createPrismaAdapter } from "@aventara/prisma7-adapter";
import adapter from "./aventara.adapter.js";
import { aventaraConfig } from "./aventara.config.js";
import type { PrismaService } from "./prisma.service.js";

export const buildFramework = async (prisma: PrismaService) =>
  createFramework({ ...aventaraConfig, adapter: await createPrismaAdapter({ ...adapter, client: prisma }) });
export type AppFramework = Awaited<ReturnType<typeof buildFramework>>;
```

```ts
// src/post-reader.service.ts
import { Injectable } from "@nestjs/common";
import { AvNotFoundError } from "@aventara/core";
import { InjectFramework } from "@aventara/nest";
import type { AppFramework } from "./aventara.framework.js";

@Injectable()
export class PostReader {
  constructor(@InjectFramework() private readonly framework: AppFramework) {}

  async findOrNull(id: number) {
    try {
      return await this.framework.application.Post.find.unique({ where: { id }, select: ["id", "title"] });
    } catch (error) {
      if (error instanceof AvNotFoundError) return null;
      throw error;
    }
  }
}
```

`framework.application` calls resolve the data and throw the code's `AvError` subclass; `find.first` resolves `null` instead of throwing. Several writes that must succeed together: `framework.transaction([framework.appTx.Post.create.one(…), …])`, or `ctx.$transaction(async (tx) => …)` inside a stage.

## Agents (MCP)

```ts
// in aventaraConfig
mcp: "/mcp",
agent: {
  exposed: true,
  exemptions: { resources: { User: { operations: { delete: true } } } },
},
```

Without `mcp.authorization` the endpoint answers callers on the same machine only; set `authorization: { servers, verify }` before deploying. A guard can tell an agent apart: `ctx.$origin === "agent"`.
````

### reference/errors.md

The same catalog as [Error codes](/docs/error-codes), as one Markdown table per kind. It ships in the package as `node_modules/@aventara/core/ERRORS.md`; copy that file.

## Types are the guardrail

Keep the configuration `as const`, and TypeScript checks every name in it against your model. A mistake is reported at the key that is wrong, in words. An overlay that exposes a field the root hid, for example, fails like this:

```text
Property '"Error: client cannot expose 'User.internalNotes': hidden by root"' is missing in type 'readonly ["select"]' but required in type '{ readonly "Error: client cannot expose 'User.internalNotes': hidden by root": true; }'.
```

So the skill tells agents never to cast a type away (`as`, `!`, `any`, `@ts-ignore`): the error names the fix. Calls are typed the same way: `select`, `where` and `data` are checked against the layer the call goes through, and a create that leaves out a required field does not compile.

## Errors an agent can act on

Every code Aventara answers or refuses with is in one catalog, `AvErrorCatalog`, exported by `@aventara/core`: its `kind`, `message`, `cause`, `fix` and `docs` URL. An agent, or your own error handling, can look any code up:

```ts
import { AvErrorCatalog, AvValidationError } from "@aventara/core";

export function explain(error: unknown): string {
  if (!(error instanceof AvValidationError)) return String(error);
  const issues = error.cause.issues ?? [];
  return issues
    .map((issue) => `${issue.path?.join(".")}: ${issue.message} (${AvErrorCatalog[issue.code].fix})`)
    .join("\n");
}
```

- A startup failure (`AvConstructionError`) lists each problem as `{ code, path, message, docs }`; `docs` is the code's entry on [Error codes](/docs/error-codes).
- A validation issue carries its `path` in the request and, for a [field validator](/docs/field-validators), the failed `check` and its `params` (`"check": "max_length", "params": { "maximum": 80 }`), so an agent can fix the value without guessing.
- The catalog ships as `ERRORS.md` in `@aventara/core`, and the skill's `reference/errors.md` is that file.

## One way per task

Most tasks have exactly one place in Aventara: a permission is a guard, a value rule is a validator, a server-filled field is `compute.create`, a side effect that must commit with the write is an `after` hook under `forceTransaction`. [Which stage do I use?](/docs/which-stage) is the table, and the skill's rules repeat it. Models need no controllers: every model already has its operations, shaped by [exposure](/docs/exposure).

## A client that cannot drift

The frontend client is generated from the server's contract (`avclient generate`), so its types are what the server accepts. Every request carries the contract's hash; after a schema or configuration change, a client generated before it is refused with `A2005` (`AvContractMismatchError`) instead of sending a request the server no longer understands. The fix is always the same: regenerate. See [Contract hash](/docs/contract-hash).

## Let your coding agent talk to your running app

With `mcp` on and no `authorization`, the MCP endpoint answers callers on the same machine only, which is what a coding agent next to your dev server is:

```ts
// in aventaraConfig (src/aventara.config.ts)
mcp: "/mcp",
```

Connect your agent to it. In Claude Code:

```bash
claude mcp add --transport http my-api http://localhost:3000/mcp
```

The agent can then read `aventara://contract` and call `find`, `create` and the other tools against your development database while it builds a feature: it checks its own queries against real data. It sees the agent view of your API, which is the client view unless you add an `agent` layer (`agent: { extends: "application" }` gives it what your server code sees). Before you deploy, set `mcp.authorization`: without it, any caller that is not local gets `403`. The full setup, the tools and authorization are on [MCP](/docs/mcp).

## Docs for agents

Every page of this documentation is plain Markdown, and the code blocks on it are compiled against each release before it ships.

Your app can also expose its own data to agents in production over MCP: see [MCP](/docs/mcp).
