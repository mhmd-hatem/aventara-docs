---
title: Error codes
description: The complete A-code and V-code tables - HTTP status, meaning, typical cause, fix and the generated client's error class for each.
order: 82
section: reference
---

# Error codes

Every operation answers one envelope, `{ data, code, cause }`. `code` is an **A-code**: the outcome. When a request breaks a rule, `cause.issues[]` holds one or more **V-codes** that say what is wrong and where. The HTTP status is a function of the A-code alone. **Branch on `code`, never on `message`.**

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1005","path":["arguments","where","nope"],"message":"Field \"nope\" is not available on Resource \"User\"."}]}}
```

Raw database errors, SQL, connection strings and stack traces are never put in `cause`.

## Which client error class

The generated client resolves for `A1xxx` and throws for every other code. All thrown classes extend `FrameworkError` (`code`, `cause`); `TransportError` is separate.

| Class | Thrown for |
|---|---|
| `ProtocolError` | `A2000`, `A2001`, `A2002`, `A2006`, `A2010`, `A2011`, `A2012` |
| `NotFoundError` | `A2003` |
| `ValidationError` | `A2004`, `A2007`, `A2009` |
| `ContractMismatchError` | `A2005` |
| `ConflictError` | `A2008`, `A2013`, `A2014` |
| `InternalError` | `A3000`, `A3001`, `A3002`, `A3003`, `A3004` |
| `AuthError` | `A4000`, `A4001`, `A4002` |
| `TransportError` (`status: number \| null`) | No framework envelope arrived: no response, a proxy's HTML page, a body of another shape. |

## A-codes

### Success (A1xxx)

| Code | Name | HTTP | Meaning | Operations |
|---|---|---|---|---|
| `A1000` | OK | 200 | Read, count or other success. | `find.*` |
| `A1001` | NO_MATCH | 200 | A first-style operation matched nothing; `data` is `null`. The client resolves `null`. | `find.first`, `update.first`, `delete.first` |
| `A1002` | CREATED | 201 | | `create.one` |
| `A1003` | CREATED_MANY | 201 | | `create.many`, `create.count` |
| `A1004` | UPDATED | 200 | | `update.first`, `update.unique` |
| `A1005` | UPDATED_MANY | 200 | | `update.many`, `update.count` |
| `A1006` | DELETED | 200 | | `delete.first`, `delete.unique` |
| `A1007` | DELETED_MANY | 200 | | `delete.count` |
| `A1008` | UPSERTED | 200 | | `upsert.unique` |
| `A1009` | TRANSACTION_COMMITTED | 200 | A whole plan committed; `data` is one result per step. | `POST /_transactions` |

### Request errors (A2xxx)

| Code | Name | HTTP | Meaning and typical cause | Fix |
|---|---|---|---|---|
| `A2000` | INVALID_REQUEST | 400 | Malformed JSON, body that is not a JSON object, an unknown `/_*` path, a body that does not decode in its `Content-Encoding`, or missing identity headers. | Send a JSON object. Send both `Aventara-Protocol-Version` and `Aventara-Contract-Hash`; the message names which is missing. |
| `A2001` | UNKNOWN_RESOURCE | 404 | The Resource is not in the layer's contract: misspelt, hidden, or a model added to the schema after `aventara:prepare` last ran. | Check the exact key (the Prisma model name). After a schema change run `npx prisma generate && npm run aventara:prepare`, rebuild and restart. |
| `A2002` | UNKNOWN_OPERATION | 404 | The operation is not available on that Resource: a typo, switched off by a restriction, or `delete.many`. | Use an operation the contract advertises; regenerate the client if it is stale. |
| `A2003` | NOT_FOUND | 404 | A `unique` operation matched nothing. | Handle it (`NotFoundError`), or use a `first` operation, which answers `A1001`. |
| `A2004` | VALIDATION_FAILED | 422 | The arguments break a contract rule. `cause.issues` lists each by V-code and `path`. | Fix the argument the issue points at. |
| `A2005` | CONTRACT_MISMATCH | 409 | The caller's contract hash is not the current one: the schema, configuration, limits or operations changed, or the client targets another deployment. | Regenerate: `npm run avclient:generate`. |
| `A2006` | PROTOCOL_MISMATCH | 400 | `Aventara-Protocol-Version` is not `1`. | Send `1`, or upgrade the client. |
| `A2007` | INVALID_REFERENCE | 422 | A transaction `$ref` or fingerprint is invalid. Issues use `V1010`, `V1011`, `V1016`, `V1017`, `V1018` or `V1019`; `cause.operation` is the step. | Let the generated client build plans; check the `$ref` path and that the referenced step comes first. |
| `A2008` | CONFLICT | 409 | A uniqueness or reference constraint, or a write that would leave a child without its required parent. Retrying unchanged fails the same way. | Change the data (a duplicate email, a missing parent, a `$disconnect` or `$set` that would orphan a required child). |
| `A2009` | LIMIT_EXCEEDED | 422 | A contract limit: nesting depth, list size, boolean nodes, plan size. Issues use `V1013`, `V1014` or `V1015`. | Ask for less, or raise the [limit](/docs/config-reference#limits). |
| `A2010` | PAYLOAD_TOO_LARGE | 413 | The decoded body exceeds `maxRequestBytes` (default 1048576). | Send less, or raise the limit. |
| `A2011` | UNSUPPORTED_MEDIA_TYPE | 415 | Not `application/json`, or an unsupported `Content-Encoding` (`gzip`, `deflate`, `br` are accepted). | Send `Content-Type: application/json`. |
| `A2012` | METHOD_NOT_ALLOWED | 405 | Wrong HTTP method; the `Allow` header names the right one (`POST` on operations and `_transactions`, `GET` on `_contract`). | Use the method in `Allow`. |
| `A2013` | CONCURRENT_MODIFICATION | 409 | A competing writer reached the state first; nothing was written. Retryable. | Retry. No retry is automatic. |
| `A2014` | STALE_SELECTION | 409 | The selected state changed before the write; nothing was written. Retryable. | Re-read and retry. |

### Server errors (A3xxx)

| Code | Name | HTTP | Meaning | What to do |
|---|---|---|---|---|
| `A3000` | INTERNAL_ERROR | 500 | Unexpected failure. `cause.message` is always `Internal framework error.` | Register a [`diagnostics` sink](/docs/config-reference#diagnostics); the real error is delivered there, never in the response. |
| `A3001` | ADAPTER_ERROR | 500 | A database or ORM failure that could not be classified as something the caller can fix (`Adapter execution failed.`). Conflicts you can fix are `A2008`/`A2013`/`A2014`. | Use a `diagnostics` sink. |
| `A3002` | TRANSACTION_ERROR | 500 | Transaction infrastructure failed (commit or rollback). | `diagnostics` sink; retry. |
| `A3003` | SERIALIZATION_ERROR | 500 | A result could not be encoded for transport. | `diagnostics` sink. |
| `A3004` | PIPE_OUTPUT_INVALID | 500 | A server [pipe](/docs/pipelines#what-a-pipe-may-and-may-not-do) returned arguments that the server's own contract refuses (a field the Resource does not have, a wrong type). It is a defect in your pipe, not in the caller's request, so `cause.message` is always the generic `A server pipeline produced invalid arguments.` | Read the server log: the pipe, the operation and the field are there ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log)). Fix the pipe. |

### Authentication and authorization (A4xxx)

Produced by [pipeline](/docs/config-reference#pipelines) guards; the framework itself never authenticates.

| Code | Name | HTTP | Meaning |
|---|---|---|---|
| `A4000` | UNAUTHENTICATED | 401 | Authentication required or failed. A guard threw `new FrameworkError("A4000", "...")`. |
| `A4001` | FORBIDDEN | 403 | Not permitted. Also what a guard that returns `false` produces: `Operation denied by a framework guard.` |
| `A4002` | POLICY_DENIED | 403 | A guard denied the operation with a policy reason of your choosing. |

## V-codes

Validation issues appear in `cause.issues[]` as `{ code, path, message }`. `path` locates the problem in the request, for example `["arguments","where","nope"]` or `["operations",1,"args","data","authorId","$ref","path"]`. They accompany `A2004`, `A2007`, `A2009` (and `A2001` / `A2002`, where the issue names the resource or operation).

| Code | Meaning | Typical cause | Example message (real) |
|---|---|---|---|
| `V1000` | Required value missing. | A required property is absent, such as `operations` on a transaction body; a `create` that omits a required field with no default (the issue's `path` names the field). | `Required property "operations" is missing.` / `Field "email" is required to create User.` |
| `V1001` | Invalid type. | A string where a number is expected, a negative `limit`, a non-integer id. | `Value must be a string.` / `limit must be a non-negative integer.` |
| `V1002` | Invalid enum value. | A value that is not a member of the enum. | `Value is not a member of enum "Role".` |
| `V1003` | Invalid format. | A bad datetime, decimal, base64 or UUID string. | `Value must use canonical ISO-8601 UTC encoding.` / `Value must use decimal string encoding.` |
| `V1004` | Value out of range. | A transaction plan with no operations; a number outside its accepted range; a `BigInt` outside the signed 64-bit range. | `Value outside accepted range.` / `BigInt value is outside signed 64-bit range.` |
| `V1005` | Unknown or inaccessible field. | A field that does not exist or is hidden in the layer; an unknown Resource (under `A2001`). | `Field "nope" is not available on Resource "User".` |
| `V1006` | Unsupported filter, order or mutation directive, or operation not available. | An operator the field does not offer, a directive not allowed, a relation not writable in that position, an unavailable operation (under `A2002`). | `Filter operator "regex" is not available on field "name".` |
| `V1007` | Invalid unique identifier shape. | `where` on a `unique` operation is not exactly one identifier. | `Unique selector must exactly match one active identifier on Resource "User".` |
| `V1008` | Invalid select, include or reducer projection. | Both `select` and `include`; a write-only field selected; a relation not selectable in this position. | `select and include are mutually exclusive.` / `Field "passwordHash" is not selectable.` |
| `V1009` | Invalid or non-deterministic cursor. | `cursor` without an explicit `orderBy`, or keys that do not match the ordering. | `Cursor keys must exactly match the active ordered scalar fields.` |
| `V1010` | Invalid transaction reference path. | A `$ref` path the earlier step does not return. | `Transaction reference path is not present in the source projection.` |
| `V1011` | Transaction reference type mismatch. | A referenced value of the wrong type for its target field. | |
| `V1012` | Invalid relation action or cardinality. | A nested write directive that does not fit the relation (for example a list where one record is expected). | |
| `V1013` | Maximum nesting depth exceeded. | Nested projections, filters or writes deeper than `maxNestingDepth`. | `Request nesting exceeds maxNestingDepth (12).` |
| `V1014` | Configured limit exceeded. | `limit` above `maxListLimit`; more steps than `maxTransactionOperations`. | `limit exceeds maxListLimit (250).` / `Transaction operation count exceeds maxTransactionOperations (20).` |
| `V1015` | Boolean or filter node limit exceeded. | A `where` tree with more than `maxBooleanNodes` nodes. | `Boolean/filter node count exceeds maxBooleanNodes (50).` |
| `V1016` | Invalid transaction reference index. | A `$ref` to a step that does not exist or comes later. | |
| `V1017` | Transaction fingerprint mismatch. | A hand-written plan whose fingerprint does not match its step. | `Operation fingerprint does not match its arguments.` |
| `V1018` | Transaction reference resolved to no value. | The referenced step returned nothing at that path (for example a `first` step that matched no row). | |
| `V1019` | A transaction step depends on a row removed by an earlier step's cascade. | A later step uses a row that an earlier delete removed through a database cascade. | |

The V-code vocabulary is closed: exactly `V1000` to `V1019`.

## Which V-codes go with which A-code

| A-code | V-codes it can carry |
|---|---|
| `A2001` | `V1005` |
| `A2002` | `V1006` |
| `A2004` | `V1000` to `V1012` (except as listed below) |
| `A2007` | `V1010`, `V1011`, `V1016`, `V1017`, `V1018`, `V1019` |
| `A2009` | `V1013`, `V1014`, `V1015` |

## Reading errors in the client

```ts
import { AvClient, FrameworkError, NotFoundError, ValidationError, ConflictError, ContractMismatchError, TransportError } from "./api/AvClient";

