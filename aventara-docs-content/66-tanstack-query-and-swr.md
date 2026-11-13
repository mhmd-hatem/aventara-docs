---
title: TanStack Query and SWR with Next.js
description: Prefetch Aventara data in a Server Component and hydrate it in the browser with TanStack Query or SWR - one shared query module on @/aventara/universal, avDehydrate on the server and avHydrate in the browser.
order: 66
section: hosting
---

# TanStack Query and SWR with Next.js

In a [Next.js app that hosts Aventara](/docs/nextjs-host), a Server Component can fetch the data a Client Component needs, and the Client Component picks it up without a second request. This page shows it with TanStack Query (v5) and with SWR.

Three pieces make it work:

| Piece | From | What it does |
|---|---|---|
| `avClient` | `@/aventara/universal` | The same client on both sides: in process on the server, `fetch` to `/api` in the browser. Same types, same values. |
| `avDehydrate` | `@aventara/next` | On the server: turns each `Date`, `bigint`, `Uint8Array` and decimal into a tagged plain object that React can pass to the browser. |
| `avHydrate` | `@/aventara/client` | In the browser: turns those objects back into `Date`, `bigint`, `Uint8Array` and the client's `AvDecimal`. |

`avDehydrate` is needed because React refuses to pass a class instance from a Server Component to a Client Component, and a decimal is an `AvDecimal` instance. A result with no decimal passes without it, but using the pair everywhere keeps one rule.

