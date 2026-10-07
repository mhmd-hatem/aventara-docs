import test from "node:test";
import assert from "node:assert/strict";
import {
  initialQuery,
  queryCode,
  runDemoQuery,
  sampleUsers,
  transactionResult,
} from "../lib/playground.ts";

test("query filters, orders, limits, and returns only selected fields", () => {
  const query = {
    filter: "example.com",
    fields: ["email"],
    limit: 2,
    order: "desc",
  };
  assert.deepEqual(runDemoQuery(query), [
    { email: "margaret@example.com" },
    { email: "grace@example.com" },
  ]);
});
test("a find.many miss returns an empty array", () => {
  assert.deepEqual(
    runDemoQuery({ ...initialQuery, filter: "nobody.invalid" }),
    [],
  );
});
test("query execution never mutates its sample data", () => {
  runDemoQuery({ ...initialQuery, order: "desc" });
  assert.deepEqual(
    sampleUsers.map((user) => user.id),
    [1, 2, 3, 4, 5],
  );
});
test("generated code safely quotes user input and matches selected fields", () => {
  const code = queryCode({
    ...initialQuery,
    filter: '"; alert(1); //',
    fields: ["id"],
  });
  assert.ok(code.includes(JSON.stringify('"; alert(1); //')));
  assert.ok(code.includes('select: ["id"]'));
});
test("commit creates both related records, using the new user identifier", () => {
  const result = transactionResult(false);
  assert.equal(result.code, "A1009");
  assert.equal(result.users.length, 2);
  assert.equal(result.posts[0].authorId, result.users[1].id);
});
test("rollback preserves the starting database, including after an earlier commit", () => {
  transactionResult(false);
  const result = transactionResult(true);
  assert.equal(result.code, "A2008");
  assert.equal(result.committed, false);
  assert.deepEqual(result.users, [{ id: 1, email: "ada@example.com" }]);
  assert.deepEqual(result.posts, []);
});