try {
  await avClient.User.find.unique({ where: { id: 99999 } });
} catch (e) {
  if (e instanceof NotFoundError) { /* A2003 */ }
  else if (e instanceof ValidationError) { console.log(e.code, e.cause.issues); }
  else if (e instanceof ContractMismatchError) { /* regenerate the client */ }
  else if (e instanceof TransportError) { console.log(e.status); }   // null when nothing arrived
  else throw e;
}
```

Real results from a running server:

| Call | Thrown |
|---|---|
| `find.unique({ where: { id: 99999 } })` | `NotFoundError` `A2003` |
| `find.many({ limit: 100000 })` | `ValidationError` `A2009`, issue `V1014` |
| `find.many({ where: { OR: [ ...60 clauses ] } })` | `ValidationError` `A2009`, issue `V1015` |
| `create.one({ data: {} })` on `User` | `ValidationError` `A2004`, issues `V1000` at `["arguments","data","email"]` (one per missing required field) |
| `create.one({ data: { email: "ada@example.com" } })` (duplicate) | `ConflictError` `A2008` |
| a transaction whose second step conflicts | `ConflictError` `A2008`, `cause.operation === 1` |
| a call from a stale client | `ContractMismatchError` `A2005` |
| a call with nothing listening | `TransportError`, `status === null` |
| a call to an entrypoint that answers 404 with no envelope | `TransportError`, `status === 404` |

## See also

- [HTTP protocol](/docs/http-protocol): the envelope and the curl walkthrough.
- [Troubleshooting](/docs/troubleshooting): the errors people hit first.
- [Frontend client](/docs/client-errors) and [Client API reference](/docs/client-api-reference).
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Limits and safety](/docs/limits-and-safety), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
