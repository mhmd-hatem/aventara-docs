---
title: Error codes
description: The complete A-code and V-code tables - HTTP status, meaning, typical cause, fix and the generated client's error class for each.
order: 82
section: reference
---

# Error codes

Every operation answers one envelope, `{ data, code, cause }`. `code` is an A-code: the outcome. When a request breaks a rule, `cause.issues[]` holds one or more V-codes that say what is wrong and where. The HTTP status is a function of the A-code alone. Branch on `code`, never on `message`.

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1005","path":["arguments","where","nope"],"message":"Field \"nope\" is not available on Resource \"User\"."}]}}
```

Raw database errors, SQL, connection strings and stack traces are never put in `cause`.

## Which error class

The generated client resolves for `A1xxx` and throws for every other code. All thrown classes extend `AvError` (`code`, `cause`); `AvTransportError` is separate. Server-side calls (`framework.application`, `framework.client`, `framework.transaction`, and a stage's `ctx` calls) throw the same classes by the same table; import them from `@aventara/core`. `framework.execute` and `framework.executeTransaction` answer the envelope instead.

| Class | Thrown for |
|---|---|
| `AvProtocolError` | `A2000`, `A2001`, `A2002`, `A2006`, `A2010`, `A2011`, `A2012` |
| `AvNotFoundError` | `A2003` |
| `AvValidationError` | `A2004`, `A2007`, `A2009`, including a [field validator](/docs/field-validators) the client checks before sending |
| `AvContractMismatchError` | `A2005` |
| `AvConflictError` | `A2008`, `A2013`, `A2014` |
| `AvInternalError` | `A3000`, `A3001`, `A3002`, `A3003`, `A3004` |
| `AvAuthError` | `A4000`, `A4001`, `A4002` |
| `AvTransportError` (`status: number \| null`) | No framework envelope arrived: no response, a proxy's HTML page, a body of another shape. |

## A-codes

Every code below has its own entry on this page, at `#` and the code in lower case (`/docs/error-codes#a2004`). That is the `docs` URL a startup diagnostic carries and `AvErrorCatalog[code].docs` returns: the catalog `@aventara/core` exports, and also ships as `ERRORS.md` in the package. The entries are generated from it.

### Success (A1xxx)

#### `A1000`

**Success.** HTTP 200.

- Cause: A read, a count or another operation without a more specific success code succeeded.
- Fix: Nothing: the call succeeded.

#### `A1001`

**No match.** HTTP 200.

- Cause: A first-style operation (find.first, update.first, delete.first) matched no row; data is null and the generated client resolves null.
- Fix: Nothing: handle the null result. A unique operation answers A2003 instead.

#### `A1002`

**Created.** HTTP 201.

- Cause: create.one created a row.
- Fix: Nothing: the call succeeded.

#### `A1003`

**Created many.** HTTP 201.

- Cause: create.many or create.count created rows.
- Fix: Nothing: the call succeeded.

#### `A1004`

**Updated.** HTTP 200.

- Cause: update.first or update.unique updated a row.
- Fix: Nothing: the call succeeded.

#### `A1005`

**Updated many.** HTTP 200.

- Cause: update.many or update.count updated rows.
- Fix: Nothing: the call succeeded.

#### `A1006`

**Deleted.** HTTP 200.

- Cause: delete.first or delete.unique deleted a row.
- Fix: Nothing: the call succeeded.

#### `A1007`

**Deleted many.** HTTP 200.

- Cause: delete.count deleted rows.
- Fix: Nothing: the call succeeded.

#### `A1008`

**Upserted.** HTTP 200.

- Cause: upsert.unique created or updated a row.
- Fix: Nothing: the call succeeded.

#### `A1009`

**Transaction committed.** HTTP 200.

- Cause: A whole transaction plan committed; data holds one result per step.
- Fix: Nothing: the plan committed.

### Request errors (A2xxx)

#### `A2000`

**Invalid request.** HTTP 400, thrown as `AvProtocolError`.

- Cause: The HTTP request cannot be interpreted: malformed JSON, a body that is not a JSON object, an unknown `/_*` path, a body that does not decode in its Content-Encoding, or a missing Aventara-Protocol-Version or Aventara-Contract-Hash header (the message names it).
- Fix: Send a JSON object with both identity headers. The generated client does this for you.

#### `A2001`

**Unknown Resource.** HTTP 404, thrown as `AvProtocolError`.

- Cause: The Resource is not in the caller's contract: misspelt, hidden by exposure, or added to the schema after aventara:prepare last ran. cause.message is "The requested Resource is not available." and the issue is V1005 at `["resource"]`.
- Fix: Use the model's exact name. After a schema change run the adapter's generate step (`npm run aventara:prepare` in a scaffolded project), restart, and regenerate the client. A Resource hidden on purpose is reached from server code (framework.application).

#### `A2002`

