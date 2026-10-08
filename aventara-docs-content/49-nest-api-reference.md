---
title: NestJS API reference
description: AventaraModule.forRoot and forRootAsync, AventaraModuleOptions and AsyncOptions, the AVENTARA_FRAMEWORK token, @InjectFramework, startup errors and platform limits.
order: 86
section: reference
---

# NestJS API reference

`@aventara/nest` hosts an Aventara `Framework` in a NestJS 12 application. It mounts the framework's HTTP protocol on Nest's HTTP platform (Express or Fastify) and puts the `Framework` into dependency injection. It adds no framework semantics of its own. Requires `@nestjs/common` and `@nestjs/core` `^12.0.0`; `@aventara/core` is its one dependency. For a guided tour see [NestJS host](/docs/nestjs-host).

Everything exported:

```ts
import {
  AventaraModule,
  AVENTARA_FRAMEWORK,
  InjectFramework,
  type AventaraModuleOptions,
  type AventaraModuleAsyncOptions,
} from "@aventara/nest";
```

## AventaraModule

A global module you import once in your root module. The protocol routes are registered from its `configure()`, after your `app.use(...)` / `enableCors()` and before `MiddlewareConsumer` middleware and controllers.

```ts
class AventaraModule {
  static forRoot<M, Cfg>(options: AventaraModuleOptions<M, Cfg>): DynamicModule;
  static forRootAsync<M, Cfg>(options: AventaraModuleAsyncOptions<M, Cfg>): DynamicModule;
}
```

### AventaraModuleOptions

Exactly one of two arms; giving both or neither is a type error and, if it slips through at runtime, a startup error.

```ts
type AventaraModuleOptions<M, Cfg> =
  | { readonly framework: Framework; readonly config?: never }
  | { readonly config: Cfg & FrameworkConfig<M, Cfg>; readonly framework?: never };
```

| Arm | Type | Use when |
|---|---|---|
| `framework` | `Framework` | You called `createFramework(config)` yourself and want your own typed `Framework<M, Cfg>` in code. |
| `config` | `FrameworkConfig<M, Cfg>` | The module calls `createFramework(config)` for you. Typed exactly like `createFramework`'s parameter: an annotated `FrameworkConfig<M>`, an inline literal, an inferred constant and a `satisfies` check are all accepted and checked against your adapter's model. |

### forRoot

Static options, for a framework or configuration that exists when the module is declared.

```ts
// the module builds the framework from a config
AventaraModule.forRoot({ config: { entrypoint: "/api", adapter } })

// you built it
const framework = await createFramework({ entrypoint: "/api", adapter });
AventaraModule.forRoot({ framework })
```

### forRootAsync

For when what builds the framework (a Prisma client, a configuration service) is itself a provider.

```ts
type AventaraModuleAsyncOptions<M, Cfg> = {
  readonly imports?: ModuleMetadata["imports"];
  readonly inject?: FactoryProvider["inject"];
  readonly useFactory: (...deps: never[]) => AventaraModuleOptions<M, Cfg> | Promise<AventaraModuleOptions<M, Cfg>>;
};
```

| Option | Type | Meaning |
|---|---|---|
| `imports` | Nest module imports | Modules whose providers the factory needs (for example `PrismaModule`). |
| `inject` | Nest injection tokens | Providers passed to the factory, in order. |
| `useFactory` | `(...deps) => options \| Promise<options>` | Resolves to either arm of `AventaraModuleOptions`. |

The shape `aventara init` writes (this is the code that runs in the verified scaffold):

```ts
AventaraModule.forRootAsync({
  imports: [PrismaModule],
  inject: [PrismaService],
  useFactory: async (prisma: PrismaService) => ({
    config: await aventaraConfig(prisma),
  }),
}),
```

## Injecting the framework

| Export | Kind | Meaning |
|---|---|---|
| `AVENTARA_FRAMEWORK` | `unique symbol` | The DI token under which the module provides the `Framework`. |
| `InjectFramework()` | `() => ParameterDecorator` | `@Inject(AVENTARA_FRAMEWORK)` in one call. |

DI carries no type argument, so type the parameter with your own alias:

```ts
// src/aventara.config.ts
export type AppFramework = Awaited<ReturnType<typeof buildFramework>>;

// src/stats.service.ts
@Injectable()
export class StatsService {
  constructor(@InjectFramework() private readonly framework: AppFramework) {}

  async userCount() {
    const res = await this.framework.application.User.find.count({});
    return res.data;
  }
}
```

