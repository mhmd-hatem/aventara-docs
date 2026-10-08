---
title: Client errors
description: The generated client's error classes, how to branch on them with instanceof, what cause and issues carry, TransportError versus FrameworkError, and ContractMismatchError.
order: 53
section: frontend
---

# Client errors

A client call resolves to the data, or throws. There is no `{ data, code, cause }` envelope to inspect: the generated client unwraps successes and turns every failure into a typed error. Branch on the class (or on `code`), never on the message text.

```ts
import avClient, { NotFoundError } from "./api/AvClient";

try {
  await avClient.User.find.unique({ where: { id: 9999 } });
} catch (e) {
  if (e instanceof NotFoundError) {
    console.log(e.code);           // "A2003"
    console.log(e.cause.message);  // "No record matched the unique selector."
  } else {
    throw e;
  }
}
```

## The classes

All are exported from `AvClient.ts`. Every class except `TransportError` extends `FrameworkError` and carries `code` and `cause`.

| Class | Codes | Thrown when |
|---|---|---|
| `ValidationError` | `A2004`, `A2007`, `A2009` | The request breaks a contract rule: unknown field, wrong type, field not selectable, bad `$ref`, limit exceeded. `cause.issues` lists the problems. |
| `NotFoundError` | `A2003` | A `unique` operation matched nothing. |
| `ConflictError` | `A2008`, `A2013`, `A2014` | A uniqueness or reference constraint (`A2008`), a concurrent modification (`A2013`) or a stale selection (`A2014`). The last two may succeed if retried. |
| `AuthError` | `A4000`, `A4001`, `A4002` | A pipeline guard refused: unauthenticated, forbidden, policy denied. |
| `ContractMismatchError` | `A2005` | The generated client is stale. Regenerate. |
| `ProtocolError` | `A2000`, `A2001`, `A2002`, `A2006`, `A2010`, `A2011`, `A2012` | The request could not be understood or routed. Rare with a generated client. |
| `InternalError` | `A3000` to `A3004` | An unexpected server or adapter failure. |
| `TransportError` | none | No framework answer arrived. |

The full code table, with HTTP statuses, is in [HTTP protocol](/docs/http-protocol#codes).

### A `TypeError` before anything is sent

One refusal is not a `FrameworkError` at all. The client reads the arguments you pass it through a guard, and a value that cannot be read (a revoked Proxy, a getter that throws) is refused with a `TypeError` that names where, before a request is made:

```text
TypeError: An operation's arguments must be readable plain data, and the value at /where/id could not be read.
```

A `tx` builder never throws for this either: `avClient.transaction([...])` rejects with that `TypeError`. Server-side calls answer the same mistake as `A2004` / `V1001` instead ([Server-side usage](/docs/server-side-usage#what-a-server-side-call-accepts)).

## cause and issues

`FrameworkError.cause` has this shape:

```ts
interface Cause {
  readonly message: string;
  readonly issues?: readonly ValidationIssue[];  // validation failures
  readonly operation?: number;                   // transaction step that failed
}
interface ValidationIssue {
  readonly path?: readonly (string | number)[];
  readonly code: ValidationCode;                 // "V1001", ...
  readonly message: string;
}
```

A validation failure, as thrown for `where: { email: { contains: 5 } }`:

```ts
// ValidationError, e.code === "A2004"
// e.cause === {
//   message: "Operation arguments failed framework validation.",
//   issues: [{
//     path: ["arguments", "where", "email", "contains"],
//     code: "V1001",
//     message: "Value must be a string."
//   }]
// }
```

When the issue comes from your own pipeline code, `message` is the text you wrote, if it was non-blank and at most 1,000 characters; otherwise it is the standard text for the code. Use `path` to attach the message to a form field:

```ts
import { ValidationError } from "./api/AvClient";

function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ValidationError)) return {};
  const out: Record<string, string> = {};
  for (const issue of e.cause.issues ?? []) {
    // paths look like ["arguments", "data", "email"]
    const field = issue.path?.[issue.path.length - 1];
    if (typeof field === "string") out[field] = issue.message;
  }
  return out;
}
```

A transaction error carries `cause.operation`, the zero-based index of the failing step ([Transactions](/docs/transactions#rollback)).

## Handling the common cases

```ts
import avClient, {
  AuthError, ConflictError, ContractMismatchError, NotFoundError,
  TransportError, ValidationError,
} from "./api/AvClient";

try {
  await signedInClient.User.create.one({ data: { email: "ada@example.com" } });
} catch (e) {
  if (e instanceof ConflictError) {
    // A2008: "The operation conflicts with the current state of the resource." (duplicate email)
  } else if (e instanceof AuthError) {
    // A4000: "Sign in first."  -> send the user to the login screen
  } else if (e instanceof ValidationError) {
    // show e.cause.issues
  } else if (e instanceof ContractMismatchError) {
    // the app is older than the API: ask for a reload / redeploy
  } else if (e instanceof TransportError) {
    // offline, DNS, CORS, or a non-Aventara answer
  } else {
    throw e;
  }
}
```

`AuthError` comes from your own guards ([Configuration](/docs/configuration#pipelines)); the message is whatever your guard threw. The same holds for the `message` of each issue a pipeline throws (`FrameworkError("A2004", { message, issues })`), when its path names a member of the request's arguments. Without a guard nothing throws it.

## TransportError versus FrameworkError

| | `FrameworkError` family | `TransportError` |
|---|---|---|
| Meaning | The framework answered, and said no | No framework answer arrived |
| Has | `code`, `cause` | `status` (HTTP status or `null`) |
| Remedy | By code | Check the network, URL and server |

`TransportError` covers:

- A failed request (server down, refused connection, CORS failure in a browser): `status` is `null`, message `The request for "User" find.many failed before any response arrived.`
- A response that is not an Aventara envelope, such as a proxy's or a host's own 404 for a path it does not mount: `status` is the HTTP status, message `The response to "User" find.many (HTTP 404) is not an Aventara response envelope.`
- A value in a response that cannot be read.

A `TransportError` names no remedy: nothing in it says the client is stale or the server is wrong.

An aborted call is neither: it rejects with exactly what `fetch` rejected with, an `AbortError` `DOMException` ([Client options](/docs/client-options#aborting)).

## ContractMismatchError

A generated client is bound to the contract hash and protocol version it was generated from, and sends both on every request. When the server's contract differs, it refuses with `A2005`:

```text
ContractMismatchError: Generated client contract does not match the server. Regenerate the client.
```

This also happens when the client calls an operation the server no longer advertises, because the server checks the client's identity before it routes. The remedy is always the same: regenerate against the deployment the client calls ([Keeping in sync](/docs/keeping-in-sync)).

## No automatic retries

The client never retries. `ConflictError` with `A2013` or `A2014` is the one case where retrying the same call can succeed; do it yourself, with a limit.

## See also

- [Client options](/docs/client-options)
- [Keeping in sync](/docs/keeping-in-sync)
- [HTTP protocol](/docs/http-protocol#codes)
- [Troubleshooting](/docs/troubleshooting)
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics), [Limits and safety](/docs/limits-and-safety)