**Unknown operation.** HTTP 404, thrown as `AvProtocolError`.

- Cause: The operation is not available on that Resource: a typo, removed by exposure, an operation the adapter does not offer (such as delete.many), or a ctx.$sql, appTx.$sql or ctx.$transaction the adapter or the layer cannot run. The issue is V1006 at `["family"]` or `["variant"]`.
- Fix: Call an operation the contract lists (`GET <api>/_contract`), regenerate a stale client, and check the layer's exemptions and transactionsStyle.

#### `A2003`

**Not found.** HTTP 404, thrown as `AvNotFoundError`.

- Cause: A unique operation (find.unique, update.unique, delete.unique) matched no row, or a $connect names a record that does not exist. The operation fails, so no after hook runs. Under a policy, a row outside the caller's read scope is a miss too, and so is a single-row update or delete of a row the caller cannot read, so the answer does not reveal that the row exists. A row the caller can read but not change answers A4002.
- Fix: Catch AvNotFoundError, or use a first-style operation, which answers A1001 with null. Check the $connect identifier.

#### `A2004`

**Validation failed.** HTTP 422, thrown as `AvValidationError`.

- Cause: The arguments break a contract rule or a field validator. cause.issues lists each problem by V-code and path; a validator's issue also has check and params. The validators judge the values after the pipes and write compute, so a computed value they refuse is here too, at its field. A required create field left out is here (V1000). So is a value the database itself refused: too long for its column or its index, or out of its range (V1004), or holding a character it cannot store or a pattern it cannot read (V1001), with the issue at `["arguments"]`, or at the value where the adapter can place it (a bigint its driver cannot bind), and its message saying what the database refused. So is a record written through a relation that writes that relation, or a field holding its reference, back (V1012, at that field), where the adapter admits no such write.
- Fix: Fix the argument each issue's path points at, as its V-code says. A field the server must fill takes a compute.create stage. For a value the database refused, send one its column holds. For a nested write that writes its relation back, leave that field out: the parent supplies it.

#### `A2005`

**Contract mismatch.** HTTP 409, thrown as `AvContractMismatchError`.

- Cause: The caller's Aventara-Contract-Hash is not the server's current one: the schema, the configuration, the limits or the exposure changed, or the client targets another deployment.
- Fix: Regenerate the client against the running server: `npm run avclient:generate`.

#### `A2006`

**Protocol mismatch.** HTTP 400, thrown as `AvProtocolError`.

- Cause: Aventara-Protocol-Version is not 1.
- Fix: Send `Aventara-Protocol-Version: 1`, or upgrade the client.

#### `A2007`

**Invalid transaction reference.** HTTP 422, thrown as `AvValidationError`.

- Cause: A transaction $ref or fingerprint is invalid: the issues are V1010, V1011, V1016, V1017 or V1018, and cause.operation is the step. A $ref with no fingerprint is A2004 / V1000.
- Fix: Let the generated client or framework.appTx build plans; check the $ref path and that the referenced step comes earlier.

#### `A2008`

**Conflict.** HTTP 409, thrown as `AvConflictError`.

- Cause: A uniqueness or reference constraint failed: a duplicate value, a missing parent, or a $disconnect or $set that would orphan a required child (also through update.first or a developer SQL statement). Sending it again unchanged fails the same way.
- Fix: Change the data. For a duplicate, update the existing row or use upsert.unique.

#### `A2009`

**Limit exceeded.** HTTP 422, thrown as `AvValidationError`.

- Cause: A contract limit was crossed: nesting depth (V1013), list or plan size (V1014), boolean nodes (V1015) or Json value depth (V1021).
- Fix: Ask for less (paginate, split the plan), or raise the limit under `limits`.

#### `A2010`

**Payload too large.** HTTP 413, thrown as `AvProtocolError`.

- Cause: The decoded request body exceeds maxRequestBytes (default 1048576).
- Fix: Send less, or raise limits.maxRequestBytes.

#### `A2011`

**Unsupported media type.** HTTP 415, thrown as `AvProtocolError`.

- Cause: The body is not application/json, or its Content-Encoding is not gzip, deflate or br.
- Fix: Send `Content-Type: application/json`.

#### `A2012`

**Method not allowed.** HTTP 405, thrown as `AvProtocolError`.

- Cause: The HTTP method does not fit the route; the Allow header names the right one (`POST` on operations and `/_transactions`, `GET` on `/_contract`).
- Fix: Use the method the Allow header names.

#### `A2013`

**Concurrent modification.** HTTP 409, thrown as `AvConflictError`.

- Cause: A competing writer reached the state first; nothing was written.
- Fix: Retry. No retry is automatic.

#### `A2014`

**Stale selection.** HTTP 409, thrown as `AvConflictError`.

- Cause: The selected state changed before the write; nothing was written.
- Fix: Read again, then retry.