`framework.application.*` and `framework.client.*` return the envelope `{ data, code, cause }` and do not throw for operation failures; see [Querying](/docs/querying#running-operations-on-the-server).

## What the module mounts

One route per advertised operation (`POST <entrypoint>/_resources/<Resource>/<family>/<variant>`), `GET <entrypoint>/_contract`, `POST <entrypoint>/_transactions` only when the client contract advertises `interactive`, and an absence handler for the rest of `<entrypoint>/_*`. It logs one line through Nest's `Logger` (context `AventaraModule`; silenced by `logger: false`), verified:

```text
[Nest] LOG [AventaraModule] Aventara mounted 45 operations at /api (+ GET /api/_contract, POST /api/_transactions)
```

`FrameworkConfig.entrypoint` alone decides where it is mounted; `app.setGlobalPrefix(...)` does not move it.

## Startup errors

All reject while Nest builds the application, before it listens:

| Condition | Message |
|---|---|
| both arms given | AventaraModule: the options carry both `framework` and `config`; pass exactly one. |
| neither given | AventaraModule: the options carry neither `framework` nor `config`; pass exactly one. |
| `framework` is not a Framework | AventaraModule: `framework` is not an Aventara Framework (it has no string `entrypoint` and no `contracts.client`); pass what `createFramework` resolved to. |
| mounted twice in one application | refused |
| platform other than Express or Fastify (or none, as with `createApplicationContext`) | AventaraModule mounts the protocol on Nest's Express or Fastify platform; this application's platform is `none`. |
| invalid configuration | the `FrameworkConstructionError` propagates unchanged; see [Startup diagnostics](/docs/config-reference#startup-diagnostics) |

Nest's default `abortOnError: true` exits the process on a bootstrap error; pass `abortOnError: false` to `NestFactory.create` to catch it. The module owns no resource to shut down; your Prisma provider closes its own client in `onModuleDestroy` (with `app.enableShutdownHooks()` for signals).

`Test.createTestingModule({ imports: [AppModule] }).compile()` works: providers are built before any HTTP platform exists, and the module waits for the one `createNestApplication()` supplies.

## What runs on a protocol route

| | Express | Fastify |
|---|---|---|
| Your `app.use(...)` middleware, `enableCors()`, helmet | runs | runs |
| Nest guards, interceptors, pipes (global or not) | never | never |
| `MiddlewareConsumer` middleware | never | runs (Fastify runs Nest middleware before routing); add `.exclude("api/_*path")` for your entrypoint to keep it off |
| A controller of yours at `<entrypoint>/_contract` or any `_` path | never reached | the application does not start |
| A controller at `<entrypoint>/health` (outside `_`) | reached | reached |

Authentication and authorization belong in Aventara [pipelines](/docs/config-reference#pipelines), which read `transport.headers` (lower-cased names, repeats joined). A Passport strategy run as Nest middleware sets `req.user`, which a pipeline cannot see.

## Requests

- Bodies are read raw, never through Nest's body parser, up to `limits.maxRequestBytes`. Your own routes keep Nest's parsed `req.body`; no `NestFactory.create` option is needed.
- `Content-Encoding`: `gzip`, `deflate` and `br` are inflated and the limit counts decoded bytes. Other codings answer `415 A2011`; a body that does not decode answers `400 A2000`. These two answers carry a newly minted `Aventara-Request-Id`.
- Request id: the client's `Aventara-Request-Id` when it is 1-128 visible characters; anything else (empty, spaces, over 128) is silently replaced by a generated UUID. See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics). `X-Request-Id` is never copied into it; set `Aventara-Request-Id` at your proxy.
- Query strings are ignored by the protocol.

## Platform differences

- Fastify cannot mount a Resource key that needs `*` or a reserved character (`: + # $ & , / ; = ? @`) in its route path, or an entrypoint containing `*`: the application refuses to start with a message naming it. Rename it, or host on Express.
- Express routing is case-insensitive by default, so `/API/_contract` also answers; Fastify's is not. That is Express's own `case sensitive routing` setting.
- Express answers `500 A3000` to a protocol route requested with a percent-encoding a generated client never sends (for example `%6Eotes` for `notes`); Fastify executes it. A known divergence.
- Express adds its `X-Powered-By` header; `app.disable("x-powered-by")` removes it.

## See also

- [NestJS host](/docs/nestjs-host), [Configuration reference](/docs/config-reference)
- [Protocol API reference](/docs/protocol-api-reference): hosting without Nest.
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Deploying](/docs/deploying), [Server-side usage](/docs/server-side-usage)
