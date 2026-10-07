---
title: Why Aventara
description: What you write with plain NestJS, GraphQL, tRPC and Aventara for the same API, and where Aventara does more, less or something different.
order: 2
section: get-started
---

# Why Aventara

Most TypeScript backends repeat one fact in several places: the shape of the data. It lives in the database schema, again in DTOs or resolvers, again in the frontend's types, and again in the rules for who may see what. Aventara keeps **one source of truth**, your Prisma schema plus one configuration object, and derives the HTTP API and a typed frontend client from it.

This page shows the same small feature four ways: *list the latest posts with their author's name, hide the author's password hash, let the frontend never delete users*. The snippets for the other approaches are abbreviated sketches of typical code, not benchmarks of any one library.

## The same feature, four ways

### Plain NestJS: controllers, DTOs and a client

```ts
// post.dto.ts
export class ListPostsQuery {
  @IsOptional() @IsInt() @Max(100) limit?: number;
  @IsOptional() @IsString() titleContains?: string;
}
export class PostWithAuthorDto {
  id: number; title: string;
  author: { id: number; name: string | null };   // you decide, by hand, what is exposed
}

// posts.controller.ts
@Controller("posts")
export class PostsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() q: ListPostsQuery): Promise<PostWithAuthorDto[]> {
    return this.prisma.post.findMany({
      where: { title: { contains: q.titleContains } },
      take: q.limit ?? 20,
      select: { id: true, title: true, author: { select: { id: true, name: true } } },
    });
  }
}
// ...then create/update/delete handlers, a DTO per shape, an OpenAPI spec,
// a generated or hand-written client, and a way to keep all of it in sync.
```

Every new field, filter or relation a screen needs means a new DTO or a new query parameter on the server and a client update. It is flexible and entirely yours; it is also the most code.

### GraphQL: schema, resolvers, codegen

```graphql
type User { id: Int!  name: String  posts: [Post!]! }       # passwordHash simply is not declared
type Post { id: Int!  title: String!  author: User! }
type Query { posts(first: Int, titleContains: String): [Post!]! }
```

```ts
@Resolver(() => Post)
export class PostsResolver {
  @Query(() => [Post])
  posts(@Args("first", { nullable: true }) first?: number, @Args("titleContains", { nullable: true }) t?: string) {
    return this.prisma.post.findMany({ take: first ?? 20, where: { title: { contains: t } } });
  }
  @ResolveField(() => User)
  author(@Parent() post: Post) { return this.loaders.userById.load(post.authorId); }  // plus a DataLoader
}
// ...plus a codegen step for the client's types.
```

Clients choose their fields, which is GraphQL's strength. The cost is a second schema to maintain beside the database's, resolvers for every relation, and N+1 handling you own.

### tRPC: procedures and shared types

```ts
// server
export const appRouter = router({
  posts: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().max(100).optional(), titleContains: z.string().optional() }))
      .query(({ input }) =>
        prisma.post.findMany({
          take: input.limit ?? 20,
          where: { title: { contains: input.titleContains } },
          select: { id: true, title: true, author: { select: { name: true } } },
        }),
      ),
  }),
});
export type AppRouter = typeof appRouter;

// client
const trpc = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/trpc" })] });
const posts = await trpc.posts.list.query({ limit: 10 });
```

End-to-end types with very little ceremony. The client imports the server's `AppRouter` *type*, which couples the two code bases at build time (a monorepo or a shared package), and each query shape is still a procedure you write.

### Aventara: schema and configuration

```prisma
model User { id Int @id @default(autoincrement())  email String @unique  name String?
             passwordHash String  posts Post[] }
model Post { id Int @id @default(autoincrement())  title String  views Int @default(0)
             author User @relation(fields: [authorId], references: [id])  authorId Int }
```

```ts
// src/aventara.config.ts
client: {
  restrictions: {
    User: {
      fields: { passwordHash: { capabilities: { select: false, filter: false, order: false } } },
      operations: { delete: { unique: false, first: false, count: false } },
    },
  },
},
```

```ts
// frontend: generated client, no controllers, DTOs or resolvers written
const posts = await avClient.Post.find.many({
  where: { title: { contains: "typed" } },
  select: ["id", "title", { author: { select: ["id", "name"] } }],
  orderBy: { id: "desc" },
  limit: 10,
});
// readonly { id: number; title: string; author: { id: number; name: string | null } }[]
```

