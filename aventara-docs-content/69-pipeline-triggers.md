---
title: "The pipeline: triggers and functions around every operation"
description: How Aventara's stages map to what a database does around a statement (constraints, row-level security, BEFORE and AFTER triggers, generated columns), the four values a stage reads (ctx.$args, ctx.$write, ctx.$written and the result), request rules versus row rules, and where each stage runs in a transaction.
order: 23
section: guides
---

# The pipeline: triggers and functions around every operation

If you have written database triggers, you already know most of the [pipeline](/docs/pipelines). Aventara runs your code at fixed points around each operation, much as a database runs constraints, triggers and generated columns around each statement. This page maps one to the other, names the four values a stage can read, and says where each stage runs when the operation is part of a transaction.

## One operation, three sides

An operation has three sides, and each stage belongs to one of them:

- **The request side** (who may ask, and what is asked): guards and pipes. They see the call, never a row.
- **The row side** (what each row may hold): field validators and compute. They work like `CHECK` constraints and generated columns, once per record.
- **The statement side** (what happens around the write): interceptors and hooks. They work like triggers and middleware around the statement.

Filters are the exception handler. They run when something after framework validation fails.

```text
                         plain call         forceTransaction / a plan step
framework validation
policy admission                                  (before BEGIN)
guards, pipes                                     (before BEGIN)
validators (the caller's values)                  (before BEGIN, for literal values)
                                                  BEGIN
row check                          a single-row update or delete, with a policy: a row out of scope stops here
write compute, re-check            ctx.$write exists from here
policy write check                 on compute's output; a refusal runs no hook
interceptors enter
hooks.before                       may return { data } for the row
policy write check, again          only when a hook's { data } changed ctx.$write
the adapter call (one statement), compute.read on the returned rows
hooks.after                        ctx.$written
interceptors unwind
output validation                                 COMMIT
filters, on a failure
```

## The trigger table

| Stage | What it is in a database | Where the comparison stops |
|---|---|---|
| Framework validation | the schema itself: column types, `NOT NULL`, the shape of a foreign key | It checks the whole request before anything runs. A database checks at the write. |
| Policy admission, policy write check | row-level security: `USING` and `WITH CHECK` | Declarative and outside your code. Like RLS, it decides rows and fields. |
| Guard | `GRANT`, or a permission check in a stored procedure's first lines; a BEFORE STATEMENT trigger that raises | It runs before the pipes and, under `forceTransaction` or in a plan, before `BEGIN`: a read it makes can be stale at commit. |
| Field write guard | a column privilege (`GRANT UPDATE (col)`) | It fires only when the caller sends the field, as a column grant does, and it can read `ctx` and decide per request. |
| Pipe | a rewrite rule, or middleware that rewrites the query | It sees only the call, never rows. What it returns is checked against the server's own contract. |
| Field pipe | a domain's input function, or a BEFORE ROW trigger doing `NEW.email := lower(NEW.email)` | It runs only on sent values, has no `ctx`, and runs before the validators, so it normalizes before the `CHECK`. |
| Field validator | a `CHECK` or `DOMAIN` constraint | It judges each sent value before compute, then only what compute or a before hook changed. It does not judge a directive's operand (`$increment`). It is part of the contract, so the generated client runs the visible ones too. |
| Write compute | a BEFORE ROW trigger setting `NEW.col`; a `GENERATED ALWAYS AS (...) STORED` column when it reads only the row | It runs per record, nested records and every `create.many` entry included. It may read other tables (a generated column cannot) and cannot write. On an update it sees the patch, never the old row. |
| Read compute | a virtual generated column (PostgreSQL 18 `GENERATED ... VIRTUAL`), or a view's column | It runs per returned row and may read other tables. It is never stored. |
| Interceptor | middleware around the statement; a database has none | It can answer without running the operation, or answer a different result (output validation still holds). |
| `hooks.before` | a BEFORE STATEMENT trigger; returning `{ data }`, a BEFORE ROW trigger's `NEW.x := ...` on a single-row write | It runs once per operation, not per row, and never for a nested write's target. It is inside the transaction only under `forceTransaction` or in a plan. |
| The adapter call | the statement | One call; nested writes are part of it. |
| The answer (`result`) | `RETURNING` | It is shaped by the caller's `select` and read compute; a hidden field never appears. |
| `hooks.after` | an AFTER ROW or AFTER STATEMENT trigger | Without a transaction the write has already committed, so it is closer to a `LISTEN`/`NOTIFY` consumer: it cannot undo. `result` is the answer, not the new row; the row's identifiers are `ctx.$written`. |
| Filter | `EXCEPTION WHEN ... THEN` in PL/pgSQL | Only for failures after framework validation; inner to outer; the first answer wins. |
| Resource transaction stages | a wrapper around the whole transaction; the after hook is close to a `DEFERRABLE INITIALLY DEFERRED` constraint trigger | They see the whole plan, not rows. |
| `ctx.<Resource>` calls | calls under `session_replication_role = replica`: constraints and generated columns apply, ordinary triggers do not | They also skip guards and pipes, which a replica session would not. |

