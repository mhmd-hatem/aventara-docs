---
title: JSON fields
description: Give a Json field a type with AvZ - declare the shape in the configuration, add checks to its parts, get it checked on every write and typed in server code and in the generated client.
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

Build the shape with `AvZ`, from its own entry `@aventara/core/avz`, and declare it as the field's `definition.json` in `src/aventara.config.ts`:

```ts
import { AvZ } from "@aventara/core/avz";

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
    api: "/api",
    adapter: /* ... */,
    resources: { Post: { fields: { meta: { definition: { json: postMeta } } } } },
  } as const;
}
```

`definition` is the same key that adds [computed fields](/docs/computed-fields); a `json` entry on a `Json` field the adapter discovered is how you type it. Like every `definition` it sits at the root only, so the shape applies to your server code and to remote callers alike ([Configuration reference](/docs/config-reference#fields)).

`AvZ.infer<typeof shape>` gives the TypeScript type of the shape, for your own code. Export a shape or a configuration that holds one from a project that emits declarations and the types `AvZShape`, `AvZObject`, `AvZOptional` and `AvZNullable`, exported from `@aventara/core/avz`, are there to name it. A function that returns a call's result without a return type is fine too: a result that holds a shaped field is named with `AvZShapedSchema`, from the same entry.

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

A string, number, integer or array node also takes checks, written the way zod/mini writes them, with the same `AvZ` checks as [field validators](/docs/field-validators):

```ts
const contact = AvZ.object({
  code: AvZ.string().check(AvZ.length(4)),
  email: AvZ.string().check(AvZ.maxLength(80), AvZ.email()),
  rating: AvZ.int().check(AvZ.gte(0), AvZ.lte(5)),
  tags: AvZ.array(AvZ.string()).check(AvZ.maxItems(3)),
});
```

A string node takes length, pattern and format checks, a number or integer node bounds and `multipleOf`, an array node `minItems` and `maxItems`. That is all of it, by design:

- No refinements, transforms or defaults. A rule across several keys belongs in a [pipeline](#rules-the-shape-does-not-have).
- Built with `AvZ` only. A Zod schema, or any other value, is refused ([startup refusals](#what-fails-at-startup)). `AvZ` is a small builder of its own; `zod` is a dependency of `@aventara/core`, and only `@aventara/core/avz` loads it. An application that declares no shape and no validator never loads it.
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

Every write that carries the field is checked against the shape before the database is asked: `create`, `update`, `upsert`, a nested write (`posts: { $create: { meta: ... } }`) and a transaction step, a value taken from an earlier step with `$ref` included. The shape is one of the field's [validators](/docs/field-validators#where-they-run), so it is checked where validators run: after every pipe, the operation's and the field's, and after write compute, and before any interceptor or hook. Its issues are listed with the other fields' validator issues, in the order the call wrote the fields. Before the pipes, the framework only checks that the value is plain JSON. A value out of shape answers `A2004` (HTTP 422) with one issue per problem, each at its exact path:

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
      { "code": "V1000", "path": ["arguments", "data", "meta", "cover"], "message": "Required value missing." },
      { "code": "V1001", "path": ["arguments", "data", "meta", "rating"], "message": "Value must be an integer." },
      { "code": "V1001", "path": ["arguments", "data", "meta", "seo", "keywords", 1], "message": "Value must be a string." },
      { "code": "V1001", "path": ["arguments", "data", "meta", "seo", "title"], "message": "Value must be a string." },
      { "code": "V1005", "path": ["arguments", "data", "meta", "seo", "extra"], "message": "Key is not part of the shape." },
      { "code": "V1002", "path": ["arguments", "data", "meta", "status"], "message": "Value must be one of \"draft\", \"published\"." }
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
| `V1003`, `V1004` | a failed check on a node (with `check` and `params`, as for a [field validator](/docs/field-validators)) | `Value must be at most 80 characters long.`, `List must have at most 3 entries.` |

The same refusal from inside a nested write has the nested path (`["arguments", "data", "posts", "$create", "meta", "seo"]`). In a transaction step the path is the address in the request body, `["operations", i, "args", ...]`, and the error's `cause.operation` is the step's zero-based index `i`.

A value taken from an earlier step is checked like any other, when the step runs. A whole field can be taken from a step with `$ref`: a copy of a row's `meta` into a new row passes when the source fits the shape, and a legacy value that does not fit is refused at the step that writes it:

```json
{ "code": "A2004", "cause": { "operation": 1, "issues": [
  { "code": "V1000", "path": ["operations", 1, "args", "data", "meta", "cover"], "message": "Required value missing." },
  { "code": "V1000", "path": ["operations", 1, "args", "data", "meta", "seo"], "message": "Required value missing." },
  { "code": "V1000", "path": ["operations", 1, "args", "data", "meta", "status"], "message": "Required value missing." },
  { "code": "V1005", "path": ["operations", 1, "args", "data", "meta", "whatever"], "message": "Key is not part of the shape." } ] } }
```

`$ref` stands for a whole field value. It is not looked for *inside* a JSON value: an object with a `$ref` key inside `meta` is checked as the plain data it is ([Transactions with $ref](/docs/transactions-with-ref)).

The field may be `null` only if your schema says so (`Json?` above). On a `Json?` field, writing `null` stores the database `NULL`, as on any nullable field. In a filter, `field: null` and `equals: null` match every row that reads back `null`, and `not: null` matches the rest. A `null` inside a value, or compared at a `path`, is a JSON `null`. A shape cannot admit `null` or absence at its top level. How deeply a value may nest is bounded by the `maxJsonDepth` limit (64 levels by default; deeper is `A2009` / `V1021`, [Limits and safety](/docs/limits-and-safety)).

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
created.meta?.status;   // "draft" | "published" | undefined

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

(`?.` is there because the `Json?` column can hold `null`.) The generated client carries the type, and runs the shape's checks before it sends; it needs no Zod and imports nothing from Aventara at runtime. A value that does not match the shape's form is sent, and the server answers it. The server checks every write, so a value that slips past TypeScript is answered with the `A2004` above and thrown as an `AvValidationError` ([Client errors](/docs/client-errors)).

### The shape is part of the contract

The shape travels in the ClientContract as JSON Schema (its checks as `checks` on the node), which is where the generated client reads its type from. Declaring a shape, or changing one, therefore changes the contract hash: regenerate the client ([Keeping in sync](/docs/keeping-in-sync)). A client generated before the shape was declared is refused with the usual contract-mismatch error until you do ([Contract hash](/docs/contract-hash)).

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

// resources: { Post: { fields: { meta: { definition: { json: block } } } } }
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

A shape says what a value is, and its checks bound each part. A rule across several keys, such as "a published post needs at least one keyword", belongs in a [pipe](/docs/pipelines): it runs before the write and refuses with a code you choose. The arguments have already passed validation by then, so `meta` has the shape's form (a write that does not never reaches your pipes), though a pipe's `args` is typed `unknown`, hence the casts.

```ts
import { AvError, type AvPipe } from "@aventara/core";

const metaRules: AvPipe = (args) => {
  const meta = (args as { data?: { meta?: { status?: string; seo?: { keywords?: string[] } } } }).data?.meta;
  if (meta?.status === "published" && (meta.seo?.keywords ?? []).length === 0) {
    throw new AvError("A2004", "A published post needs at least one keyword.");
  }
  return args;
};

// resources: {
//   Post: { operations: { create: { pipelines: { pipes: [metaRules] } }, update: { pipelines: { pipes: [metaRules] } } } },
// },
```

A caller gets `422 A2004` with that message and the write does not happen. A message you choose is sent to the caller as written, so keep secrets out of it ([Pipelines](/docs/pipelines#typing-a-stage)).

## Where a shape applies

- Only a `Json` field the adapter discovered. A shape on a string, an int, a relation or a field that does not exist is a startup error.
- A field, not a position. The shape applies wherever the field is written: the top level of a `create`, a nested `$create` through a relation, an `upsert`'s `create` and `update`, a transaction step.
- At the root, for both origins. A field's `definition` is root-only, so the shape covers your server code and remote callers alike. A `definition` in `application` or `client` is refused (`CONFIG_FORBIDDEN_IN_OVERLAY`).
- No `validators` key. A Json field's checks live in its shape; `pipelines.validators` on a Json field is refused (`COMPILER_INVALID_VALIDATOR`).

## What fails at startup

A shape that cannot work stops the server before it listens, as an `AvConstructionError` with `stage: "contract-compilation"` and diagnostics with the code `COMPILER_INVALID_JSON_SHAPE` ([Startup safety checks](/docs/config-reference#startup-safety-checks)). Real messages:

```text
field "Post.title" is a string field; only a Json field the adapter discovered may declare a "json" shape
field "Post.views" is an int field; only a Json field the adapter discovered may declare a "json" shape
field "Post.meta": "json" must be a shape built with AvZ from "@aventara/core/avz"; a Zod schema or any other value is not accepted
field "Post.meta": a field's shape cannot admit null or absence at its top level; whether the field may be null comes from the adapter model
```

## See also

- [Enums and scalar types](/docs/enums-and-scalars#json): how `Json` travels.
- [Configuration reference](/docs/config-reference#fields): field definitions.
- [Field validators](/docs/field-validators): the same checks on scalar fields.
- [Pipelines](/docs/pipelines): checking the content of a value.
- [Typed calls](/docs/typed-calls) and [Keeping in sync](/docs/keeping-in-sync).
