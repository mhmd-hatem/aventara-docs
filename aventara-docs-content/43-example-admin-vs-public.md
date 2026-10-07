---
title: "Example: admin vs public"
description: One API, two layers - server code gets the application layer with full access, remote callers get the narrower client layer; a Nest service and a frontend side by side.
order: 71
section: examples
---

# Example: admin vs public

Aventara compiles two contracts from one schema and one configuration:

| Layer | Used by | Reached through |
|---|---|---|
| **application** | Your own server code (trusted) | `framework.application.*` in a Nest service |
| **client** | Remote callers (untrusted) | HTTP, `avclient`'s generated client |

Both run the same operations. What differs is what the configuration allows. This example continues [the blog API](/docs/example-blog-api), where restrictions are set under `client` only, so the application layer keeps full access.

## The configuration, in one glance

```ts
return {
  entrypoint: "/api",
  adapter: /* ... */,
  client: {                                   // remote callers only
    restrictions: {
      User: {
        fields: {
          passwordHash: { capabilities: { select: false, filter: false, order: false } },
          internalNotes: { hidden: true },
        },
        operations: { delete: { first: false, count: false } },
      },
    },
    limits: { maxListLimit: 50 },
  },
} as const;
```

Root settings would apply to both layers; `client` and `application` override them one layer at a time. See [Contract layers](/docs/contract-layers).

## Server side: the application layer

Inject the framework and call it directly. No HTTP, no guard, no limits beyond the application layer's own:

```ts
// src/admin.service.ts
import { Injectable } from "@nestjs/common";
import { InjectFramework } from "@aventara/nest";
import type { AppFramework } from "./aventara.config.js";

@Injectable()
export class AdminService {
  constructor(@InjectFramework() private readonly framework: AppFramework) {}

  /** Trusted: passwordHash and internalNotes are readable here. */
  async usersWithPrivateFields() {
    const res = await this.framework.application.User.find.many({
      select: ["id", "email", "passwordHash", "internalNotes"],
    });
    if (res.code !== "A1000") throw new Error(res.cause?.message);
    return res.data;
  }

  /** Mass delete is switched off for remote callers, not for us. */
  async purgeUnpublished() {
    const res = await this.framework.application.Post.delete.count({ where: { published: false } });
    return { code: res.code, deleted: res.data };
  }
}
```

```ts
// src/admin.controller.ts
import { Controller, Get, Post } from "@nestjs/common";
import { AdminService } from "./admin.service.js";

@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("users") users() { return this.admin.usersWithPrivateFields(); }
  @Post("purge") purge() { return this.admin.purgeUnpublished(); }
}
```

Register both in your module (`controllers: [AdminController]`, `providers: [AdminService]`). Real responses:

```bash
curl -s localhost:3000/admin/users
```

```json
[{"id":1,"email":"ada@example.com","passwordHash":"","internalNotes":null}]
```

```bash
curl -s -X POST localhost:3000/admin/purge
```

```json
{"code":"A1007","deleted":2}
```

Two things to notice:

- Server-side calls **return the envelope** (`{ data, code, cause }`) and do not throw for operation failures. Check `code`, as above.
- `AdminController` is **your** controller, outside `/api`. Nothing makes it safe by itself: protect it with a Nest guard like any other route. (Nest guards do not run on the protocol routes, but they do run on yours.)

## Frontend: the client layer

The generated client only knows the client layer's contract:

```ts
import avClient from "./api/AvClient";

const users = await avClient.User.find.many({ select: ["id", "email"] });
// [{ id: 1, email: "ada@example.com" }]

avClient.User.delete.first;     // undefined: the operation does not exist for remote callers
avClient.Post.find.many({ limit: 100 });   // rejected: limit exceeds maxListLimit (50)
```

`passwordHash` and `internalNotes` are not in the `User` type, so TypeScript refuses `select: ["passwordHash"]` at compile time; a caller that bypasses the types gets `A2004` back.

## The same call through both layers

`framework.client` runs the client layer's rules **in process**: the same restrictions, limits and pipelines a remote caller gets. It is how you test, or reuse, exactly what the frontend sees:

```ts
const res = await this.framework.client.User.find.many({ select: ["id", "passwordHash"] });
// res.code === "A2004"
// res.cause.issues[0] = { code: "V1008", path: ["arguments","select",1],
//                         message: 'Field "passwordHash" is not selectable.' }
```

| | `framework.application` | `framework.client` | `avClient` over HTTP |
|---|---|---|---|
| Sees `passwordHash` | yes | no | no |
| Sees `internalNotes` | yes | no | no |
| `User.delete.first` | yes | no | no |
| List limit | the application layer's | 50 | 50 |
| Client guard (`requireSignIn`) | not applied | applied (writes need headers) | applied |
| Returns | envelope | envelope | data, or throws |

Root pipelines apply to both layers; `client.pipelines` only to the client layer. Authenticate remote callers there, and keep server-only checks in your Nest code.

## When to use which

- **Trusted server code** (jobs, admin endpoints, webhooks, seed scripts): `framework.application`.
- **Anything a browser or mobile app can reach**: the client layer, through the generated client or the HTTP protocol. Make it as narrow as the product needs.
- **Server-side rendering on behalf of a user**: prefer the client layer so a bug cannot leak what the user may not see.

## See also

- [Example: blog API](/docs/example-blog-api)
- [Contract layers](/docs/contract-layers)
- [Querying: running operations on the server](/docs/querying#running-operations-on-the-server)
- [NestJS host](/docs/nestjs-host#injecting-the-framework)
- Guides: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Restricting operations](/docs/restricting-operations), [Authentication and guards](/docs/authentication-and-guards), [Server-side usage](/docs/server-side-usage)
