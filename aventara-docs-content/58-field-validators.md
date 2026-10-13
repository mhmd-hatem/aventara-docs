---
title: Field validators
description: Declarative checks on a field's value with AvZ - lengths, ranges, patterns and formats - checked by the server and, before anything is sent, by the generated client.
order: 21
section: guides
---

# Field validators

A field validator is a declarative check on a field's value: at most 80 characters, at least 0, a UUID, a pattern. You write it with `AvZ` from `@aventara/core/avz`, in zod's check vocabulary. Because a check is data, not a function, it is compiled into the contract: the server checks every write against it, and the generated client runs the same check before it sends a request.

The examples use this model (PostgreSQL, for the `String[]` list):

```prisma
model Project {
  id      String   @id @default(uuid())
  name    String
  slug    String   @unique
  budget  Int      @default(0)
  ownerId String
  tags    String[]
}
```

```ts
// src/aventara.config.ts
import { AvZ } from "@aventara/core/avz";

return {
  api: "/api",
  adapter: /* ... */,
  resources: {
    Project: {
      fields: {
        name: { pipelines: { validators: [AvZ.minLength(3), AvZ.maxLength(80)] } },
        slug: { pipelines: { validators: [AvZ.regex(/^[a-z0-9-]+$/)] } },
        budget: { pipelines: { validators: [AvZ.gte(0), AvZ.multipleOf(100)] } },
        ownerId: { pipelines: { validators: [AvZ.uuid()] } },
        tags: { pipelines: { validators: [AvZ.maxItems(5), AvZ.maxLength(20)] } },  // at most 5 tags of at most 20 characters
      },
    },
  },
} as const;
```

A validator is a rule on input. It never states a type: the field's type comes from your schema.

## The checks

| Kind | `AvZ` builders | Field types |
|---|---|---|
| Bounds | `lt`, `lte`, `gt`, `gte`, `positive`, `nonnegative`, `negative`, `nonpositive` | `int`, `float`, `bigint`, `decimal`, `datetime` |
| Multiples | `multipleOf` | `int`, `float`, `bigint`, `decimal` |
| String length | `minLength`, `maxLength`, `length` | `string` |
| List length | `minItems`, `maxItems` | any list field |
| Byte size | `minSize`, `maxSize`, `size` | `bytes` |
| Text | `regex`, `includes`, `startsWith`, `endsWith`, `lowercase`, `uppercase` | `string` |
| Named formats | `email`, `url`, `emoji`, `uuid` (any version), `guid`, `nanoid`, `cuid`, `cuid2`, `ulid`, `xid`, `ksuid`, `ipv4`, `ipv6`, `cidrv4`, `cidrv6`, `base64`, `base64url`, `e164`, `creditCard`, `iban`, `jwt`, `jsonString`, and `AvZ.iso.datetime()`, `AvZ.iso.date()`, `AvZ.iso.time()`, `AvZ.iso.duration()` | `string` |

Each check behaves as zod 4's does: a string's length is counted in Unicode code points, and a `float`'s `multipleOf` allows zod's tolerance. A `decimal`'s bounds and multiples are exact. A bound is written in the field's own type: a number for `int` and `float`, a `bigint` for `bigint`, a `Date` for `datetime`, and a number or a `bigint` for `decimal`.

```ts
publishedAt: { pipelines: { validators: [AvZ.gte(new Date("2020-01-01T00:00:00.000Z"))] } },
views:       { pipelines: { validators: [AvZ.nonnegative()] } },
```

