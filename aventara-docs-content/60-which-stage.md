---
title: Which stage do I use?
description: Common tasks mapped to the pipeline stage that fits them (guards, pipes, validators, compute, hooks, interceptors, filters, Resource transaction stages and ctx.$state), with the order the stages run in and the rules people trip over.
order: 24
section: guides
---

# Which stage do I use?

Aventara has several places to run your own code around an operation, and most tasks have one place that fits. This page maps common tasks to their stage, shows the order the stages run in, and lists the rules that are easy to miss. [Pipelines](/docs/pipelines) is the full reference.

## By task

| You want to | Use | Where it goes |
|---|---|---|
| Check a permission | a guard | `pipelines.guards`, at the layer, a Resource, a family or a variant |
| Limit which rows and fields a caller may read or write, per caller | a [policy](/docs/policies) | the root `policy` key: an engine that answers `can`, `scopeOf` and `fieldsOf`. It runs before your guards. |
| Refuse a write to one field | a field write guard | `resources.<R>.fields.<f>.pipelines.guards` |
| Normalize input (trim, lower-case, add a default, scope a query) | a pipe, or a field pipe for one field's value | `pipelines.pipes`, or `resources.<R>.fields.<f>.pipelines.pipes` |
| Enforce a rule on a value (length, range, pattern, format) | a validator | `resources.<R>.fields.<f>.pipelines.validators` |
| Fill in or derive a field's value | compute | `resources.<R>.fields.<f>.pipelines.compute` (`create`, `update`, `read`) |
| React after a write (an event, an audit row, a counter) | an `after` hook that writes through `ctx.<Resource>` or `ctx.$sql`, with `forceTransaction` on the operation when those writes must commit with it | `pipelines.hooks.after` |
| Wrap the execution (timing, caching, retries, `try`/`catch`, `AsyncLocalStorage`) | an interceptor | `pipelines.interceptors` |
| Turn an error into an answer for the caller | a filter | `pipelines.filters` |
| Check a whole transaction (at most one delete per plan, for example) | the Resource's transaction stages | `resources.<R>.transactions.pipelines` |
| Share request information between stages (the signed-in user) | `ctx.$state` | seeded by `AventaraModule`'s `state` option, or by a call's `{ state }` option |
| Call another operation from a stage | `ctx.<Resource>.<family>.<variant>(args)` | the `ctx` every stage gets (compute can only read) |

Some details behind the rows:

- A guard returns `false` to refuse with `A4001`, or throws an `AvError` to answer with another code. See [Authentication and guards](/docs/authentication-and-guards).
- A field pipe is a pure function of one value and gets no `ctx`. An operation pipe gets the whole arguments and `ctx`, and returns new arguments.
- Validators are declarative `AvZ` checks. They are part of the contract, so the generated client runs the client-visible ones before it sends a request. See [Field validators](/docs/field-validators).
- Compute gets a read-only `ctx`: it can call `ctx.<Resource>.find.*` and read `ctx.$state`, and nothing that writes. See [Computed fields](/docs/computed-fields).
- An interceptor's `next()` runs everything below it, the hooks included, so an `AsyncLocalStorage` store you enter there is visible to every hook and to the adapter call. Guards, pipes, write compute and validators have already run by the time any interceptor starts.
- A filter returns an `AvError` to answer with, or `undefined` to pass the error on to the next filter.

## The order

Every operation runs its stages in this order:

```text
framework validation -> guards -> pipes -> write compute -> re-check (validators) -> interceptors (enter) -> hooks.before -> operation -> hooks.after -> interceptors (unwind) -> filters
```

With the levels filled in:

```text
validate the arguments against the contract, required create fields included
                  (a field a compute.create fills is not required yet)
-> guards         layer -> Resource -> family -> variant (root, then overlay, at each),
                  then the write guards of each field the caller sent
-> pipes          the same levels, then the field pipes
-> compute        create or update: fill the values to write
-> re-check       Aventara's own checks on the output, then the validators on every value
-> interceptors   enter, outer to inner
-> hooks.before   outer to inner
-> operation      one adapter call, then compute (read) on the returned rows
-> hooks.after    inner to outer
-> interceptors   unwind, inner to outer

on a failure after validation: filters, inner to outer; the first one that handles it wins
```

