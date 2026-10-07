/** Deliberately local fixtures for the documentation demos; no Aventara server is called. */
export const sampleUsers = [
  { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
  { id: 2, name: "Grace Hopper", email: "grace@example.com" },
  { id: 3, name: "Alan Turing", email: "alan@research.dev" },
  { id: 4, name: "Margaret Hamilton", email: "margaret@example.com" },
  { id: 5, name: "Katherine Johnson", email: "katherine@research.dev" },
];
export type UserField = keyof (typeof sampleUsers)[number];
export type DemoQuery = {
  filter: string;
  fields: UserField[];
  limit: number;
  order: "asc" | "desc";
};
export const initialQuery: DemoQuery = {
  filter: "example.com",
  fields: ["id", "name", "email"],
  limit: 3,
  order: "asc",
};
export function runDemoQuery(query: DemoQuery) {
  return sampleUsers
    .filter((user) => user.email.includes(query.filter))
    .sort((a, b) => (query.order === "asc" ? a.id - b.id : b.id - a.id))
    .slice(0, query.limit)
    .map((user) =>
      Object.fromEntries(query.fields.map((field) => [field, user[field]])),
    );
}
export function queryCode(query: DemoQuery) {
  return `const users = await avClient.User.find.many({\n${query.filter ? `  where: { email: { contains: ${JSON.stringify(query.filter)} } },\n` : ""}  select: [${query.fields.map((field) => JSON.stringify(field)).join(", ")}],\n  orderBy: { id: "${query.order}" },\n  limit: ${query.limit},\n});`;
}
export function transactionResult(fail: boolean) {
  const before = [{ id: 1, email: "ada@example.com" }];
  return fail
    ? { code: "A2008", committed: false, users: before, posts: [] }
    : {
        code: "A1009",
        committed: true,
        users: [...before, { id: 2, email: "new@example.com" }],
        posts: [{ id: 1, title: "Hello, Aventara", authorId: 2 }],
      };
}