### Server errors (A3xxx)

#### `A3000`

**Internal error.** HTTP 500, thrown as `AvInternalError`.

- Cause: An unexpected failure on the server: a stage threw an error that is not an AvError, an interceptor called next() twice, a compute stage reached a write through its read-only ctx, a compute stage returned a value of the wrong type, or a compute.create returned undefined for a required field. cause.message is always "Internal framework error."
- Fix: Read the real error in the diagnostics sink (the root `diagnostics` key) or the server log line for the request id, and fix that stage. To answer with a code of your choice, throw an AvError.

#### `A3001`

**Adapter error.** HTTP 500, thrown as `AvInternalError`.

- Cause: A database or ORM failure that is not something the caller can fix. cause.message is always "Adapter execution failed."
- Fix: Read the raw error in the diagnostics sink; check the database, its connection and the migration state.

#### `A3002`

**Transaction error.** HTTP 500, thrown as `AvInternalError`.

- Cause: Transaction infrastructure failed (commit or rollback, or the transaction expired or was closed under a step), or a Resource transaction interceptor called next() twice or resolved without calling it.
- Fix: Read the diagnostics sink. Call next() exactly once in a transaction interceptor; retry an infrastructure failure.

#### `A3003`

**Serialization error.** HTTP 500, thrown as `AvInternalError`.

- Cause: A result could not be encoded for transport.
- Fix: Read the diagnostics sink; make compute.read stages and Json values return plain data of the field's type.

#### `A3004`

**Pipe output invalid.** HTTP 500, thrown as `AvInternalError`.

- Cause: A server pipe, field pipe or transaction pipe (or write compute) returned arguments the server's own contract refuses: a field the Resource does not have, a wrong type, a dropped required field, a reference written together with its relation (V1012), or a changed plan. cause.message is always "A server pipeline produced invalid arguments."
- Fix: Read the server log line, which names the pipe, the operation and the path, and fix the pipe. A pipe returns a new object of the same shape, or undefined to keep the arguments.

### Authentication and authorization (A4xxx)

Produced by [pipeline](/docs/config-reference#pipelines) guards; the framework itself never authenticates. `A4002` is also what a configured policy answers when it refuses a request: see [Policies](/docs/policies).

#### `A4000`

**Unauthenticated.** HTTP 401, thrown as `AvAuthError`.

- Cause: A guard threw new AvError("A4000", ...): authentication is required or failed. The framework never authenticates by itself.
- Fix: Send the credentials your guards expect, such as the Authorization header.

#### `A4001`

**Forbidden.** HTTP 403, thrown as `AvAuthError`.

- Cause: A guard returned false ("Operation denied by a framework guard."), a field write guard or a nested write's target guard included, or a stage threw A4001.
- Fix: Call as a caller the guard admits, or stop sending the guarded field. To answer another code, throw an AvError from the guard.

#### `A4002`

**Policy denied.** HTTP 403, thrown as `AvAuthError`.

- Cause: The configuration's policy refused the request: its engine does not allow the operation, a field the request names, writes or returns, a row it reaches, a row it creates, or the row a change leaves (moved out of what the caller reads, or failing its grant's after condition, which rolls the write back); on a database without interactive transactions, a write the policy can only check after it runs; or a stage threw new AvError("A4002", ...).
- Fix: Read cause.message, which names what the policy refused. Call as a principal the policy allows, leave the refused field or relation out (a governed one is named only where every row grants it), or change only rows the caller may change and still read afterwards.

## V-codes

Validation issues appear in `cause.issues[]` as `{ code, path, message }`, plus `check` and `params` when a [field validator](/docs/field-validators) failed (`"check": "max_length", "params": { "maximum": 80 }`). `path` locates the problem in the request, for example `["arguments","where","nope"]` or `["operations",1,"args","data","authorId","$ref","path"]`. They accompany `A2004`, `A2007`, `A2009` (and `A2001` / `A2002`, where the issue names the resource or operation).

A path is the literal address of the problem in the request you sent, so you can walk the request JSON along it.

Single call. The request is `{ resource, family, variant, arguments }`. An argument issue is at `["arguments", ...]`. An unknown Resource is `A2001` / `V1005` at `["resource"]`. An operation that is not available is `A2002` / `V1006` at `["family"]` (not a standard family, or the Resource offers none of its variants) or at `["variant"]` (the family is right, the variant is not), never at `["operation"]`. On an HTTP single route, `resource`, `family` and `variant` name the URL segments (`/_resources/:resource/:family/:variant`) and the body is `arguments`.

Transaction. The request is `{ "operations": [ { resource, family, variant, args, fingerprint }, ... ] }`. Every path starts at its top, and `cause.operation` is the step's zero-based index `i`:

