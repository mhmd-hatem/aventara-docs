---
title: "Example: recipes"
description: Short copy-paste recipes for the generated client - a pagination loop, a search box, create with a relation, an optimistic update and a counting badge.
order: 72
section: examples
---

# Example: recipes

Five patterns you will write in most frontends, as React hooks over the generated client. They use the blog schema from [Example: blog API](/docs/example-blog-api) (`User`, `Post`, `Category`) and type-check in a stock Vite `react-ts` project with strict settings. The server calls were run against a real server.

```ts
import { useEffect, useRef, useState } from "react";
import avClient, { AvClient, ConflictError, type Post } from "./api/AvClient";

// A client that sends credentials, for the writes below.
const authed = new AvClient({
  fetch: (input, init) =>
    fetch(input, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${localStorage.getItem("token")}` } }),
});
```

## 1. Pagination

### Page numbers

`limit` and `offset` are the simplest. Fetch the page and the total together:

```ts
const PAGE_SIZE = 5;

async function loadPage(page: number, search = "") {
  const where = { published: true, title: { contains: search } };
  const [rows, total] = await Promise.all([
    avClient.Post.find.many({ where, orderBy: [{ id: "desc" }], limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    avClient.Post.find.count({ where }),
  ]);
  return { rows, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
```

The server caps `limit` at `maxListLimit` (250 by default; `A2009` when exceeded).

### Load more (cursor)

`cursor` needs an explicit `orderBy` that ends in a unique field. The cursor row is **included** in the result, so ask for one extra row and use it as the next cursor:

```ts
export function useInfinitePosts(pageSize = 10) {
  const [posts, setPosts] = useState<readonly Post[]>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);   // undefined: nothing loaded yet
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (loading || next === null) return;
    setLoading(true);
    try {
      const rows = await avClient.Post.find.many({
        where: { published: true },
        orderBy: [{ id: "asc" }],
        limit: pageSize + 1,
        ...(next === undefined ? {} : { cursor: { id: next } }),
      });
      setPosts((prev) => [...prev, ...rows.slice(0, pageSize)]);
      setNext(rows.length > pageSize ? rows[pageSize]!.id : null);   // null: no more pages
    } finally {
      setLoading(false);
    }
  }
  return { posts, loadMore, hasMore: next !== null, loading };
}
```

Over four posts with a page size of two this loads `[1, 2]` then `[3, 4]` and stops. A cursor page is stable while rows are added; an offset page can skip or repeat rows. See [Querying](/docs/querying#pagination).

## 2. Search box

Debounce the input and abort the request it supersedes. Filter on the post title or its author's name in one `where`:

```ts
export function useSearch(term: string) {
  const [results, setResults] = useState<readonly Post[]>([]);
  useEffect(() => {
    if (term.trim() === "") { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      avClient.Post.find
        .many(
          {
            where: {
              published: true,
              OR: [{ title: { contains: term } }, { author: { name: { contains: term } } }],
            },
            limit: 8,
          },
          { signal: controller.signal },
        )
        .then(setResults)
        .catch(() => {});   // an abort rejects; ignore it
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term]);
  return results;
}
```

`contains` is case-sensitive or not depending on your database's collation. Which filter operators a field accepts is part of the contract and can be narrowed ([Configuration](/docs/configuration#restrictions)). `AbortSignal` is covered in [Client options](/docs/client-options#aborting).

## 3. Create with a relation

Link an existing author and find-or-create a category in one call:

```ts
export function createPost(title: string, authorId: number, categoryName: string) {
  return authed.Post.create.one({
    data: {
      title,
      author: { $connect: { id: authorId } },
      category: {
        $connectOrCreate: { where: { name: categoryName }, create: { name: categoryName } },
      },
    },
    include: ["category"],
  });
}
```

Real result:

```json
{ "id": 3, "title": "Related", "published": false, "views": 0, "authorId": 2, "categoryId": 1,
  "createdAt": "2026-10-06T22:44:05.584Z", "body": null, "category": { "id": 1, "name": "Tech" } }
```

Other directives: `$create`, `$connect`, `$disconnect`, `$set`, `$update`, `$delete`, `$upsert`. Creating an author together with a post works the same way from the other side: `data: { email, posts: { $create: { title: "nested" } } }`. When the later step needs a generated id from an earlier one, use a [transaction](/docs/transactions) with `$ref`.

## 4. Optimistic update

Show the change immediately, send it, adopt the server's answer, and roll back on failure. Results are `readonly`, so build new objects:

```ts
export function usePublishToggle(initial: readonly Post[]) {
  const [posts, setPosts] = useState(initial);

  async function toggle(id: number) {
    const before = posts;
    const target = before.find((p) => p.id === id);
    if (!target) return;
    const published = !target.published;

    setPosts(before.map((p) => (p.id === id ? { ...p, published } : p)));   // optimistic
    try {
      const saved = await authed.Post.update.unique({ where: { id }, data: { published } });
      setPosts((cur) => cur.map((p) => (p.id === id ? saved : p)));          // the server's version
    } catch (e) {
      setPosts(before);                                                       // roll back
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  return { posts, toggle };
}
```

For counters, send an increment rather than the new number so two clicks do not overwrite each other:

```ts
await authed.Post.update.unique({ where: { id }, data: { views: { $increment: 1 } }, select: ["id", "views"] });
// { id: 7, views: 1 }
```

A failed call throws a [typed error](/docs/client-errors): `AuthError` when the guard refuses, `NotFoundError` if the row is gone, `TransportError` offline.

## 5. Counting badge

One cheap `count`, refreshed on an interval:

```ts
export function useDraftCount(everyMs = 30_000) {
  const [count, setCount] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const run = () =>
      avClient.Post.find.count({ where: { published: false } })
        .then((n) => alive.current && setCount(n))
        .catch(() => {});
    run();
    const timer = setInterval(run, everyMs);
    return () => { alive.current = false; clearInterval(timer); };
  }, [everyMs]);
  return count;
}
```

```tsx
const drafts = useDraftCount();
return <a href="/drafts">Drafts {drafts !== null && <span className="badge">{drafts}</span>}</a>;
```

Counts per category come back in one request with a `$count` reducer instead of one call each:

```ts
const cats = await avClient.Category.find.many({
  select: ["id", "name", { posts: { select: ["$count"] } }],
});
// [{ id: 1, name: "Tech", posts: { count: 2 } }, ...]
```

## See also

- [Querying](/docs/querying)
- [Typed calls](/docs/typed-calls)
- [Client options](/docs/client-options)
- [Example: blog API](/docs/example-blog-api)
- Guides: [Filtering, sorting and paging](/docs/filtering-sorting-paging), [Relations and nested writes](/docs/relations-and-nested-writes), [Counting](/docs/counting)