The universal client needs `src/instrumentation.ts` to await `ready()`, as the scaffold writes it ([Startup](/docs/nextjs-host#startup-instrumentationts)).

## TanStack Query

```bash
npm install @tanstack/react-query
```

### 1. One query module for both sides

```ts
// src/app/posts/posts.queries.ts
import { queryOptions } from "@tanstack/react-query";
import { avClient } from "@/aventara/universal";

export const postsQuery = queryOptions({
  queryKey: ["posts"],
  queryFn: () =>
    avClient.Post.find.many({
      where: { published: true },
      select: ["id", "title", "publishedAt", "price"],
    }),
  staleTime: 60_000,
});
```

The Server Component prefetches with it and the Client Component reads with it, so the key and the function are written once.

Import `@/aventara/universal` here, not the others. `@/aventara/server` imports `server-only`, so a Client Component that imports this module would fail `next build`. `@/aventara/client` refuses calls on the server, so the prefetch would fail.

### 2. The provider, with `avHydrate`

```tsx
// src/app/providers.tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { avHydrate } from "@/aventara/client";

export function Providers({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { hydrate: { deserializeData: avHydrate } } }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

```tsx
// src/app/layout.tsx
import type { ReactNode } from "react";
import { Providers } from "./providers";

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`defaultOptions.hydrate.deserializeData` runs on every query the client hydrates. To set it on one boundary instead, pass it to `HydrationBoundary`: `options={{ defaultOptions: { deserializeData: avHydrate } }}`. Outside React, `hydrate(queryClient, state, { defaultOptions: { deserializeData: avHydrate } })` does the same.

### 3. Prefetch in a Server Component, dehydrate with `avDehydrate`

```tsx
// src/app/posts/page.tsx
import { avDehydrate } from "@aventara/next";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import { PostList } from "./post-list";
import { postsQuery } from "./posts.queries";

async function Prefetched() {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery(postsQuery);
  return (
    <HydrationBoundary state={dehydrate(queryClient, { serializeData: avDehydrate })}>
      <PostList />
    </HydrationBoundary>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Prefetched />
    </Suspense>
  );
}
```

A new `QueryClient` per request keeps one user's data out of another's. The `<Suspense>` is what `cacheComponents` (create-next-app's default) asks of a page that reads per-request data: every universal call on the server first awaits Next's `io()`, so it runs at request time ([Next.js host](/docs/nextjs-host#server-components-and-server-actions)). The universal client reads the request's headers for `state`, so the data is per request.

### 4. Read it with `useQuery`

```tsx
// src/app/posts/post-list.tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { postsQuery } from "./posts.queries";

export function PostList() {
  const { data } = useQuery(postsQuery);
  return (
    <ul>
      {data?.map((post) => (
        <li key={post.id}>
          {post.title}: {post.publishedAt?.toLocaleDateString()} {post.price?.toString()}
        </li>
      ))}
    </ul>
  );
}
```

The first render uses the prefetched data: `publishedAt` is a `Date` and `price` an `AvDecimal`, as they would be from a browser fetch. A refetch (after `staleTime`, on focus) calls `/api` from the browser and gets the same types.

## A helper that always picks the universal client

If many modules define queries, a small helper keeps them all on `@/aventara/universal`:

```ts
// src/lib/av-query.ts
import { queryOptions } from "@tanstack/react-query";
import { avClient } from "@/aventara/universal";

type Av = typeof avClient;

export function avQuery<T>(queryKey: readonly unknown[], read: (av: Av) => Promise<T>) {
  return queryOptions({ queryKey, queryFn: () => read(avClient) });
}
```

```ts
// src/app/posts/posts.queries.ts
import { avQuery } from "@/lib/av-query";

export const draftsQuery = avQuery(["posts", "drafts"], (av) =>
  av.Post.find.many({ where: { published: false }, select: ["id", "title"] }),
);
```

The result type follows the `select`, as with a direct call. The modules that define queries never import a client themselves, so none of them can pick `@/aventara/server` or `@/aventara/client` by mistake.

## SWR

```bash
npm install swr
```

With SWR, the data crosses as a prop. Type the prop `AvDehydrated<T>` (a type from `@/aventara/client`): on the server `avDehydrate(data)` is an `AvDehydrated<typeof data>`, and in the Client Component `avHydrate(fallback)` is the `T` again, its `Date`, `bigint` and `AvDecimal` values included. Neither side writes a cast, and a plain object, or data of another type, is a compile error on the prop. Name `T` from the read itself, so the server's read and the browser's are one function:

```ts
// src/app/drafts/drafts.queries.ts
import { avClient } from "@/aventara/universal";

export const readDrafts = () =>
  avClient.Post.find.many({ where: { published: false }, select: ["id", "title", "publishedAt"] });
```

```tsx
// src/app/drafts/drafts.tsx
"use client";
import useSWR, { SWRConfig } from "swr";
import { type AvDehydrated, avHydrate } from "@/aventara/client";
import { readDrafts } from "./drafts.queries";

export type DraftsFallback = AvDehydrated<{ drafts: Awaited<ReturnType<typeof readDrafts>> }>;

function DraftList() {
  const { data } = useSWR("drafts", readDrafts);
  return <ul>{data?.map((post) => <li key={post.id}>{post.title}</li>)}</ul>;
}

export function Drafts({ fallback }: { readonly fallback: DraftsFallback }) {
  return (
    <SWRConfig value={{ fallback: avHydrate(fallback) }}>
      <DraftList />
    </SWRConfig>
  );
}
```

```tsx
// src/app/drafts/page.tsx
import { avDehydrate } from "@aventara/next";
import { Suspense } from "react";
import { Drafts } from "./drafts";
import { readDrafts } from "./drafts.queries";

async function Prefetched() {
  return <Drafts fallback={avDehydrate({ drafts: await readDrafts() })} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Prefetched />
    </Suspense>
  );
}
```

The `fallback` key (`"drafts"`) is the `useSWR` key. Pass `avHydrate(fallback)` to `SWRConfig`, never `fallback` itself: SWR's `fallback` is typed `any`, so the compiler cannot catch that mistake.

Read the data you dehydrate through `@/aventara/universal`, as `readDrafts` does. `@/aventara/server` types a decimal as core's `AvDecimal`, while `avHydrate` revives it as the browser client's, so data read through `@/aventara/server` does not match the type the browser gets back.

## Mistakes to avoid

| Mistake | What happens |
|---|---|
| The query module imports `@/aventara/client` | The server prefetch is refused: `avClient from @/aventara/client runs in the browser only, ...` |
| The query module imports `@/aventara/server` | `next build` fails: a Client Component imports a `server-only` module. |
| No `instrumentation.ts` awaiting `ready()` | The universal call on the server is refused, naming `instrumentation.ts` and `ready()`. |
| `dehydrate` without `serializeData: avDehydrate` | React refuses to pass a decimal from the Server Component. |
| No `deserializeData: avHydrate` in the browser | The query's data holds tagged objects (`{ "$av": "datetime", "v": "..." }`) instead of a `Date`. |
| `SWRConfig value={{ fallback }}` with the dehydrated prop instead of `avHydrate(fallback)` | SWR's data holds tagged objects. SWR's `fallback` is typed `any`, so it compiles. |
| One `QueryClient` shared by every request on the server | One user's prefetched data can reach another. Make one per request. |

## See also

- [Next.js host](/docs/nextjs-host): the three clients and when to use each.
- [Next.js API reference](/docs/next-api-reference#avdehydrate): `avDehydrate` and `avHydrate`.
- [Enums and scalar types](/docs/enums-and-scalars): the value types.
