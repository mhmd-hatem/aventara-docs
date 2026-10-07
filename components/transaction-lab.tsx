"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Database,
  Play,
  RotateCcw,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import { transactionResult } from "@/lib/playground";
import { Button } from "@/components/ui/button";
import {
  DemoCode,
  DemoView,
  type DemoViewValue,
} from "@/components/lab-primitives";
import { SchemaPreview } from "@/components/schema-preview";
import { transactionSchema } from "@/lib/demo-schemas";
export function TransactionLab() {
  const [fail, setFail] = useState(false);
  const [view, setView] = useState<DemoViewValue>("preview");
  const [stage, setStage] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = stage > 0 && stage < 3;
  useEffect(() => () => timer.current.forEach(clearTimeout), []);
  const result = transactionResult(fail);
  function reset() {
    timer.current.forEach(clearTimeout);
    setStage(0);
  }
  function run() {
    reset();
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motionInput === "keyboard"
    ) {
      setStage(3);
      return;
    }
    setStage(1);
    timer.current.push(setTimeout(() => setStage(2), 450));
    timer.current.push(setTimeout(() => setStage(3), 950));
  }
  const code = `const user = avClient.tx.User.create.one({\n  data: { email: "new@example.com" },\n  select: ["id"],\n});\nconst next = avClient.tx.${fail ? 'User.create.one({\n  data: { email: "ada@example.com" }, // already exists' : 'Post.create.one({\n  data: { title: "Hello, Aventara", authorId: user.$ref("id") },'}\n});\nawait avClient.transaction([user, next]);`;
  return (
    <section className="transaction-lab" aria-label="Transaction simulation">
      <div className="lab-intro">
        <div>
          <span className="lab-eyebrow">
            <ShieldCheck size={14} /> ALL OR NOTHING
          </span>
          <h2>
            Watch a transaction <span>{fail ? "roll back." : "commit."}</span>
          </h2>
          <p>One failed step? Every change goes back.</p>
        </div>
        <span className="simulation-badge">
          <span /> Local simulation
        </span>
      </div>
      <div className="demo-frame">
        <DemoView value={view} onChange={setView}>
          {view === "schema" ? (
            <SchemaPreview code={transactionSchema}>
              {fail ? (
                <p>
                  <code>email @unique</code> is the constraint behind this
                  rollback. The sample database already contains{" "}
                  <code>ada@example.com</code>, so the second insert fails.
                </p>
              ) : (
                <p>
                  <code>User.posts</code> and <code>Post.author</code> define
                  the relation. <code>authorId</code> stores the new user’s ID,
                  supplied by <code>user.$ref("id")</code>.
                </p>
              )}
              <p className="schema-hint">
                Both scenarios use the same schema. Only the transaction
                changes.
              </p>
            </SchemaPreview>
          ) : view === "code" ? (
            <DemoCode code={code} />
          ) : (
            <div className="transaction-stage">
              <div className="transaction-operations">
                <div className="scenario-toggle">
                  <button
                    disabled={busy}
                    aria-pressed={!fail}
                    onClick={() => {
                      setFail(false);
                      reset();
                    }}
                  >
                    <Check size={13} /> Successful plan
                  </button>
                  <button
                    disabled={busy}
                    aria-pressed={fail}
                    onClick={() => {
                      setFail(true);
                      reset();
                    }}
                  >
                    <Undo2 size={13} /> Duplicate email
                  </button>
                </div>
                <div
                  className={`transaction-op ${stage >= 1 ? "op-active" : ""}`}
                >
                  <span>1</span>
                  <div>
                    <strong>Create a user</strong>
                    <code>new@example.com</code>
                  </div>
                  {stage >= 1 && <Check size={16} />}
                </div>
                <div className="transaction-connector" />
                <div
                  className={`transaction-op ${stage >= 2 ? "op-active" : ""} ${stage === 3 && fail ? "op-failed" : ""}`}
                >
                  <span>2</span>
                  <div>
                    <strong>
                      {fail ? "Create another user" : "Create their first post"}
                    </strong>
                    <code>
                      {fail
                        ? "ada@example.com · already exists"
                        : 'authorId: user.$ref("id")'}
                    </code>
                  </div>
                  {stage === 3 &&
                    (fail ? <X size={16} /> : <Check size={16} />)}
                </div>
              </div>
              <div
                className={`transaction-database ${stage === 3 && fail ? "database-rollback" : ""}`}
              >
                <div className="panel-label">
                  <Database size={16} /> Sample database
                </div>
                <div className="database-counts">
                  <div>
                    <strong>{stage === 3 ? result.users.length : 1}</strong>
                    <span>Users</span>
                  </div>
                  <div>
                    <strong>{stage === 3 ? result.posts.length : 0}</strong>
                    <span>Posts</span>
                  </div>
                </div>
                <p aria-live="polite">
                  {stage === 3
                    ? fail
                      ? "Rolled back. The database is unchanged."
                      : "Committed. Both records are saved."
                    : "Changes become visible only after commit."}
                </p>
                {stage === 3 && (
                  <span
                    className={`transaction-outcome ${fail ? "outcome-failed" : ""}`}
                  >
                    {fail ? <Undo2 size={13} /> : <Check size={13} />}{" "}
                    {result.code} ·{" "}
                    {fail ? "ConflictError" : "TRANSACTION_COMMITTED"}
                  </span>
                )}
              </div>
            </div>
          )}
        </DemoView>

        <div className="transaction-footer">
          <Button onClick={run} disabled={busy}>
            <Play size={13} />
            {busy ? "Simulating…" : "Run transaction"}
          </Button>
          <button className="reset-demo" onClick={reset}>
            <RotateCcw size={14} /> Reset
          </button>
          <span>Each run starts with the same sample database.</span>
        </div>
      </div>
    </section>
  );
}
