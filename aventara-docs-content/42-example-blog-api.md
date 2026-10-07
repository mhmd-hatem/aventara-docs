---
title: "Example: blog API"
description: An end-to-end blog - Prisma schema with Users, Posts and Categories, configuration with a hidden field, client restrictions and a guard, the server, and frontend calls including a transaction.
order: 70
section: examples
---

# Example: blog API

A small blog from schema to frontend calls. Everything here was run against the `0.1.0-pilot.3` packages; the outputs shown are real. The frontend calls import the client as `./api/AvClient`, the Vite and Next.js spelling; a `nodenext` ESM project writes `./api/AvClient.js` ([Importing the client](/docs/client-setup#importing-the-client)).

## 1. Create the server

```bash
npx @aventara/cli@pilot new blog-api --yes --skip-git
cd blog-api
```

## 2. The schema

Replace the starter `User` model in `prisma/schema.prisma` (keep the `generator` and `datasource` blocks as generated):

```prisma
enum Role {
  READER
  AUTHOR
  ADMIN
}

model User {
  id            Int      @id @default(autoincrement())
  email         String   @unique
  name          String?
  passwordHash  String   @default("")
  internalNotes String?
  role          Role     @default(READER)
  createdAt     DateTime @default(now())
  posts         Post[]
}

model Category {
  id    Int    @id @default(autoincrement())
  name  String @unique
  posts Post[]
}

model Post {
  id         Int       @id @default(autoincrement())
  title      String
  body       String?
  published  Boolean   @default(false)
  views      Int       @default(0)
  createdAt  DateTime  @default(now())
  author     User      @relation(fields: [authorId], references: [id])
  authorId   Int
  category   Category? @relation(fields: [categoryId], references: [id])
  categoryId Int?
}
```

Create the tables and regenerate what Aventara reads from the schema:

```bash
npx prisma db push
npm run aventara:prepare
```

## 3. The configuration

`src/aventara.config.ts`:

```ts
import { FrameworkError, type PipelineContext } from "@aventara/core";
import { createPrismaAdapter } from "@aventara/prisma7-adapter";
import { discovery } from "./generated/aventara/discovery.artifact.js";
import type { PrismaService } from "./prisma.service.js";

// Remote callers must send an Authorization header to write.
const requireSignIn = (ctx: Pick<PipelineContext, "family" | "transport">) => {
  if (ctx.family !== "find" && !ctx.transport?.headers["authorization"]) {
    throw new FrameworkError("A4000", "Sign in first.");
  }
  return true;
};

export async function aventaraConfig(prisma: PrismaService) {
  return {
    entrypoint: "/api",
    adapter: await createPrismaAdapter({
      client: prisma,
      discovery,
      provider: "sqlite",
      driver: "@prisma/adapter-better-sqlite3",
    }),
    client: {
      restrictions: {
        User: {
          fields: {
            // write-only: can be set on create/update, never read, filtered or ordered
            passwordHash: { capabilities: { select: false, filter: false, order: false } },
            // not in the client layer at all
            internalNotes: { hidden: true },
          },
          operations: { delete: { first: false, count: false } },
        },
        Post: { operations: { delete: { count: false } } },
      },
      limits: { maxListLimit: 50 },
      pipelines: { guards: [requireSignIn] },
    },
  } as const;
}
```

What each part does, all for **remote callers** (the `client` layer), leaving server-side code untouched:

| Setting | Effect |
|---|---|
| `passwordHash` capabilities | Settable on create and update, but selecting, filtering or ordering by it fails. |
| `internalNotes: { hidden: true }` | The field does not exist for remote callers. |
| `User` `delete` switched off except `unique` | No `first` or `count` deletes for users, so no filtered mass deletion. |
| `maxListLimit: 50` | A list may ask for at most 50 rows. |
| `requireSignIn` guard | Anything that is not a `find` needs an `Authorization` header. Reads stay public. |

See [Configuration](/docs/configuration) for the full model and [Contract layers](/docs/contract-layers) for how layers relate.

## 4. Run the server

```bash
PORT=3000 npm run start:dev
```

```text
Aventara mounted 42 operations at /api (+ GET /api/_contract, POST /api/_transactions)
```

A browser frontend on another origin needs CORS. The scaffold's `src/main.ts` already enables it for the origins in `CORS_ORIGINS` (`http://localhost:5173,http://localhost:3001` in `.env`), so a Vite frontend works as it is; add your own origin to that list when you deploy ([Deploying](/docs/deploying#cors-and-browsers)).

## 5. Generate the client

In the frontend project:

```bash
npx @aventara/client@pilot init --yes --entrypoint http://localhost:3000/api
```

## 6. Frontend calls

```ts
import avClient, { AvClient, ConflictError, AuthError } from "./api/AvClient";

// Signed-in client: the server's guard wants an Authorization header on writes.
const api = new AvClient({
  fetch: (input, init) =>
    fetch(input, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${getToken()}` } }),
});
```

### Read the feed

```ts
const feed = await avClient.Post.find.many({
  where: { published: true },
  select: ["id", "title", "views", { author: { select: ["name"] } }, { category: { select: ["name"] } }],
  orderBy: [{ createdAt: "desc" }],
  limit: 10,
});
```

```json
[
  { "id": 3, "title": "Related", "views": 0, "author": { "name": "Grace" }, "category": { "name": "Tech" } },
  { "id": 1, "title": "Hello", "views": 0, "author": { "name": "Ada" }, "category": { "name": "Tech" } }
]
```

### Posts per category

```ts
const categories = await avClient.Category.find.many({
  select: ["id", "name", { posts: { select: ["$count"] } }],
  orderBy: { name: "asc" },
});
// [{ id: 1, name: "Tech", posts: { count: 2 } }, ...]
```

### Sign up an author with a first post: a transaction

The category and the post need the new author's id, and either all three rows exist afterwards or none do:

```ts
const author = api.tx.User.create.one({
  data: { email: "lin@example.com", name: "Lin", role: "AUTHOR" },
  select: ["id"],
});
const category = api.tx.Category.create.one({ data: { name: "Notes" }, select: ["id"] });
const first = api.tx.Post.create.one({
  data: {
    title: "Hello, blog",
    body: "First!",
    published: true,
    authorId: author.$ref("id"),
    categoryId: category.$ref("id"),
  },
});