| About | Path |
|---|---|
| A step's arguments (whoever raised the issue, a developer-thrown one from a pipeline stage included) | `["operations", i, "args", ...]` |
| The step's Resource | `["operations", i, "resource"]` |
| The step's family or variant, whichever is wrong | `["operations", i, "family"]`, `["operations", i, "variant"]` |
| The step's fingerprint | `["operations", i, "fingerprint"]` |
| An unknown key on the step | `["operations", i, "<key>"]` |
| A step that is not an object | `["operations", i]` |

Example: the second step sends a number as a title.

```json
{ "operations": [
  { "resource": "Post", "family": "create", "variant": "one", "args": { "data": { "title": "Hello", "authorId": 1 } }, "fingerprint": "fp1:..." },
  { "resource": "Post", "family": "create", "variant": "one", "args": { "data": { "title": 5, "authorId": 1 } }, "fingerprint": "fp1:..." }
] }
```

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","operation":1,"issues":[{"code":"V1001","path":["operations",1,"args","data","title"],"message":"Value must be a string."}]}}
```

`operations`, entry `1`, `args`, `data`, `title`: the path walks the request. For a missing value (`V1000`) the last segment is the key that is absent, so the path ends at a key the request does not contain.

### V1000 to V1021

#### `V1000`

**Required value missing.**

- Cause: A required value is absent: a create leaves out a required field that has no database default and no compute.create (the path names the field), a required relation and its reference field are both missing, a typed Json field lacks a required key, or a $ref has no fingerprint.
- Fix: Send the value at the issue's path. When the server must fill it, give the field a compute.create stage or a database default; a pipe cannot fill it.

#### `V1001`

**Invalid runtime/wire type.**

- Cause: A value of the wrong type: a string where a number is expected, a negative limit, a non-integer id, null given to an operator with no null meaning (gt, contains, in), two directives in one scalar action object (`{ $increment: 1, $decrement: 2 }`), or a server-side value that is not plain data. Also a value that would make the call reach more rows: `undefined` in a filter, a unique selector or a cursor, an empty boolean node (`NOT: {}`, `AND: []`, `OR: []`) in the where of a write (update or delete many, count or first, a to-many $update or $delete).
- Fix: Send the type the contract states at that path (the generated client's types say it).

#### `V1002`

**Invalid enum value.**

- Cause: A value that is not a member of the enum, or outside a typed Json field's AvZ.enum or AvZ.literal.
- Fix: Send one of the enum's members.

#### `V1003`

**Invalid format (for example UUID/DateTime/base64).**

- Cause: A malformed datetime, decimal, base64 or UUID string, or a failed pattern or format validator (`check: "string_format"`).
- Fix: Send the canonical encoding (ISO-8601 UTC datetime, decimal string, base64 bytes) and satisfy the validator that check and params name.

#### `V1004`

**Value outside accepted range.**

- Cause: A number, length or size outside its range: a failed bound, length or size validator, a BigInt outside signed 64 bits, an AvZ.int() outside the safe integer range, or a transaction with no operations. Under A2004 it is also a value the database refused as too long or out of its range, a BigInt beyond what the data source's driver can bind among them (some bind at most ±(2^53 − 1)).
- Fix: Send a value inside the range; check and params name the validator that failed.

#### `V1005`

**Unknown or inaccessible field.**

- Cause: A field that does not exist or is hidden in the caller's layer, an unknown Resource (under A2001), or a key a typed Json field's shape does not declare.
- Fix: Use a field the caller's contract exposes, expose it through exemptions, or make the call from server code.

#### `V1006`

**Unsupported filter/order/mutation directive.**

- Cause: An operator, directive or nested write the field does not offer (at any depth, inside not too; a to-many $update's data takes only what a bulk write takes), a mode it does not offer, or an operation that is not available (under A2002).
- Fix: Use what the contract lists for that field or Resource, or expose it through exemptions.

#### `V1007`

**Invalid unique identifier shape.**

- Cause: The where of a unique operation is not exactly one complete identifier.
- Fix: Pass exactly one identifier: the id, or every field of one @unique or @@unique.

#### `V1008`

**Invalid select/include/reducer projection.**

- Cause: Both select and include, a write-only field selected, or a relation that is not selectable there.
- Fix: Use select or include, not both, and select only readable fields.

#### `V1009`

**Invalid or non-deterministic cursor.**

- Cause: A cursor without an explicit orderBy, or cursor keys that do not match the ordered fields.
- Fix: Give an orderBy and a cursor holding exactly its ordered fields.

#### `V1010`

**Invalid transaction reference path.**

- Cause: A $ref path the earlier step does not return, a $ref to a step that is not in the transaction, or to a step with no single row (a many or count step).
- Fix: Select the referenced field in the earlier step, and reference a single-row step.

#### `V1011`

**Transaction reference type mismatch.**

- Cause: The referenced value's type does not fit its target, a nullable source where only a non-null value is accepted included.
- Fix: Reference a field of the target's type, non-null where the target needs it.

#### `V1012`

**Invalid relation action/cardinality.**

- Cause: A nested write that does not fit the relation (a list where one record is expected), a reference field set together with its own relation, one record mixing reference fields and relation writes where the adapter cannot run both, or a record written through a relation that writes that relation (or a field holding its reference) back, where the adapter admits no such write. Also a to-one $update or $upsert beside $connect, $connectOrCreate, $create, $set or $disconnect on the same relation: the row it would update is the newly linked one.
- Fix: Write either the relation or its reference field, in the relation's cardinality. Relink a to-one relation in one write and update the linked row in another.

#### `V1013`

**Maximum nesting depth exceeded.**

- Cause: Nested projections, filters or writes deeper than maxNestingDepth.
- Fix: Nest less, or raise limits.maxNestingDepth.

#### `V1014`

**Configured limit exceeded.**

- Cause: A limit above maxListLimit, or more steps than maxTransactionOperations.
- Fix: Paginate or split the plan, or raise the limit.

#### `V1015`

**Boolean/filter node limit exceeded.**

- Cause: A where tree with more nodes than maxBooleanNodes.
- Fix: Simplify the filter (in instead of many OR clauses), or raise limits.maxBooleanNodes.

#### `V1016`

**Invalid transaction reference index.**

- Cause: A $ref to the referencing step itself or a later one, or to an index no step has.
- Fix: Reference an earlier step only.

#### `V1017`

**Transaction fingerprint mismatch.**

- Cause: A hand-written plan whose fingerprint does not match its step.
- Fix: Let the generated client, framework.appTx or framework.clientTx build the plan.

#### `V1018`

**Transaction reference resolved to no value.**

- Cause: The referenced step returned no value at that path, such as a first step that matched no row.
- Fix: Make sure the earlier step returns a row, or use a unique step, which fails with A2003.

#### `V1019`

**Transaction step depends on a row removed by an earlier step's cascade**

- Cause: A later step uses a row that an earlier step's delete removed through a database cascade.
- Fix: Reorder or drop the dependent step.

#### `V1020`

**Transaction mixes application and client steps.**

- Cause: One framework.transaction([...]) list mixes appTx and clientTx steps.
- Fix: Build every step of a plan from one origin.

#### `V1021`

**Json value depth limit exceeded.**

- Cause: A Json field's value nests deeper than maxJsonDepth.
- Fix: Flatten the value, or raise limits.maxJsonDepth.

The V-code vocabulary is closed: exactly `V1000` to `V1021`. A field validator adds no code of its own: it reports `V1003` or `V1004` with `check` and `params`.

### Example messages

Real messages, as a running server sends them:

| Code | Example message |
|---|---|
| `V1000` | `Required property "operations" is missing.` / `Field "email" is required to create User.` / `Relation "author" is required to create Post: write it, or "authorId".` |
| `V1001` | `Value must be a string.` / `limit must be a non-negative integer.` / `Value must be non-null.` / `Value must be plain data.` / `Value could not be read.` |
| `V1002` | `Value is not a member of enum "Role".` / `Value must be one of "draft", "published".` |
| `V1003` | `Value must use canonical ISO-8601 UTC encoding.` / `Value must use decimal string encoding.` / `Value must be an email address.` |
| `V1004` | `Value outside accepted range.` / `BigInt value is outside signed 64-bit range.` / `Value must be at most 80 characters long.` |
| `V1005` | `Field "nope" is not available on Resource "User".` |
| `V1006` | `Filter operator "regex" is not available on field "name".` / `Relation filter "category" is not available here: a nested $update or $delete filter on this relation takes scalar fields only.` |
| `V1007` | `Unique selector must exactly match one active identifier on Resource "User".` |
| `V1008` | `select and include are mutually exclusive.` / `Field "passwordHash" is not selectable.` |
| `V1009` | `Cursor keys must exactly match the active ordered scalar fields.` |
| `V1010` | `Transaction reference path is not present in the source projection.` / `Transaction reference names an operation that is not in this transaction.` / `Transaction reference source has no addressable single-row projection.` |
| `V1011` | `Transaction reference source type is not assignable to its destination.` |
| `V1013` | `Request nesting exceeds maxNestingDepth (12).` |
| `V1014` | `limit exceeds maxListLimit (250).` / `Transaction operation count exceeds maxTransactionOperations (20).` |
| `V1015` | `Boolean/filter node count exceeds maxBooleanNodes (50).` |
| `V1016` | `Transaction reference operation index is invalid.` |
| `V1017` | `Operation fingerprint does not match its arguments.` |
| `V1020` | `Transaction mixes application and client steps.` |
| `V1021` | `Json value depth exceeds maxJsonDepth (64).` |

## Which V-codes go with which A-code

| A-code | V-codes it can carry |
|---|---|
| `A2001` | `V1005` |
| `A2002` | `V1006` |
| `A2004` | `V1000` to `V1012` (except as listed below), `V1019`, `V1020` |
| `A2007` | `V1010`, `V1011`, `V1016`, `V1017`, `V1018` |
| `A2009` | `V1013`, `V1014`, `V1015`, `V1021` |

## Reading errors in the client

```ts
import avClient, { AvNotFoundError, AvValidationError, AvContractMismatchError, AvTransportError } from "./api/AvClient";

