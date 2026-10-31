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
| application | Your own server code (trusted) | `framework.application.*` in a Nest service |
| client | Remote callers (untrusted) | HTTP, `avclient`'s generated client |

Both run the same operations. What differs is what the configuration allows. This example continues [the blog API](/docs/example-blog-api), where exemptions are set under `client` only, so the application layer keeps full access.

## The configuration, in one glance

```ts
return {
  api: "/api",
  adapter: /* ... */,
  client: {                                   // remote callers only
    exposed: true,
    exemptions: {
      resources: {
        User: {
          fields: {
            passwordHash: ["select", "filter", "order"],
            internalNotes: true,
          },
          operations: { delete: ["first", "count"] },
        },
      },
    },
    limits: { maxListLimit: 50 },
  },
} as const;
```

Exemptions at the root would apply to both layers; `client` and `application` can only hide more, each for its own callers. Something only the server may see is exposed at the root and hidden under `client`, as here. See [Contract layers](/docs/contract-layers).

## Server side: the application layer

Inject the framework and call it directly. No HTTP, no guard, no limits beyond the application layer's own:

```ts
// src/admin.service.ts
import { Injectable } from "@nestjs/common";
import { InjectFramework } from "@aventara/nest";
import type { AppFramework } from "./aventara.framework.js";

@Injectable()
export class AdminService {
  constructor(@InjectFramework() private readonly framework: AppFramework) {}

  /** Trusted: passwordHash and internalNotes are readable here. */
  async usersWithPrivateFields() {
    return this.framework.application.User.find.many({
      select: ["id", "email", "passwordHash", "internalNotes"],
    });
  }

  /** Mass delete is switched off for remote callers, not for us. */
  async purgeUnpublished() {
    const deleted = await this.framework.application.Post.delete.count({ where: { published: false } });
    return { deleted };
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
{"deleted":2}
```

Server-side calls resolve their data and throw every failure as an `AvError` subclass (`AvValidationError`, `AvNotFoundError`, ...), so a failure reaches Nest as an exception: catch the class where you want another answer ([Server-side usage](/docs/server-side-usage#errors)).

`AdminController` is your own controller, outside `/api`, and nothing protects it by default. Add a Nest guard as you would for any other route. Nest guards do not run on the protocol routes, but they do run on yours.

## Frontend: the client layer

The generated client only knows the client layer's contract:

```ts
import avClient from "./api/AvClient";

const users = await avClient.User.find.many({ select: ["id", "email"] });
// [{ id: 1, email: "ada@example.com" }]

avClient.User.delete.first;     // type error, and undefined at runtime: the operation does not exist for remote callers
avClient.Post.find.many({ limit: 100 });   // rejected: limit exceeds maxListLimit (50)
```

`passwordHash` and `internalNotes` are not in the `User` type, so TypeScript refuses `select: ["passwordHash"]` at compile time; a caller that bypasses the types gets `A2004` back.

## The same call through both layers

`framework.client` runs the client layer's rules in process, with the same exposure, limits and pipelines a remote caller gets. Use it to test or reuse exactly what the frontend sees:

```ts
// the field is not selectable in the client layer's types either, so this needs a cast to compile
await this.framework.client.User.find.many({ select: ["id", "passwordHash" as never] });
// throws AvValidationError: code "A2004",
// cause.issues[0] = { code: "V1008", path: ["arguments","select",1],
//                     message: 'Field "passwordHash" is not selectable.' }
```

| | `framework.application` | `framework.client` | `avClient` over HTTP |
|---|---|---|---|
| Sees `passwordHash` | yes | no | no |
| Sees `internalNotes` | yes | no | no |
| `User.delete.first` | yes | no | no |
| List limit | the application layer's | 50 | 50 |
| Client guard (`requireSignIn`) | not applied | applied (writes need headers) | applied |
| Returns | data, or throws | data, or throws | data, or throws |

Root stages apply to both layers; stages under `client` only to the client layer. Authenticate remote callers there, and keep server-only checks in your Nest code.

## When to use which

- Trusted server code (jobs, admin endpoints, webhooks, seed scripts): `framework.application`.
- Anything a browser or mobile app can reach: the client layer, through the generated client or the HTTP protocol. Make it as narrow as the product needs.
- Server-side rendering on behalf of a user: prefer the client layer so a bug cannot leak what the user may not see.

## See also

- [Example: blog API](/docs/example-blog-api)
- [Contract layers](/docs/contract-layers)
- [Querying: running operations on the server](/docs/querying#running-operations-on-the-server)
- [NestJS host](/docs/nestjs-host#injecting-the-framework)
- Guides: [Exposure](/docs/exposure), [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Authentication and guards](/docs/authentication-and-guards), [Server-side usage](/docs/server-side-usage)