A call that a guard, a pipe's output or a validator refuses runs no interceptor and no hook. An error thrown in any stage still reaches the filters. So does a `find.unique`, `update.unique` or `delete.unique` that matches no row: it fails at the operation with an `AvNotFoundError`, and no `after` hook runs ([A unique operation that finds no row](/docs/pipelines#a-unique-operation-that-finds-no-row)).

### Inside a transaction

A transaction plan, or a call to an operation with `forceTransaction`, splits the stages around the database transaction:

```text
every step, in plan order: framework validation (required fields; a $ref counts as a value)
                           -> guards -> pipes -> validators   (the literal values no write compute changes; $refs unresolved)
BEGIN
  each touched Resource's transaction guards, then pipes   (they see the whole plan)
  every touched Resource's transaction interceptors enter, then every touched Resource's hooks.before
    each step: resolve its $refs -> field pipes on the resolved values -> compute
               -> validators on every value -> interceptors -> hooks.before -> adapter call -> hooks.after -> interceptors
  every touched Resource's hooks.after (they see every step's result), then every touched Resource's
  interceptors unwind
COMMIT

on a failure: the step's own filters first; then the touched Resources' transaction interceptors unwind,
then their transaction filters run; then ROLLBACK
```

A step that is refused before `BEGIN` opens nothing. A step's guards and pipes run outside the transaction, so the `ctx` calls they make do not join it. The calls made by its interceptors and hooks do. See [Resource transaction stages](/docs/pipelines#resource-transaction-stages) and [`forceTransaction`](/docs/pipelines#forcetransaction).

## Rules that are easy to miss

- A Resource reached only through a nested write runs no transaction stages. Those run once per transaction that has a top-level step on the Resource. `Post.create({ data: { category: { $create: { ... } } } })` runs `Category`'s guards and field stages on the nested data, but not `Category`'s transaction stages, hooks or interceptors. A plain call without `forceTransaction` runs no transaction stages at all. See [Relations and nested writes](/docs/relations-and-nested-writes).
- Validators do not judge a directive's operand, because the operand is not the field's value. `{ $increment: 500 }` is not checked against the field's `AvZ.lte(100)`. `$push` entries are judged. If the stored result must stay in range, check it in a guard or with a database constraint.
- Calls through `ctx` are raw. A `ctx.<Resource>` call runs the framework's own validation, field pipes, field validators and compute, and none of your stages: no guards, pipes, hooks, interceptors or filters at any level, no field write guards, no transaction stages and no `forceTransaction`. So a hook's call never re-enters the hook that made it. The calls are application-origin: the `application` overlay's exposure applies to them and the `client` overlay's does not. See [Calling the framework from a stage](/docs/pipeline-context#calling-the-framework-from-a-stage).
- `ctx.$state` is the only thing a stage can change in place. It is one object per request, shared by every stage and inherited by `ctx` calls. Compute can read it but not write it. See [Request state](/docs/pipeline-context#request-state).
- The arguments are read-only. A pipe changes them by returning new ones, and once the validators have run, after write compute, nothing can change them, so what the validators checked is what the adapter writes. An `after` hook gets a frozen copy of the result; to answer with a different result, use an interceptor. See [Read-only data](/docs/pipelines#read-only-data).
- A required create field the caller left out is refused before the guards, so no pipe can fill it. Give the field a `compute.create` stage or a database default instead. See [Computed fields](/docs/computed-fields).
- Without a transaction, a write has already committed when its `after` hook runs. Set `forceTransaction` on the operation when the hook's writes must commit or roll back with it.

## See also

- [Pipelines](/docs/pipelines): every stage, the levels and the full order.
- [The pipeline context](/docs/pipeline-context): `ctx`, `ctx.$state`, `ctx.$sql`, `ctx.$transaction` and recipes.
- [Field validators](/docs/field-validators) and [Computed fields](/docs/computed-fields)
- [Transactions](/docs/transactions)
