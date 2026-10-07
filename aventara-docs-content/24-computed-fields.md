---
title: Computed fields
description: Add virtual fields, compute values on read, create and update, and accept write-only input such as a password that is hashed before it is stored.
order: 24
section: guides
---

# Computed fields

Two configuration blocks work together:

- **`fields`** adds a scalar field that your database does not have (a *virtual* field), or describes how a field behaves.
- **`behaviors`** attaches your code to a field: a function that computes its value when a record is read, created or updated.

The result is part of the contract like any other field (callers see and type `displayName` as a string), while the code stays on the server.

Three recipes, all from one configuration. They use a `User` with `name`, `email` and `passwordHash`, and a `Post` with a nullable `slug String?` column.

## The configuration

```ts
// src/aventara.config.ts
import { createHash } from "node:crypto";
import { createFramework, defineFields } from "@aventara/core";

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const digest = (text: string) => createHash("sha256").update(text).digest("hex");   // use bcrypt or argon2 in real code

type Row = Readonly<Record<string, unknown>>;

export async function aventaraConfig(prisma: PrismaService) {
  const adapter = await createPrismaAdapter({ /* ... */ });

  // 1. Add the fields the database does not have.
  const fields = defineFields(adapter.model, {
    User: {
      displayName: {                       // read-only, computed on every read
        type: { scalar: "string" },
        nullable: false,
        list: false,
        lifecycle: ["VIRTUAL"],
        capabilities: { select: true },
      },
      password: {                          // write-only: accepted, never stored, never returned
        type: { scalar: "string" },
        nullable: true,
        list: false,
        lifecycle: ["VIRTUAL"],
        capabilities: { select: false, create: [], update: [] },
      },
    },
  });

  // 2. Say how each computed field gets its value.
  return {
    entrypoint: "/api",
    adapter,
    fields,
    behaviors: {
      User: {
        fields: {
          displayName: {
            read: {
              dependsOn: ["name", "email"],
              compute: ({ record }: { record: Row }) =>
                (record.name as string | null) ?? String(record.email).split("@")[0],
            },
          },
          passwordHash: {
            create: ({ data }: { data: Row }) => (typeof data.password === "string" ? digest(data.password) : undefined),
            update: ({ data }: { data: Row }) => (typeof data.password === "string" ? digest(data.password) : undefined),
          },
        },
      },
      Post: {
        fields: {
          slug: {
            create: ({ data }: { data: Row }) => slugify(String(data.title)),
            update: ({ data, value }: { data: Row; value: unknown }) =>
              data.title === undefined ? value : slugify(String(data.title)),
          },
        },
      },
    },
    restrictions: {
      User: {
        fields: {
          passwordHash: { capabilities: { select: false, filter: false, order: false, create: false, update: false } },
        },
      },
    },
  } as const;
}
```

`defineFields(adapter.model, { ... })` checks the `fields` block against what Prisma discovered and returns it unchanged. Binding the model by value is what lets TypeScript offer your field names (including the added ones) to `behaviors`, `restrictions` and `dependsOn`: a typo there is a compile error.

An **added** field must spell out `type`, `nullable` and `list`. `lifecycle: ["VIRTUAL"]` says it has no database column. The `type` is `{ scalar: "string" }` or another scalar, or `{ enum: "Role" }`.

## Recipe 1: a field computed on read

`displayName` is derived from `name` and `email`:

```bash
curl -X POST http://localhost:3000/api/_resources/User/create/one ... -d '{"data":{"email":"ada@example.com"}}'
```

```json
{"data":{"avatar":null,"createdAt":"2026-10-06T22:56:40.874Z","displayName":"ada","email":"ada@example.com","id":1,"role":"USER","settings":null},"code":"A1002","cause":null}
```

```json
// User/find/many {"select":["id","displayName"]}
{"data":[{"id":1,"displayName":"ada"}],"code":"A1000","cause":null}
```

In the contract it appears as a selectable, read-only field:

```json
"displayName": { "capabilities": { "select": true }, "kind": "scalar", "lifecycle": ["COMPUTED_ON_READ", "VIRTUAL"], "list": false, "nullable": false, "type": { "scalar": "string" } }
```

A virtual field is not in the database, so it cannot be filtered or ordered on, and cannot be written:

```json
// User/find/many {"where":{"displayName":"x"}}
{"code":"A2004","cause":{"issues":[{"code":"V1006","path":["arguments","where","displayName"],"message":"Filtering is not available on field \"displayName\"."}]}}
// User/create/one {"data":{"email":"z@example.com","displayName":"Zed"}}
{"code":"A2004","cause":{"issues":[{"code":"V1006","path":["arguments","data","displayName"],"message":"Field \"displayName\" is not writable during create."}]}}
```