There are no refinements, no custom check functions and no transforms (`trim`, `toLowerCase`). Rules a check cannot state, such as a database lookup or a rule across two fields, belong in a [pipe or a guard](/docs/pipelines). To normalize a value (trim it, lower-case it), use a [field pipe](/docs/pipelines#field-pipes-and-field-write-guards).

### List fields

On a list field, `minItems` and `maxItems` check the list's length, and every other check applies to each entry, with the entry's index in the issue's path. `tags: [AvZ.maxItems(5), AvZ.maxLength(20)]` allows at most five tags, each at most twenty characters. A `$push` on a list field is held to the entry checks. (Scalar lists such as `String[]` need PostgreSQL with Prisma.)

### Json fields

A Json field takes no `validators` key. Its rules go into its shape, `definition.json`, where a string, number, integer or array node takes checks the way zod/mini writes them:

```ts
meta: {
  definition: {
    json: AvZ.object({
      code: AvZ.string().check(AvZ.length(4)),
      contact: AvZ.string().check(AvZ.maxLength(80), AvZ.email()),
      rating: AvZ.int().check(AvZ.gte(0), AvZ.lte(5)),
      tags: AvZ.array(AvZ.string()).check(AvZ.maxItems(3)),
    }),
  },
},
```

A string node takes length, pattern and format checks; a number or integer node bounds and `multipleOf`; an array node `minItems` and `maxItems`. See [JSON fields](/docs/json-fields).

The shape does two jobs. It types the field, and it is one of the field's validators: the whole shape, its structure and its checks, is checked where validators run ([below](#where-they-run)), after every pipe, and its issues are listed with the other fields' issues in the order the call wrote the fields.

## What a caller gets

A failed check answers `422` `A2004`, with one issue per broken rule. A range, length or size check is `V1004`; a pattern or format check is `V1003`. Each issue also carries zod's name for the check, `check`, and the check's parameters, `params`, so a program can tell which rule failed without reading the message:

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[
  {"code":"V1004","path":["arguments","data","name"],"message":"Value must be at most 80 characters long.","check":"max_length","params":{"maximum":80}}
]}}
```

| `check` (`params`) | Builders | V-code |
|---|---|---|
| `less_than` (`value`, `inclusive`) | `lt`, `lte`, `negative`, `nonpositive` | `V1004` |
| `greater_than` (`value`, `inclusive`) | `gt`, `gte`, `positive`, `nonnegative` | `V1004` |
| `multiple_of` (`value`) | `multipleOf` | `V1004` |
| `max_length` (`maximum`), `min_length` (`minimum`), `length_equals` (`length`) | `maxLength`, `minLength`, `length` | `V1004` |
| `max_length` / `min_length` with `list: true` | `maxItems`, `minItems` | `V1004` |
| `max_size` (`maximum`), `min_size` (`minimum`), `size_equals` (`size`) | `maxSize`, `minSize`, `size` | `V1004` |
| `string_format` (`format: "regex"`, `pattern: { source, flags }`) | `regex` | `V1003` |
| `string_format` (`format: "includes"`, `"starts_with"`, `"ends_with"`, `"lowercase"`, `"uppercase"`) | `includes`, `startsWith`, `endsWith`, `lowercase`, `uppercase` | `V1003` |
| `string_format` (`format: "email"`, `"uuid"`, `"url"`, ...) | the named formats | `V1003` |

The messages are plain sentences such as `Value must be at least 3 characters long.`, `List must have at most 5 entries.`, `Value must match the pattern /^[a-z0-9-]+$/.` or `Value must be a multiple of 100.`. Branch on `code`, `check` and `params`, not on the message.

`null` breaks no check (whether a field may be `null` comes from your schema), and a directive's operand such as `{ $increment: 5 }` is not the field's value, so it is not judged; `$push` entries are.

## Where they run

On the server, in this order:

1. The framework validates the arguments against the contract: types, unknown fields, structure, and that every create holds the fields its layer requires (a field a `compute.create` fills is not required yet). For a Json field this only checks that the value is plain JSON; its shape comes in step 4.
2. The [guards](/docs/pipelines) run, and see the value as the caller sent it. Validators are about values, so they run after the pipes and write compute; presence is not a validator.
3. The operation's pipes run, then each [field pipe](/docs/pipelines#field-pipes-and-field-write-guards) on the value.
4. [Write compute](/docs/computed-fields) runs: each `compute.create` or `compute.update` stage fills its field.
5. The re-check. First Aventara's own checks on what the pipes and compute produced: a wrong type, an unknown key, a required field a pipe dropped, or a reference written twice answers `A3004` (your bug), and a compute stage that returns the wrong type answers `A3000`. Then the validators check every value, a Json field's shape included.
6. Then the interceptors and hooks run, and the adapter writes exactly what the validators checked: no later stage can change it ([Read-only data](/docs/pipelines#read-only-data)).

So the validators judge every value that is written: the caller's input after the pipes, and every value a `compute.create` or `compute.update` stage returns, at the top level, in nested writes and in both branches of an upsert. A call judges once, after compute. A value that breaks a check is answered `A2004` with the issues, at the field, whether it came from the caller, a pipe or a compute stage. A computed value of the wrong type or format is your bug and stays `A3000`, with the details on an `AvComputedValueError` in your [`diagnostics`](/docs/config-reference#diagnostics) sink. A `compute.read` value is output, not a write, and the validators do not judge it.

A value a validator refuses runs no interceptor and no hook. Issues come in the order the call wrote the fields, a Json field's shape issues at that field's place. Inside one Json value they follow the shape's keys as the contract lists them.

In a [transaction](/docs/transactions), every step's guards and pipes run before the transaction opens, and so do the validators on its literal values that no write compute changes, so a bad value in step 3 refuses the plan before step 1 writes anything. A computed value and a `$ref` value are judged at their step, after the `$ref`s are resolved and the field pipes and write compute have run; a refusal there rolls the transaction back. Nested write data is checked against the target Resource's validators. A [`ctx` call](/docs/pipeline-context) from a stage keeps validators too.

Validators add up across layers. A check at the root applies to both origins; one in the `client` overlay applies to remote callers only; one in `application` to your server code only:

```ts
resources: { User: { fields: { bio: { pipelines: { validators: [AvZ.maxLength(2000)] } } } } },
client: {
  resources: { User: { fields: { bio: { pipelines: { validators: [AvZ.maxLength(500)] } } } } },
},
```

A remote caller is held to both checks, so effectively 500. Your own server code is held to 2000.

## In the generated client

A field's validators are part of the client contract, but only on fields the client layer exposes. The generated client copies the check code into its own files and runs it before it sends a call. A call that breaks a check rejects with the same `AvValidationError` the server would answer, and no request is sent:

```ts
import avClient, { AvValidationError } from "./api/AvClient";

