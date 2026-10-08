---
title: Roadmap
description: Where Aventara stands today and what is planned publicly - the path to 1.0, more ORMs and hosts, and how the work is measured.
order: 91
section: about
---

# Roadmap

Aventara is a release candidate (`1.0.0-rc.0`). It works end to end today, and the public API is meant to be the 1.0 API: it changes from here only to fix what testing finds. This page lists what we are aiming at, in the order we expect to get there. It has no dates.

## Today

| Area | Status |
|---|---|
| Server | NestJS 12, Express and Fastify |
| ORM | Prisma 7 (`^7.10.0`), SQLite and PostgreSQL |
| Frontend | Generated typed client, TypeScript `>=5.5` (including 7) |
| Runtime | Node `^22.18.0` or `>=24.2.0` |
| Operations | `find`, `create`, `update`, `delete` (`first`, `unique`, `count`; `many` where the ORM allows it), `upsert`, interactive transactions |

## Toward 1.0

1. Release candidates, then 1.0. Feedback from real projects decides what changes. With a release candidate out, the public API is frozen except for fixes.
2. A stable public API. The configuration, the generated client surface, the protocol and the error codes are the things 1.0 commits to, and the release candidates test them.
3. Protocol header naming. The `Aventara-` prefix of the protocol's headers may change before 1.0; regenerating picks up a change.
4. Clearer failures. Sharper validation and error mapping for the cases that are still rougher than they should be. A required field omitted on create, a `BigInt` out of range and an orphaned required child already answer with specific codes.

## More ORMs and adapters

Each ORM major gets its own adapter package, so a new ORM version never changes the behavior of an existing one. The ORM's vocabulary stays inside its adapter; the contracts you write against stay the same.

- Prisma 8 support as a separate adapter once Prisma 8 is stable.
- Further ORMs and databases, driven by demand.
- Other Prisma 7 drivers beyond SQLite and PostgreSQL as they are measured.

The `aventara` CLI offers whichever adapters exist; a new adapter appears there once it exists.

## More hosts

Hosting is a thin layer over `@aventara/core/protocol`. NestJS on Express and Fastify is first. Others (for example plain Node servers, Hono or Koa) are possible with the same protocol; see [Custom hosts](/docs/custom-host) to write one today.

## Conformance kit

`@aventara/testing` ships fixtures that check an adapter or host against Aventara's public semantics. The plan is to grow it into a kit anyone can run against their own adapter or host, so third-party adapters and hosts can prove they behave the same.

## Benchmarks

Published, reproducible benchmarks of Aventara against hand-written REST, GraphQL and tRPC for the same schema: request cost, payload size, and type-checking cost in the consumer. Until they exist, this documentation makes no performance claims beyond what you can run yourself.

## Say what you need

The release candidate is meant to find out what matters, so tell us what blocks you.

Report framework bugs, documentation problems, and feature requests in the docs repository's GitHub Issues. Tell us what you are building, what blocked you, and what you expected. For bugs, include your Aventara version and a small reproduction if you can.

[Send feedback on GitHub](https://github.com/mhmd-hatem/aventara-docs/issues/new/choose)

## See also

- [Changelog](/docs/changelog), [FAQ](/docs/faq), [License](/docs/license)