try {
  await avClient.User.find.unique({ where: { id: 99999 } });
} catch (e) {
  if (e instanceof AvNotFoundError) { /* A2003 */ }
  else if (e instanceof AvValidationError) { console.log(e.code, e.cause.issues); }
  else if (e instanceof AvContractMismatchError) { /* regenerate the client */ }
  else if (e instanceof AvTransportError) { console.log(e.status); }   // null when nothing arrived
  else throw e;
}
```

Real results from a running server:

| Call | Thrown |
|---|---|
| `find.unique({ where: { id: 99999 } })` | `AvNotFoundError` `A2003` |
| `find.many({ limit: 100000 })` | `AvValidationError` `A2009`, issue `V1014` |
| `find.many({ where: { OR: [ ...60 clauses ] } })` | `AvValidationError` `A2009`, issue `V1015` |
| `create.one({ data: {} })` on `User` | `AvValidationError` `A2004`, issues `V1000` at `["arguments","data","email"]` (one per missing required field) |
| `create.one({ data: { email: "ada@example.com" } })` (duplicate) | `AvConflictError` `A2008` |
| a transaction whose second step conflicts | `AvConflictError` `A2008`, `cause.operation === 1` |
| a call from a stale client | `AvContractMismatchError` `A2005` |
| a call with nothing listening | `AvTransportError`, `status === null` |
| a call to an entrypoint that answers 404 with no envelope | `AvTransportError`, `status === 404` |

## Startup codes

When the configuration cannot be built into contracts, `createFramework` (and `AventaraModule`) throws one `AvConstructionError` before the server listens. It has `stage` and `diagnostics`, each `{ code, path, message, docs }`: `docs` is the URL of the code's entry below. A compiler path starts with the layer (`root.`, `application.`, `client.`, `agent.`).

### Configuration

#### `CONFIG_REQUIRED`

**A required configuration key is missing.**

- Cause: A key that must be present is absent: api, adapter, or an overlay's exposed when the overlay sets exemptions, or policy.engine or policy.principal when policy is set.
- Fix: Add the key at the diagnostic's path.

#### `CONFIG_UNKNOWN_PROPERTY`

**Unknown configuration key.**

- Cause: A key the configuration does not define at that place: a typo, or a key written at the wrong level of the tree. `policy` and `prebuilt` are root-only keys; in an overlay they read as unknown.
- Fix: Remove it, or move it where it belongs (the configuration reference's "Where a key can go").

#### `CONFIG_INVALID_TYPE`

**A configuration key has the wrong type.**

- Cause: A value of the wrong type, or a key set to an explicit undefined.
- Fix: Give the value the type the reference states; leave a key out rather than setting it to undefined.

#### `CONFIG_INVALID_VALUE`

**A configuration value is not allowed.**

- Cause: A malformed api or mcp path, a negative limit, an unknown transactionsStyle, a format that is not a named zod format, forceTransaction under an effective transactionsStyle "none", an after check on any action but update, or a policy engine's governed, paths or afterChecks naming a Resource, field or path the Core Contract does not have, or its unheld naming a Resource the data source's model does not have (the message names the Resource or the rule).
- Fix: Use a value the message allows.

#### `CONFIG_MOVED_PROPERTY`

**A configuration key moved in rc.1.**

- Cause: Configuration written for 1.0.0-rc.0: restrictions, entrypoint, fields, behaviors, transactions or pipelines.before/after.
- Fix: Move it where the message says: restrictions to exposed + exemptions, entrypoint to api, fields to `resources.<R>.fields.<f>.definition`, transactions to transactionsStyle, before/after to pipelines.hooks.

#### `CONFIG_FORBIDDEN_IN_OVERLAY`

**A root-only key is written in an overlay.**

- Cause: A field definition in application, client or agent.
- Fix: Define the field once at the root (`resources.<R>.fields.<f>.definition`); an overlay only chooses its visibility.

### Discovery

#### `DISCOVERY_TRANSACTION_CAPABILITY_MISMATCH`

**The adapter's transaction capability does not match it.**

- Cause: The adapter declares interactive transactions but provides no transaction function.
- Fix: A defect of the adapter: install the adapter release that matches @aventara/core exactly.

### Contract compilation

#### `COMPILER_UNKNOWN_RESOURCE`

**Unknown Resource.**

- Cause: A Resource name the adapter's model does not have, in resources or in exemptions; or a client or agent entry for a Resource managed elsewhere, which those layers never have.
- Fix: Use the model's exact name. After a schema change run `npm run aventara:prepare`. Configure a Resource managed elsewhere at the root or in application only.

#### `COMPILER_UNKNOWN_FIELD`

**Unknown field.**

- Cause: A field that is neither in the schema nor defined at the root.
- Fix: Fix the name, run aventara:prepare after a schema change, or add the field with a root definition.

#### `COMPILER_RELATION_FIELD_CONFIG_UNSUPPORTED`

**A relation field takes write guards only.**

- Cause: Field pipes or compute on a relation field.
- Fix: Put the stage on the relation's reference field, or use an operation pipe.

#### `COMPILER_INCOMPLETE_FIELD`

**An added field is incomplete.**

- Cause: A definition that adds a field leaves out type, nullable or list.
- Fix: Spell out type, nullable and list, with lifecycle: ["VIRTUAL"] for a field that has no column.

#### `COMPILER_STRUCTURAL_FIELD_OVERRIDE`

**A discovered field's structure was redefined.**

- Cause: A definition on a field the adapter discovered changes its type, format or capabilities.
- Fix: Restate only its type, nullable and list. Change capabilities through exemptions and the column through the schema.

#### `COMPILER_MISSING_SCALAR`

**Unknown scalar type.**

- Cause: A definition names a scalar type that does not exist.
- Fix: Use a built-in scalar: string, boolean, int, float, bigint, decimal, datetime, bytes or json.

#### `COMPILER_MISSING_ENUM`

**Unknown enum.**

- Cause: A definition names an enum the model does not have.
- Fix: Use an enum of the schema, and run aventara:prepare after adding one.

#### `COMPILER_DANGLING_RELATION`

**A visible relation points at a hidden Resource.**

- Cause: A layer hides a Resource but still exposes a relation field that targets it.
- Fix: Hide the relation field too (`exemptions.resources.<R>.fields.<relation>: true`), or expose the target.

#### `COMPILER_UNAVAILABLE_OPERATION`

**Operation not available.**

- Cause: An operation the adapter does not offer (such as delete.many), or an overlay granting one that its parent hid.
- Fix: Remove it. To reach an operation from one overlay only, expose it at the root and hide it in the other overlay.

#### `COMPILER_UNAVAILABLE_CAPABILITY`

**Capability not available.**

- Cause: A capability or token the field does not offer, or an overlay (or the agent layer) granting one its parent hid. Overlays only narrow.
- Fix: Remove it, or expose it in the parent layer and hide it in the layer it must not reach.

#### `COMPILER_INVALID_LIFECYCLE`

**Invalid field lifecycle.**

- Cause: An added field declares a lifecycle other than VIRTUAL, a VIRTUAL field claims a database-generated lifecycle or a provider-side capability, or a definition redefines a discovered field's lifecycle.
- Fix: Give an added field lifecycle: ["VIRTUAL"] and only the capabilities it can serve; computed lifecycles come from compute stages.

#### `COMPILER_MISSING_READ_COMPUTE`

**A selectable virtual field has no compute.read.**

- Cause: A VIRTUAL field that can be selected has no pipelines.compute.read stage.
- Fix: Add a compute.read stage, or make the field write-only with capabilities.select: false.

#### `COMPILER_INVALID_COMPUTE_DEPENDENCY`

**Invalid compute.read dependency.**

- Cause: A dependsOn entry that is not a stored scalar field of the same Resource.
- Fix: List only stored scalar fields of the Resource in dependsOn.

#### `COMPILER_RESERVED_RESOURCE_NAME`

**Reserved Resource name.**

- Cause: A model name starts with $, which is reserved for the framework's own names (ctx.$sql, $ref), or is the name of a member beside the Resources: all on serverClient (and so on Next.js's avClient), and on a host that adds its own, one of those (on Next.js: tx and transaction on avClient, appTx and transaction on avApp).
- Fix: Rename the model; the table it maps to can keep its name. A host member's name is also left free when the layer it belongs to hides the Resource.

#### `COMPILER_MISSING_IDENTIFIER`

**A unique operation has no identifier.**

- Cause: A layer exposes a unique variant (find.unique, update.unique, delete.unique, upsert.unique) and no complete identifier of the Resource it may filter on: a Pick that did not pick one with its filter, or an Omit that hid every one or its filter.
- Fix: Expose an identifier field with its filter (id, or every field of one unique), or exempt the unique variants.

#### `COMPILER_HIDDEN_REQUIRED_FIELD`

**A layer that creates a Resource hides a required field.**

- Cause: A layer still creates the Resource (a create or upsert variant, or a nested create) while a required field, or a required relation's reference field, is hidden or has its create capability exempted, and no compute.create fills it.
- Fix: Expose the field, give it a compute.create stage, or exempt the layer's create operations.

#### `COMPILER_INVALID_VALIDATOR`

**A field validator cannot apply.**

- Cause: A validator that is not built with AvZ, does not fit the field's type (AvZ.maxLength on an int, AvZ.maxItems on a field that is not a list), or sits on a relation or Json field.
- Fix: Use an AvZ check that fits the field's type; a Json field's checks go in its json shape.

#### `COMPILER_INVALID_JSON_SHAPE`

**A Json shape cannot apply.**

- Cause: A json shape on a field that is not a discovered Json field, a shape not built with AvZ, or one that admits null or absence at its top level.
- Fix: Put the shape on a Json field, build it with AvZ, and keep its top level non-null (the column's nullability decides null).

#### `COMPILER_INVALID_CLIENT_CONTRACT`

**The compiled client contract is invalid.**

- Cause: The finished client contract failed its own structural check: a framework defect.
- Fix: Report it with the diagnostic's path and message.

### Startup warnings

Two conditions are not errors. The server starts and answers correctly. Each prints one warning through `process.emitWarning`, with its code as the warning's `code`.

#### `AVENTARA_PREBUILT_STALE`

**A prebuilt Contracts file was not used.** Printed once when the framework is created with `prebuilt` ([Deploying](/docs/deploying#build-time-contracts)).

- Cause: The file was compiled by another `@aventara/core` version or protocol version, or from a different configuration or adapter model. The message names what changed, for example `prebuilt Contracts are stale and were not used: Resource Post changed since it was built. The Contracts were compiled at startup instead; regenerate the file with aventara-build.` A `policy` or other root key added where the framework is created, but not in the configuration `aventara-build` ran, reads as a change outside the Resources.
- Fix: Run `aventara-build` (`npm run aventara:prepare`). Add `aventara-build --check` to CI to catch it before a deploy.

#### `AVENTARA_STALE_GENERATED_TYPES`

**The generated types are stale.** Printed at startup when the computed fields the discovery artifact was typed with differ from the configuration's `compute.create` and `compute.update` stages.

- Cause: A compute stage was added, moved or removed since `aventara:prepare` last ran. The message lists each field that differs.
- Fix: Run `npm run aventara:prepare`. The warning changes nothing at runtime.

### Example startup messages

| Code | Example message |
|---|---|
| `CONFIG_REQUIRED` | `api is required` / `client.exposed is required when client.exemptions is set: true makes the exemptions hide, false makes them the only entries exposed` |
| `CONFIG_UNKNOWN_PROPERTY` | `unknown configuration property: nope` |
| `CONFIG_INVALID_VALUE` | `transactionsStyle must be "none" or "interactive"` |
| `CONFIG_MOVED_PROPERTY` | `restrictions moved in rc.1: use exposed + exemptions` |
| `CONFIG_FORBIDDEN_IN_OVERLAY` | `client.resources.Post.fields.url.definition: definition is only allowed at root; a field is defined once and overlays only choose its visibility (define it at resources.Post.fields.url.definition)` |
| `COMPILER_UNKNOWN_RESOURCE` | `resource "Nope" is not present in the canonical adapter model` |
| `COMPILER_UNKNOWN_FIELD` | `field "nope" is neither discovered by the adapter nor defined at the root` |
| `COMPILER_UNAVAILABLE_OPERATION` | `operation "delete.many" is not available for resource "User"` |
| `COMPILER_UNAVAILABLE_CAPABILITY` | `field "User.passwordHash" is hidden by the root, and an overlay only narrows the root's view; expose it at the root and hide it in application instead` |
| `COMPILER_MISSING_IDENTIFIER` | ``client.exemptions.resources.User.operations.find.unique needs an identifier field; pick `id` (or another complete identifier) too`` |
| `COMPILER_HIDDEN_REQUIRED_FIELD` | `the client layer still creates resource "Post" (create.one, ...) but hides its required field "title", which every create must write; expose "title", give "title" a compute.create, or exempt the create operation` |
| `COMPILER_DANGLING_RELATION` | `relation target "Post" is not present in the active Contract` |
| `COMPILER_RESERVED_RESOURCE_NAME` | `resource "$jobs" starts with "$", which is reserved for the framework's own names` |
| `COMPILER_INVALID_VALIDATOR` | `relation field "Post.category" takes write guards only; validators check a scalar field's value` |

More on each: [Configuration reference](/docs/config-reference#startup-diagnostics) and [Exposure](/docs/exposure).

## See also

- [HTTP protocol](/docs/http-protocol): the envelope and the curl walkthrough.
- [Troubleshooting](/docs/troubleshooting): the errors people hit first.
- [Frontend client](/docs/client-errors) and [Client API reference](/docs/client-api-reference).
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Policies](/docs/policies), [Limits and safety](/docs/limits-and-safety), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