const [a, c, p] = await api.transaction([author, category, first]);
// a: { id: 4 }   c: { id: 5 }   p.title: "Hello, blog"
```

Roll back on a conflict (the same email twice):

```ts
try {
  const extra = api.tx.Category.create.one({ data: { name: "should-not-exist" } });
  const again = api.tx.User.create.one({ data: { email: "lin@example.com" }, select: ["id"] });
  await api.transaction([extra, again]);
} catch (e) {
  if (e instanceof ConflictError) {
    console.log(e.code, e.cause.operation);   // "A2008" 1  (step 1 failed)
  }
}
await avClient.Category.find.first({ where: { name: "should-not-exist" } });   // null
```

See [Transactions](/docs/transactions).

### Count a view

```ts
await api.Post.update.unique({
  where: { id: 7 },
  data: { views: { $increment: 1 } },
  select: ["id", "views"],
});
// { id: 7, views: 1 }
```

### What the configuration enforces

```ts
// no Authorization header
try {
  await avClient.Post.create.one({ data: { title: "anon", authorId: 1 } });
} catch (e) {
  // e instanceof AuthError, e.code === "A4000", e.cause.message === "Sign in first."
}

// removed operation: it does not exist on the client, in the type or at runtime
typeof avClient.User.delete.first;  // "undefined"

// list limit
await avClient.Post.find.many({ limit: 100 });
// ValidationError A2009: "limit exceeds maxListLimit (50)."

// write-only field
await avClient.User.find.many({ where: { passwordHash: "x" } });
// ValidationError: 'Filtering is not available on field "passwordHash".'

// hidden field
await avClient.User.find.many({ select: ["internalNotes"] });
// ValidationError: 'Field "internalNotes" is not available on Resource "User".'
```

(The last three are rejected by the TypeScript types before they run; the comments show what the server answers if a caller ignores them.)

## Next

- [Example: admin vs public](/docs/example-admin-vs-public): the same API used by trusted server code.
- [Example: recipes](/docs/example-recipes)
- [Client errors](/docs/client-errors)

## See also

- [Configuration](/docs/configuration)
- [Typed calls](/docs/typed-calls)
- [Client setup](/docs/client-setup)
- [Transactions](/docs/transactions)
- Guides: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Authentication and guards](/docs/authentication-and-guards), [Relations and nested writes](/docs/relations-and-nested-writes), [Transactions with $ref](/docs/transactions-with-ref)
