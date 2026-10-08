---
title: Getting started
description: Create an Aventara API, run it, generate a typed frontend client and make your first call.
order: 4
section: get-started
---

# Getting started

This takes a new directory to a running API and a typed frontend call.

## 1. Create the server

You need Node `^22.18.0 || >=24.2.0` (see [Installation](/docs/installation#requirements); on Node 22 use npm 11 or newer).

```bash
npx @aventara/cli@rc new my-api
```

The command asks for the ORM, the database and the package manager. Each has a flag, and `--yes` takes the defaults (Prisma 7, SQLite, the package manager you launched it with). It runs `nest new` for you, adds Aventara, installs everything and, last, commits the result:

```bash
npx @aventara/cli@rc new my-api --yes
npx @aventara/cli@rc new my-api --orm prisma7 --db postgresql --package-manager pnpm
```

`--orm` takes an adapter name: `prisma7` today (Prisma 7). `prisma` and `prisma@7` are refused, and the message names the choice. See the [CLI reference](/docs/cli-reference#flags) for every flag.

While it works it shows each step (`[3/4] Installing dependencies (npm install)`), so a long install never looks hung; add `--verbose` to see the output of `nest new` and of the install as it runs. A successful run ends with the commit, a closing line with the total time, and the next steps, which are the last thing printed:

```text
aventara: committed the scaffold: "Initial Aventara Scaffold".
aventara: created my-api in 1m 53s.
Next:
  1. Enter the project: cd my-api
  2. Create the database tables: npx prisma db push
  3. Start the server: npm run start:dev
  4. In your frontend: npx @aventara/client@rc init
```

That commit is skipped, with a one-line reason, when `git` is not installed or has no `user.name` and `user.email`, when the new directory is inside a repository already, or with `--skip-git`. `.env` is never committed (the scaffold's `.gitignore` lists it).

### What it creates

A normal NestJS 12 project, plus:

| File | What it is |
|---|---|
| `prisma/schema.prisma` | Your schema, with a starter `User` model. Yours to edit. |
| `prisma.config.ts` | Prisma configuration; loads `.env` for you. |
| `src/prisma.service.ts` | `PrismaService` (the Prisma client with its driver adapter) and `PrismaModule`. |
| `src/aventara.config.ts` | Your Aventara configuration: entrypoint `/api`, plus the restrictions and pipelines you add. Yours to edit. |
| `src/app.module.ts` | Edited once to import `PrismaModule` and `AventaraModule.forRootAsync(...)`. |
| `src/main.ts` | Edited once to enable CORS for the origins in `CORS_ORIGINS`, and to hold a commented-out rate limiter (below). |
| `.env` | `DATABASE_URL="file:./dev.db"` and `CORS_ORIGINS`. Not committed. |
| `src/generated/` | Generated on every install by `npm run aventara:prepare`. Never edit. |

The starter schema:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlite"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
```

And `src/aventara.config.ts`:

```ts
import { createPrismaAdapter } from '@aventara/prisma7-adapter';
import { discovery } from './generated/aventara/discovery.artifact.js';
import type { PrismaService } from './prisma.service.js';

export async function aventaraConfig(prisma: PrismaService) {
  return {
    entrypoint: '/api',
    adapter: await createPrismaAdapter({
      client: prisma,
      discovery,
      provider: 'sqlite',
      driver: '@prisma/adapter-better-sqlite3',
    }),
  } as const;
}
```

A fresh NestJS 12 project is an ES module (`"type": "module"`, `nodenext` module resolution), so its own imports end in `.js`, as above, even though the files are `.ts`. Your own files follow the same rule.

And `src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // The browser origins allowed to call this server: CORS_ORIGINS in .env,
  // comma-separated. Unset or empty, CORS stays off.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false });
  // Rate limiting: @nestjs/throttler is a Nest guard and does not run on Aventara's
  // routes; a platform-level limiter does. `npm i express-rate-limit`, import
  // { rateLimit } from 'express-rate-limit', pick your limits and uncomment below.
  // See: https://aventara-framework.vercel.app/docs/limits-and-safety#rate-limiting
  // app.use(rateLimit({ windowMs: 60_000, limit: 100 }));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

Two details of `main.ts`:

- CORS: a browser on another origin (a Vite dev server on `5173`, a Next.js one on `3001`) can call the API only if its origin is in `CORS_ORIGINS`, a comma-separated list in `.env`. The scaffold lists `http://localhost:5173,http://localhost:3001`. Unset or empty, CORS is off. Add your deployed frontend's origin before you deploy. CORS is a browser rule, not access control: servers and bots ignore it, so [guards](/docs/authentication-and-guards) decide who may call.
- Rate limiting: the commented lines are a platform-level limiter. Read [Rate limiting](/docs/limits-and-safety#rate-limiting) before you switch it on.

## 2. Create the tables and start the server

`aventara new` never touches a database. Create the tables, then start:

```bash
cd my-api
npx prisma db push
npm run start:dev
```

On startup the server logs one line naming what it mounted:

```text
Aventara mounted 15 operations at /api (+ GET /api/_contract, POST /api/_transactions)
```

(The operation count depends on your schema and configuration.) With pnpm, use `pnpm exec prisma db push`. With PostgreSQL, set `DATABASE_URL` in `.env` first.

Check that the server answers. `GET /api/_contract` returns the contract the frontend client is generated from:

```bash
curl -i http://localhost:3000/api/_contract
```

```text
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "sha256:0b2afa72…"
Cache-Control: no-cache
Aventara-Request-Id: 5d3f71a4-1f2e-4639-9600-98571495484b

{"enums":{},"limits":{…},"protocol":{"hash":"sha256:0b2afa72…","version":1},"referenceWrites":"uniform","resources":{"User":{…}},…}
```

Every operation is a `POST` that carries the contract's hash. Fetch the hash, then list the users (none yet):

```bash
HASH=$(curl -s http://localhost:3000/api/_contract | node -pe 'JSON.parse(require("fs").readFileSync(0)).protocol.hash')

curl -s -X POST http://localhost:3000/api/_resources/User/find/many \
  -H 'Content-Type: application/json' \
  -H 'Aventara-Protocol-Version: 1' \
  -H "Aventara-Contract-Hash: $HASH" \
  -d '{}'
```

```json
{"data":[],"code":"A1000","cause":null}
```

You will normally use the generated client instead of curl; the protocol is documented in [HTTP protocol](/docs/http-protocol).

### Changing the schema

When you change `prisma/schema.prisma`, run:

```bash
npx prisma db push        # or your migration workflow
npx prisma generate
npm run aventara:prepare  # regenerates src/generated/aventara/discovery.artifact.ts
```

`aventara:prepare` also runs on every `npm install`, and in a project made by `aventara new` or `aventara init` before `build`, `start`, `start:dev` and `start:debug` (the `prebuild` and `prestart*` scripts), so restarting `npm run start:dev` is enough there. Yarn Berry, and pnpm with `enable-pre-post-scripts=false`, skip those hooks: run `aventara:prepare` yourself. Restart the server afterwards. Because the contract changes, you must also [regenerate the frontend client](/docs/contract-hash#the-regenerate-workflow).

## 3. Set up the frontend client

In your frontend project (any TypeScript project with a `tsconfig.json`; plain JavaScript projects are not supported yet; see [Troubleshooting](/docs/troubleshooting) for known cosmetic warnings on the first run):

```bash
npx @aventara/client@rc init
```

It asks four questions, in this order: the server's entrypoint (default `http://localhost:3000/api`), the environment variable that holds the entrypoint, where to put the client (default `./src/api`) and the package manager. Then it writes `framework.client.ts`, adds the `.env` entry and an `avclient:generate` script, installs `@aventara/client` as an exact dev dependency, adds `.env` to the frontend's `.gitignore`, and generates the client from the running server. A frontend served from another origin (Vite on `5173`) can call the server because the scaffold's `CORS_ORIGINS` lists it; see [Browsers and CORS](/docs/client-setup#browsers-and-cors).

Later, regenerate any time with:

```bash
npm run avclient:generate
```

The generated client lives in `src/api/`: `AvClient.ts` and `generated/`. Commit it. It is TypeScript source, and it imports its own files the way your project's `tsconfig.json` says, so you import it like any of your own files.

## 4. Make a typed call

Resource keys are your Prisma model names: `User`, `Post`, and so on. The import path follows your project ([the spelling for each kind of project](/docs/client-setup#importing-the-client)); in a Vite or Next.js project it is extensionless:

```ts
import avClient from "./api/AvClient";

const ada = await avClient.User.create.one({
  data: { email: "ada@example.com", name: "Ada" },
  select: ["id", "email"],
});
// { id: 1, email: "ada@example.com" }

const users = await avClient.User.find.many({
  where: { email: { contains: "example.com" } },
  orderBy: { id: "desc" },
  limit: 5,
});

const nobody = await avClient.User.find.first({ where: { email: "nobody@example.com" } });
// null: a first-style miss is null, not an error
```

Everything is typed from the contract: a misspelled field, a filter the field does not support, or an operation the server does not advertise is a compile error.

## 5. Grow the schema

Add a related model and an enum to `prisma/schema.prisma`:

```prisma
enum Role {
  USER
  ADMIN
}

model User {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  name         String?
  role         Role     @default(USER)
  passwordHash String   @default("")
  posts        Post[]
}

model Post {
  id        Int     @id @default(autoincrement())
  title     String
  views     Int     @default(0)
  published Boolean @default(false)
  author    User    @relation(fields: [authorId], references: [id])
  authorId  Int
}
```

Then make `passwordHash` write-only for remote callers in `src/aventara.config.ts`, by adding a `client` block next to `adapter`:

```ts
client: {
  restrictions: {
    User: {
      fields: {
        passwordHash: { capabilities: { select: false, filter: false, order: false } },
      },
    },
  },
},
```

Apply the schema, regenerate the discovery artifact, restart the server, and regenerate the client:

```bash
npx prisma db push
npm run aventara:prepare
npm run start:dev                 # in the server project
npm run avclient:generate         # in the frontend project
```

Now relations, enums and the restriction are all typed on the client:

```ts
import avClient from "./api/AvClient";

const ada = await avClient.User.create.one({
  data: { email: "grace@example.com", name: "Grace", passwordHash: "hash-from-your-auth-code" },
  select: ["id", "email", "role"],
});
// { id: 2, email: "grace@example.com", role: "USER" }

await avClient.Post.create.one({
  data: { title: "Hello", published: true, author: { $connect: { id: ada.id } } },
});

const posts = await avClient.Post.find.many({
  where: { published: true },
  select: ["id", "title", { author: { select: ["id", "name"] } }],
  orderBy: { id: "desc" },
  limit: 10,
});
// [{ id: 1, title: "Hello", author: { id: 1, name: "Ada" } }]

const users = await avClient.User.find.many({
  select: ["id", { posts: { select: ["id", "title", "$count"] } }],
});
// [{ id: 1, posts: { data: [{ id: 1, title: "Hello" }], count: 1 } }]

await avClient.Post.update.many({ where: { published: true }, data: { views: { $increment: 1 } } });
```

Asking for the hidden-from-reads field is refused at compile time, and, if you bypass the types, at runtime:

```ts
await avClient.User.find.many({ select: ["passwordHash"] });
// compile error; at runtime: ValidationError A2004 / V1008, Field "passwordHash" is not selectable.
```

## Next steps

- [Why Aventara](/docs/why-aventara) for the same feature in plain NestJS, GraphQL, tRPC and Aventara.
- [Concepts](/docs/concepts) for layers, operations and result typing.
- Add more models and relations, then read [Querying](/docs/querying).
- Hide a field or add authentication in [Configuration](/docs/configuration).
- Group writes in [Transactions](/docs/transactions).

See also: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Authentication and guards](/docs/authentication-and-guards), [Filtering, sorting and paging](/docs/filtering-sorting-paging).
