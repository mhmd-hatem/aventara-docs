---
title: JSON fields
description: Give a Json field a type with AvZ - declare the shape in the configuration, get it checked on every write and typed in server code and in the generated client.
order: 33
section: guides
---

# JSON fields

A `Json` column holds any JSON, and a Prisma schema cannot say what is inside it. Aventara lets you say it in the configuration, with a shape: write the shape once and every write to the field is checked against it before the database is asked, the field is typed as that shape in your server code, and the generated client types it the same way, without any validation library on the frontend.

A field without a shape keeps working as before: any JSON, untouched ([Enums and scalar types](/docs/enums-and-scalars#json)).

## Declare a shape

The schema names the column as `Json`:

```prisma
model Post {
  id       Int     @id @default(autoincrement())
  title    String
  meta     Json?
  // ...
}
```

Build the shape with `AvZ`, from its own entry `@aventara/core/json`, and declare it under `fields` in `src/aventara.config.ts`:

```ts
import { AvZ } from "@aventara/core/json";

export const postMeta = AvZ.object({
  seo: AvZ.object({ title: AvZ.string(), keywords: AvZ.array(AvZ.string()) }),
  status: AvZ.enum(["draft", "published"]),
  rating: AvZ.optional(AvZ.int()),
  cover: AvZ.nullable(AvZ.string()),
});

export type PostMeta = AvZ.infer<typeof postMeta>;
// { seo: { title: string; keywords: string[] }; status: "draft" | "published"; rating?: number; cover: string | null }

export async function aventaraConfig(prisma: PrismaService) {
  return {
    entrypoint: "/api",
    adapter: /* ... */,
    fields: { Post: { meta: { json: postMeta } } },
  } as const;
}
```

`fields` is the same block that adds [computed fields](/docs/computed-fields); a `json` entry on an existing `Json` field is how you type it. It can sit at the root or in a layer block ([Configuration reference](/docs/config-reference#fields)).

`AvZ.infer<typeof shape>` gives the TypeScript type of the shape, for your own code. Export a shape or a configuration that holds one from a project that emits declarations and the types `AvZShape`, `AvZObject`, `AvZOptional` and `AvZNullable`, exported from `@aventara/core/json`, are there to name it.

## What a shape can say

| Builder | Accepts |
|---|---|
| `AvZ.string()` | a string |
| `AvZ.number()` | a number |
| `AvZ.int()` | an integer (a safe one: between -9007199254740991 and 9007199254740991) |
| `AvZ.boolean()` | `true` or `false` |
| `AvZ.null()` | `null` |
| `AvZ.literal(value)` | exactly that string, finite number, boolean or `null` |
| `AvZ.enum([...])` | one of a non-empty list of distinct strings |
| `AvZ.object({ ... })` | an object with exactly these keys (closed): a key the shape does not declare is refused |
| `AvZ.array(item)` | a list of `item` |
| `AvZ.tuple([a, b, ...])` | a list of exactly those entries, in order (at least one) |
| `AvZ.record(key, value)` | an object with any keys; `key` is `AvZ.string()`, an `AvZ.enum([...])` or a string `AvZ.literal(...)`; every value fits `value` |
| `AvZ.union([a, b, ...])` | any one of at least two shapes |
| `AvZ.discriminatedUnion(key, [objectA, objectB, ...])` | one of several objects, told apart by a `key` that is an `AvZ.literal` or an `AvZ.enum` in each (each tag used once) |
| `AvZ.optional(shape)` | an object key that may be left out; allowed only as a key of `AvZ.object` |
| `AvZ.nullable(shape)` | the shape or `null` (the key is still required: `null`, not absent) |

That is all of it, by design:

- Types only. There are no lengths, ranges, patterns, refinements, transforms or defaults. Check the *content* of a value in a [pipeline](#rules-the-shape-does-not-have).
- Built with `AvZ` only. A Zod schema, or any other value, is refused ([startup refusals](#what-fails-at-startup)). `AvZ` is a small builder of its own; `zod` is a dependency of `@aventara/core`, and only `@aventara/core/json` loads it. An application that declares no shape never loads it.
- Closed objects. An unknown key is an error, not ignored.

A builder given something it cannot use throws as you write the shape, with a sentence that says what to do:

```text
AvZ.enum: the values must be a non-empty list of distinct strings.
AvZ.union: the options must be a list of at least two shapes.
AvZ.discriminatedUnion: option 0 must be an AvZ.object whose "t" is an AvZ.literal or an AvZ.enum.
AvZ.discriminatedUnion: options 0 and 1 both match "t" "a".
AvZ.record: the key must be AvZ.string(), AvZ.enum([...]) or a string AvZ.literal(...).
AvZ.array: AvZ.optional marks an object key that may be left out; use it only for a field of AvZ.object.
AvZ.object: every part of a shape must be built with AvZ (a Zod schema or any other value is not accepted).
```

## Writes are checked

Every write that carries the field is checked against the shape before the database is asked: `create`, `update`, `upsert`, a nested write (`posts: { $create: { meta: ... } }`) and a transaction step, a value taken from an earlier step with `$ref` included. A value out of shape answers `A2004` (HTTP 422) with one issue per problem, each at its exact path:

(TypeScript flags these values before the server sees them; the call below is what a caller that got past the types, or a plain HTTP client, sends.)

```ts
await framework.application.Post.create.one({
  data: {
    title: "T",
    authorId: 1,
    meta: { seo: { title: 5, keywords: ["a", 2], extra: 1 }, status: "archived", rating: 1.5 },
  },
});
```

```json
{
  "data": null,
  "code": "A2004",
  "cause": {
    "message": "Operation arguments failed framework validation.",
    "issues": [
      { "code": "V1001", "path": ["arguments", "data", "meta", "seo", "title"], "message": "Value must be a string." },
      { "code": "V1001", "path": ["arguments", "data", "meta", "seo", "keywords", 1], "message": "Value must be a string." },
      { "code": "V1005", "path": ["arguments", "data", "meta", "seo", "extra"], "message": "Key is not part of the shape." },
      { "code": "V1002", "path": ["arguments", "data", "meta", "status"], "message": "Value must be one of \"draft\", \"published\"." },
      { "code": "V1001", "path": ["arguments", "data", "meta", "rating"], "message": "Value must be an integer." },
      { "code": "V1000", "path": ["arguments", "data", "meta", "cover"], "message": "Required value missing." }
    ]
  }
}
```

| Code | Means | Message |
|---|---|---|
| `V1000` | a required key is missing | `Required value missing.` |
| `V1001` | a value of the wrong type | `Value must be a string.`, `... an integer.`, `... a number.`, `... a boolean.`, `... an object.`, `... a list of exactly 2 entries.`, `... a string or an integer.` |
| `V1002` | a value outside an enum or a literal | `Value must be one of "draft", "published".`, `Value must be "v1".` |
| `V1004` | an integer outside the safe range | `Value must be a safe integer (between -9007199254740991 and 9007199254740991).` |
| `V1005` | a key the shape does not declare, once per key | `Key is not part of the shape.` |

The same refusal from inside a nested write has the nested path (`["arguments", "data", "posts", "$create", "meta", "seo"]`). In a transaction step the path is the address in the request body, `["operations", i, "args", ...]`, and the error's `cause.operation` is the step's zero-based index `i`.

A value taken from an earlier step is checked like any other, when the step runs. A whole field can be taken from a step with `$ref`: a copy of a row's `meta` into a new row passes when the source fits the shape, and a legacy value that does not fit is refused at the step that writes it:

```json
{ "code": "A2004", "cause": { "operation": 1, "issues": [
  { "code": "V1000", "path": ["operations", 1, "args", "data", "meta", "seo"], "message": "Required value missing." },
  { "code": "V1005", "path": ["operations", 1, "args", "data", "meta", "whatever"], "message": "Key is not part of the shape." } ] } }
```

`$ref` stands for a whole field value. It is not looked for *inside* a JSON value: an object with a `$ref` key inside `meta` is checked as the plain data it is ([Transactions with $ref](/docs/transactions-with-ref)).

The field may be `null` only if your schema says so (`Json?` above); a shape cannot admit `null` or absence at its top level.

## Reads and filters are not checked

A shape checks what you write. A read returns what is stored, and a filter is applied as it always was, so rows written before the shape existed, or by something other than Aventara, stay readable:

```ts
// a row written straight to the database, before the shape existed
await framework.application.Post.find.first({ where: { title: "legacy" }, select: ["meta"] });
// { data: { meta: { whatever: true } }, code: "A1000", ... }
```

Filter operators for `Json` still depend on the database ([Enums and scalar types](/docs/enums-and-scalars#json)); a shape does not change them.

## In your code and in the client

With a shape declared, `framework.application`, `framework.client`, `framework.appTx`, `framework.clientTx` and the generated client read and write the field as the shape's type instead of generic JSON:

```ts
// server side
const created = await framework.application.Post.create.one({
  data: { title: "T", authorId: 1, meta: { seo: { title: "Hi", keywords: [] }, status: "draft", cover: null } },
  select: ["id", "meta"],
});
created.data?.meta?.status;   // "draft" | "published" | undefined

// in the frontend
const post = await avClient.Post.create.one({
  data: { title: "T", authorId: 1, meta: { seo: { title: "Hi", keywords: ["a"] }, status: "draft", cover: null } },
  select: ["id", "meta"],
});
const status: "draft" | "published" | undefined = post.meta?.status;

await avClient.Post.create.one({
  data: { title: "T", authorId: 1, meta: { seo: { title: "Hi", keywords: [] }, status: "archived", cover: null } },
});
// type error: "archived" is not "draft" | "published"
```

(`?.` is there because the `Json?` column can hold `null`.) The generated client carries the type only: it needs no Zod and imports nothing from Aventara at runtime. The server still checks the write, so a value that slips past TypeScript is answered with the `A2004` above and thrown as a `ValidationError` ([Client errors](/docs/client-errors)).

### The shape is part of the contract

The shape travels in the ClientContract as JSON Schema, which is where the generated client reads its type from. Declaring a shape, or changing one, therefore changes the contract hash: regenerate the client ([Keeping in sync](/docs/keeping-in-sync)). A client generated before the shape was declared is refused with the usual contract-mismatch error until you do ([Contract hash](/docs/contract-hash)).

## A union of shapes

`AvZ.discriminatedUnion` models a field that holds one of several kinds of value, told apart by a tag key. A content-blocks column, for example:

```ts
const block = AvZ.discriminatedUnion("type", [
  AvZ.object({ type: AvZ.literal("text"), body: AvZ.string() }),
  AvZ.object({
    type: AvZ.literal("image"),
    url: AvZ.string(),
    width: AvZ.int(),
    alt: AvZ.optional(AvZ.string()),
  }),
]);

export type Block = AvZ.infer<typeof block>;
// { type: "text"; body: string } | { type: "image"; url: string; width: number; alt?: string }

// fields: { Post: { meta: { json: block } } }
```

A value is checked against the option its tag names, so the issues point at what is wrong with *that* kind:

```text
{ type: "image", url: "https://example.com/a.png", width: 640 }   -> written
{ type: "video", url: "x" }              -> V1002 at ["arguments","data","meta","type"]: Value must be one of "text", "image".
{ type: "image", url: "x" }              -> V1000 at ["arguments","data","meta","width"]: Required value missing.
{ body: "x" }                            -> V1000 at ["arguments","data","meta","type"]: Required value missing.
```

In the contract, the field's `json` member is this JSON Schema (the first option shown in full; the second has `alt`, `url` and `width` in the same form):

```json
{
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "properties": { "type": { "const": "text" }, "body": { "type": "string" } },
      "required": ["body", "type"]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": { "const": "image" },
        "url": { "type": "string" },
        "width": { "type": "integer" },
        "alt": { "type": "string" }
      },
      "required": ["type", "url", "width"]
    }
  ]
}
```

Closed objects are `additionalProperties: false`; an optional key is missing from `required`; `AvZ.nullable(AvZ.string())` is `anyOf` a string and `null`; `AvZ.enum` is `enum` with `type: "string"`; `AvZ.int()` is `integer`.

## Rules the shape does not have

A shape says what a value is. A rule about what it may contain, such as "the title is at most 60 characters", belongs in a [pipe](/docs/pipelines): it runs before the write and refuses with a code you choose. The arguments have already passed validation by then, so `meta` has the shape's form (a write that does not never reaches your pipes), though a pipe's `args` is typed `unknown`, hence the casts.

```ts
import { FrameworkError, type Pipe } from "@aventara/core";

const metaRules: Pipe = (args, ctx) => {
  if (ctx.resource === "Post" && (ctx.family === "create" || ctx.family === "update")) {
    const title = (args as { data?: { meta?: { seo?: { title?: unknown } } } }).data?.meta?.seo?.title;
    if (typeof title === "string" && title.length > 60) {
      throw new FrameworkError("A2004", "The post title must be at most 60 characters.");
    }
  }
  return args;
};
```

A caller gets `422 A2004` with that message and the write does not happen (verified with a limit of 5: `{"data":null,"code":"A2004","cause":{"message":"The post title must be at most 5 characters."}}`). Put the pipe in `client.pipelines` or `application.pipelines` ([Pipelines](/docs/pipelines#typing-a-stage)); a message you choose is sent to the caller as written, so keep secrets out of it.

## Where a shape applies

- Only a `Json` field the adapter discovered. A shape on a string, an int, a relation or a field that does not exist is a startup error.
- A field, not a position. The shape applies wherever the field is written: the top level of a `create`, a nested `$create` through a relation, an `upsert`'s `create` and `update`, a transaction step.
- Per layer, if you like. A shape declared in `client.fields` applies to remote callers only: a write from `framework.application` to the same field is then untyped and unchecked, any JSON as before. Declare it at the root, or in both blocks, to cover both ([Contract layers](/docs/contract-layers)).

## What fails at startup

A shape that cannot work stops the server before it listens, as a `FrameworkConstructionError` with `stage: "contract-compilation"` and diagnostics with the code `COMPILER_INVALID_JSON_SHAPE` ([Startup safety checks](/docs/config-reference#startup-safety-checks)). Real messages:

```text
field "Post.title" is a string field; only a Json field the adapter discovered may declare a "json" shape
field "Post.views" is an int field; only a Json field the adapter discovered may declare a "json" shape
field "Post.meta": "json" must be a shape built with AvZ from "@aventara/core/json"; a Zod schema or any other value is not accepted
field "Post.meta": a field's shape cannot admit null or absence at its top level; whether the field may be null comes from the adapter model
```

Every layer is compiled, so one mistake is reported once per layer.

## See also

- [Enums and scalar types](/docs/enums-and-scalars#json): how `Json` travels.
- [Configuration reference](/docs/config-reference#fields): the `fields` option.
- [Pipelines](/docs/pipelines): checking the content of a value.
- [Typed calls](/docs/typed-calls) and [Keeping in sync](/docs/keeping-in-sync).