Every Resource gets `find`, `create`, `update`, `delete` and `upsert` operations, a filter and ordering language, relations, nested writes and transactions. A new screen that needs a new field or filter needs no server change: the frontend selects it, within what the contract allows.

## What you get, and where it is true

### One source of truth

The Prisma schema decides which Resources, fields and relations exist, and their types. Aventara compiles that, plus your configuration, into [contracts](/docs/contract-layers): plain data that the server enforces and the client generator reads. There is no second schema to keep in step.

### Three contract layers: the frontend sees only what you allow

The same schema compiles into a **core**, an **application** and a **client** contract. Only the client contract is served over HTTP. Your trusted server code can see and write more than a remote caller can, and the difference is declared in configuration rather than scattered through handlers. See [Contract layers](/docs/contract-layers).

### Hidden and write-only fields, per layer

A hidden field does not exist for that layer: it has no input, filter, ordering or projection. A write-only field (a password hash, say) can be set but never read, filtered or ordered. Asking for one fails before any query runs:

```text
A2004  V1008  Field "passwordHash" is not selectable.
```

### Exact result types

The generated client types the result from your `select`, not from the model. Select two fields and the result has two fields; add a relation with `$count` and you get `{ data, count }`. Results are `readonly`. See [Results and typing](/docs/results-and-typing).

### Stale-client detection

The client contract has a hash, and every request carries the hash the client was generated from. When the server's contract has moved on, the request is refused instead of being half-understood:

```text
409  A2005  Generated client contract does not match the server. Regenerate the client.
```

The generated client throws a typed `ContractMismatchError`. See [Contract hash](/docs/contract-hash).

### A generated client with zero runtime dependency on Aventara

`avclient generate` writes plain TypeScript into your frontend. The output imports nothing from `@aventara/client` or `@aventara/core`, so `@aventara/client` is a development dependency. It is deterministic: two runs over the same contract produce identical bytes. See [Frontend client](/docs/frontend-client).

### Transactions with references between steps

A transaction is one request and one database transaction. A later step can use a value an earlier step produced:

```ts
const user = avClient.tx.User.create.one({ data: { email: "new@example.com", passwordHash: "..." }, select: ["id"] });
const post = avClient.tx.Post.create.one({ data: { title: "First", authorId: user.$ref("id") } });
const [createdUser, createdPost] = await avClient.transaction([user, post]);
```

If any step fails, nothing is committed. See [Transactions](/docs/transactions).

### Safety defaults

Limits are on from the first request: at most 250 rows per list, nesting depth 12, 50 boolean nodes in a filter, 20 steps per transaction, 1 MiB per request. Arguments are validated against the contract **before** the ORM sees them, and database errors are sanitized into codes, never raw SQL or stack traces. Authentication and authorization are pipelines (guards and hooks) that run for every operation. See [Configuration](/docs/configuration).

### Host-agnostic protocol

The protocol is plain HTTP and JSON, published as data and pure functions in `@aventara/core/protocol`. `@aventara/nest` mounts it in NestJS 12 on Express or Fastify; you can also write your own host. See [HTTP protocol](/docs/http-protocol).

## Tradeoffs

- **Pilot.** The current release is `0.1.0-pilot.4`. The public API may change before 1.0; pin exact versions.
- **NestJS and Prisma 7 only, today.** The framework core is transport- and ORM-agnostic, but the adapter shipped is Prisma 7 (SQLite or PostgreSQL) and the host is NestJS 12.
- **A fixed query language.** The operations and their meaning are set by the protocol; configuration can switch operations off but not redefine them. Bespoke business logic (a payment, a report) is ordinary NestJS code that sits beside Aventara, or a pipeline on the operations.
- **One `POST` per operation.** Reads are `POST` requests with a JSON body, so HTTP caching of individual reads is not what the protocol optimizes for.
- **Generated client, not hand-rolled.** A schema or restriction change means regenerating the client, which is the point of the contract hash, but it is a step in your workflow.

## See also

- [Installation](/docs/installation) for requirements and packages.
- [Getting started](/docs/getting-started) for a running API in minutes.
- [Concepts](/docs/concepts) for the model behind the layers, operations and results.
- Guides: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Restricting operations](/docs/restricting-operations), [Authentication and guards](/docs/authentication-and-guards)