## The four values

| Value | What it holds | Who reads it |
|---|---|---|
| `ctx.$args` | the call: the arguments as the caller sent them and the pipes shaped them. Never compute's output, never a before hook's values. | every operation stage, compute included |
| `ctx.$write` | what the write writes: `ctx.$args` after write compute and the values `before` hooks returned, exactly what the adapter is handed, in the same shape as `ctx.$args` | a create's, an update's or an upsert's interceptors (as they entered), `before` hooks (with the earlier hooks' values), `after` hooks, and filters reached after write compute |
| `ctx.$written` | the written row's identifiers (`{ id }`), whatever the caller selected; `undefined` when a `first` write matched no row | the `after` hooks of `create.one`, `update.first`, `update.unique`, `upsert.unique`, `delete.first` and `delete.unique` |
| `result` | the answer: the caller's `select`, read compute applied | an `after` hook's first parameter, and what an interceptor's `next()` resolves |

Write compute's `data` parameter is one record of `ctx.$write`, built so far: the caller's values after the pipes, plus what earlier compute stages set. Read the caller's own value from `ctx.$args`.

| Stage | `$args` | `$write` | `$written` |
|---|---|---|---|
| guard, field write guard | the call, before the pipes | – | – |
| pipe | the call, as the pipes so far left it (the same as its `args`) | – | – |
| write compute | the call, after the pipes (`data` is the record being written) | – | – |
| interceptor | the call | as it was when the interceptor entered | – |
| `hooks.before` | the call | after compute, with the earlier before hooks' values | – |
| read compute | the call | – | – |
| `hooks.after` | the call | what was written | the row's identifiers |
| filter | the call | when the failure came after write compute | – |

A Resource transaction stage reads its plan as `ctx.$plan`, the same plan its pipe takes as `plan`.

## A worked example

A post starts as a draft whatever the caller sends. A caller may ask to publish it at once, and the rule that allows that reads the author's other posts, so it runs inside the transaction. After the write, an event names the new post's id.