try {
  await avClient.Project.create.one({
    data: { name: "no", slug: "no", ownerId: "6f1c2b9e-0d4c-4d8a-9a57-3c1e2f4b5a6d" },
  });
} catch (error) {
  if (error instanceof AvValidationError) {
    error.code;                 // "A2004"; nothing was sent
    error.cause.issues?.[0];
    // { code: "V1004", path: ["arguments", "data", "name"],
    //   message: "Value must be at least 3 characters long.", check: "min_length", params: { minimum: 3 } }
  }
}
```

- A transaction is checked whole before it is sent. A bad value in any step rejects with `cause.operation` naming the step. A `$ref` value is checked by the server, at its step.
- Nested write data, list fields, `$push` entries and Json shape checks are checked too. A Json value that does not match its shape at all is sent, and the server answers it.
- The server checks every value again. The client checks the value as the caller wrote it, and the server checks it after its field pipes. See [Pipes that normalize](#pipes-that-normalize).
- The generated code still imports nothing from `@aventara/*` or zod at runtime. A contract with no checks generates the same files as before.

Adding, removing or changing a check on a client-visible field changes the client contract's [hash](/docs/contract-hash): regenerate the client.

## Pipes that normalize

The generated client checks a value as the caller wrote it, and the server checks it after the field's pipes. So a field pipe that normalizes a value (trims it, lower-cases it) must not turn a value the client accepted into one the server refuses. If it does, the client sends the call and the server answers `A2004` for a value the client said was fine.

`AvZ.minLength(1)` behind a trimming pipe breaks this rule: the client accepts `"   "`, the pipe trims it to `""`, and the server refuses it. Check for a non-space character instead, which gives the same answer before and after the trim:

```ts
title: {
  pipelines: {
    pipes: [(value) => (typeof value === "string" ? value.trim() : value)],
    validators: [AvZ.regex(/\S/), AvZ.maxLength(200)],   // not AvZ.minLength(1)
  },
},
```

`AvZ.maxLength(200)` is safe here: trimming only makes a value shorter, so a value the client accepted still passes. The same holds for a Json field's shape.

## Startup errors

A check that does not fit its field is a type error in a configuration TypeScript checks, and a startup error (`COMPILER_INVALID_VALIDATOR`) with the path and the reason:

| Mistake | Example |
|---|---|
| A check for another type | `AvZ.maxLength(80)` on an `int` field |
| A list check on a field that is not a list | `AvZ.maxItems(5)` on a `String` field |
| `validators` on a relation field | relation fields take write guards only |
| `validators` on a Json field | the checks go in `definition.json` |
| Something that is not an `AvZ` check | a zod check or a function |

`validators: []` is accepted and does nothing.

## See also

- [Pipelines](/docs/pipelines): field pipes, guards and where validators run in the order.
- [JSON fields](/docs/json-fields): shapes and their checks.
- [Client errors](/docs/client-errors): `AvValidationError` and its issues.
- [Error codes](/docs/error-codes#v-codes)