### `dependsOn`

A read behavior may name the persisted fields it needs. When a caller selects `displayName` but not `name` or `email`, the framework reads them for you, computes the value, and removes them again, so they do not leak into the response. This holds even when the caller cannot see those fields at all: with `name` hidden for remote callers (`client.restrictions.User.fields.name.hidden`), `{"select":["id","displayName"]}` still answers `{"id":1,"displayName":"ada"}`, while the application layer sees `name: null` beside `displayName: "ada"`.

`dependsOn` takes scalar fields of the same Resource. Write the behavior as a plain function when it needs nothing else: `read: ({ record }) => ...`.

## Recipe 2: a stored value computed on write

`Post.slug` is a real column, filled by your code when a post is created and refreshed when its title changes:

```json
// Post/create/one {"data":{"title":"Hello, World! It works","authorId":1},"select":["id","title","slug"]}
{"data":{"id":1,"title":"Hello, World! It works","slug":"hello-world-it-works"},"code":"A1002","cause":null}
```

A computed value is authoritative: sending your own `slug` on create is overridden.

```json
// Post/create/one {"data":{"title":"A","slug":"mine","authorId":1}}
{"data":{"id":2,"title":"A","slug":"a"},"code":"A1002","cause":null}
```

A create or update callback returns the value for **its own field** only; returning `undefined` leaves the current value alone. It receives:

| Member | Meaning |
|---|---|
| `data` | The incoming data for this operation, after pipes. |
| `value` | The field's current value in this operation (what the caller sent, if anything). |
| `field`, `resource`, `scope` | Which field, Resource and layer (`"application"` or `"client"`). |
| `operation` | The pipeline context of the operation (including `requestId` and `transport`). |

Read callbacks get `record` (the row as read) instead of `data`. A callback may return a promise.

## Recipe 3: write-only input that fills another field

The `password` field above is accepted on create and update and is **not** stored or returned (`select: false`, and the framework strips virtual fields before the database call). Its value reaches the `passwordHash` behaviors through `data`:

```json
// User/create/one {"data":{"email":"ada@example.com","password":"s3cret"}}
{"data":{"avatar":null,"createdAt":"...","displayName":"ada","email":"ada@example.com","id":1,"role":"USER","settings":null},"code":"A1002","cause":null}
```

The row now holds `passwordHash = sha256("s3cret")`; updating with `{"password":"n3w"}` stores the hash of `n3w`. `passwordHash` itself is closed to callers: it is neither writable nor readable, so nobody can plant a hash directly:

```json
// User/create/one {"data":{"email":"pw2@example.com","passwordHash":"abc"}}
{"code":"A2004","cause":{"issues":[{"code":"V1006","path":["arguments","data","passwordHash"],"message":"Field \"passwordHash\" is not writable during create."}]}}
```

## Per layer

`behaviors` follow the same layering as the rest of the configuration ([Configuration](/docs/configuration#root-and-layer-overrides)): for each stage (`create`, `update`, `read`), a layer's explicit value wins, `false` switches the stage off for that layer, and an omitted stage uses the root's. The two callbacks are never both run.

```ts
client: {
  // Remote renames do not change the slug: the root update behavior is switched off here.
  behaviors: { Post: { fields: { slug: { update: false as const } } } },
},
```

```text
remote:       Post/update/unique {"where":{"id":1},"data":{"title":"Client rename"}}  -> slug stays "hello-world-it-works"
application:  Post.update.unique({ where: { id: 1 }, data: { title: "App rename" } }) -> slug: "app-rename"
```

Switching a stage off does not make the field read-only: a remote caller can still send `slug` by hand on update. To close that too, add `restrictions.Post.fields.slug.capabilities.update: false` for the client layer ([Exposing and hiding fields](/docs/exposing-and-hiding-fields)).

## What to know

- A **selectable** virtual field needs a `read` behavior: without one, startup fails with `COMPILER_MISSING_READ_BEHAVIOR`. A write-only virtual field must say `select: false`.
- A computed field is not a pipeline stage. A [pipe](/docs/pipelines) transforms the whole arguments; a behavior owns one field.
- Behaviors run on the server for both layers and never appear in the contract. Only the resulting lifecycle (`COMPUTED_ON_READ`, `COMPUTED_ON_CREATE`, `COMPUTED_ON_UPDATE`) is visible.

## See also

- [Exposing and hiding fields](/docs/exposing-and-hiding-fields)
- [Pipelines](/docs/pipelines)
- [Configuration](/docs/configuration)
- [Enums and scalar types](/docs/enums-and-scalars)