```ts
// src/resources/post.resource.ts
import { defineResource } from "@aventara/core";
import { discovery } from "../generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;

export const post = defineResource<Model>()("Post", {
  fields: {
    // NEW.status := 'DRAFT': what the caller sent stays in ctx.$args.
    status: { pipelines: { compute: { create: () => "DRAFT" } } },
  },
  operations: {
    create: {
      one: {
        forceTransaction: true,
        pipelines: {
          hooks: {
            before: [
              async (ctx) => {
                const asked = ctx.$args.data.status; // what the caller sent: "LIVE"
                const authorId = ctx.$write.data.authorId; // what will be written
                if (asked !== "LIVE" || typeof authorId !== "number") return;
                const live = await ctx.Post.find.count({ where: { authorId, status: "LIVE" } });
                // A BEFORE ROW trigger's NEW.status := 'LIVE', judged by the validators.
                if (live < 3) return { data: { status: "LIVE" } };
              },
            ],
            after: [
              async (_result, ctx) => {
                // The new row's id, even when the caller selected no id.
                await ctx.OutboxEvent.create.one({
                  data: { topic: "post.created", payload: { postId: ctx.$written.id } },
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

The caller sends `status: "LIVE"`. Write compute sets `DRAFT`, so the before hook reads `"LIVE"` from `ctx.$args` and `"DRAFT"` from `ctx.$write`. When the author has fewer than three live posts, it returns `{ data: { status: "LIVE" } }`, and that value is merged into the row. What a before hook returns is judged as compute's output is: by the field validators (`A2004`), by the root's validators on a field the caller's layer hides (`A3000`), and by Aventara's own checks (`A3004`). With a policy, the write check runs twice here: once before any interceptor or hook, on what compute left, so a write the policy refuses runs no hook; and again just before the adapter, because the hook changed the write, on the row as it now stands, against the stored row as the first check read it. A hook's values are held to the policy and the server's rules, not to the caller's field write grants, as compute's are. The `after` hook reads the id from `ctx.$written`, so the caller does not have to `select` it.

Several before hooks run in stage order (layer, Resource, family, variant; at each, the root's, then the overlay's). A later hook's value replaces an earlier one's, and every hook's value replaces write compute's. A before hook returns values only on `create.one`, `update.first` and `update.unique`, and only for the row's own fields: no relation and no nested write. It may set any writable scalar, the identifier fields included, as pipes and compute may; setting the primary key moves the row. Returning a value anywhere else answers `A3004`. So does returning any key other than `data` beside it (`where`, say): the types do not always catch it, so the runtime refusal is the guard.

## Row-level and statement-level

Compute runs once per record: for every row of a `create.many`, and for every record a nested write creates or updates. Hooks run once per operation, and never for a nested write's target. A rule that must hold for each nested record belongs in that Resource's compute or validators; a rule about the operation as a whole belongs in a hook.

## Request rules versus row rules

- **A guard checks the request:** may this caller do this operation (a role, an origin, a tenant), and is the call well formed. It runs before the transaction, sees a plan step's `$ref`s unresolved in `ctx.$args`, and is cheap and early.
- **`hooks.before` checks the row:** any rule that depends on stored state, such as a status transition, "the base unit cannot be edited", or stock that must not go negative. Under `forceTransaction` or in a plan it runs inside the transaction, just before the write, with `ctx.$args`' references resolved and no step of the request between the check and the write. It is the BEFORE ROW trigger.
- A guard may refuse early on stored state, as an optimization, but it is never the authority: the same rule must hold in `hooks.before`.
- An update guard cannot pass `ctx.$args.where` to a `ctx` find: in a plan, `where.id` may be a `$ref`, and TypeScript says so (`TS2322`). Do the lookup in `hooks.before`, where `ctx.$args.where` is resolved:

```ts
// src/resources/ticket.resource.ts
import { AvError, defineResource } from "@aventara/core";
import { discovery } from "../generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;

export const ticket = defineResource<Model>()("Ticket", {
  operations: {
    update: {
      unique: {
        forceTransaction: true,
        pipelines: {
          hooks: {
            before: [
              async (ctx) => {
                const stored = await ctx.Ticket.find.unique({ where: ctx.$args.where, select: ["status"] });
                if (stored.status === "CLOSED") throw new AvError("A4002", "A closed ticket stays closed.");
              },
            ],
          },
        },
      },
    },
  },
});
```

A check inside the transaction still reads under your database's isolation level: under PostgreSQL's default, two transactions can both pass it before either writes. When two requests can race on one row, make the write itself the check ([Check, then act](/docs/pipelines#check-then-act)).

## Inside a transaction

With `forceTransaction`, or as a step of a [transaction plan](/docs/transactions), framework validation, policy admission, guards, pipes and the validators of the caller's literal values run before `BEGIN`; a refusal there opens nothing. Everything from write compute on runs inside the transaction: the validators of `$ref` values, write compute and its re-check, the policy write check, the interceptors and hooks, the check's second pass when a hook's values changed the write, the adapter call and output validation. A throw there rolls the transaction back, and the hooks' `ctx` calls and `ctx.$sql` join it. Without a transaction, nothing is opened around the call, and an `after` hook runs after the write has committed.

## `ctx` calls skip the triggers, not the constraints

A call a stage makes through `ctx` (`ctx.<Resource>.<family>.<variant>(args)`) runs framework validation, field pipes, compute and validators: the constraints and generated columns. It runs none of your guards, pipes, hooks, interceptors, filters or transaction stages, so a hook's call never re-enters the hook.

## See also

- [Pipelines](/docs/pipelines): every stage, its registration and the full order.
- [Which stage do I use?](/docs/which-stage): tasks mapped to stages.
- [The pipeline context](/docs/pipeline-context): every `ctx` member.
- [Computed fields](/docs/computed-fields) and [Field validators](/docs/field-validators).
