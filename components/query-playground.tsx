"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Database,
  FlaskConical,
  LoaderCircle,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/code-block";
import {
  DemoCode,
  DemoView,
  type DemoViewValue,
} from "@/components/lab-primitives";
import { SchemaPreview } from "@/components/schema-preview";
import { userSchema } from "@/lib/demo-schemas";
import {
  initialQuery,
  queryCode,
  runDemoQuery,
  type DemoQuery,
  type UserField,
} from "@/lib/playground";
export function QueryPlayground({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState<DemoQuery>(initialQuery);
  const [executed, setExecuted] = useState<DemoQuery>(initialQuery);
  const [result, setResult] = useState(() => runDemoQuery(initialQuery));
  const [view, setView] = useState<DemoViewValue>("preview");
  const [step, setStep] = useState(-1);
  const [run, setRun] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const id = useId();
  const busy = step >= 0 && step < 4;
  const dirty = JSON.stringify(query) !== JSON.stringify(executed);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function execute() {
    timers.current.forEach(clearTimeout);
    const snapshot = { ...query, fields: [...query.fields] };
    setRun((n) => n + 1);
    const finish = () => {
      setResult(runDemoQuery(snapshot));
      setExecuted(snapshot);
      setStep(4);
    };
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motionInput === "keyboard"
    ) {
      finish();
      return;
    }
    setStep(0);
    [1, 2, 3].forEach((i) =>
      timers.current.push(setTimeout(() => setStep(i), i * 160)),
    );
    timers.current.push(setTimeout(finish, 680));
  }
  function reset() {
    timers.current.forEach(clearTimeout);
    setQuery(initialQuery);
    setExecuted(initialQuery);
    setResult(runDemoQuery(initialQuery));
    setStep(-1);
  }
  function toggle(field: UserField) {
    setQuery((q) => ({
      ...q,
      fields: q.fields.includes(field)
        ? q.fields.length > 1
          ? q.fields.filter((f) => f !== field)
          : q.fields
        : [...q.fields, field],
    }));
  }
  return (
    <section
      className={`query-lab ${compact ? "lab-compact" : ""}`}
      id="playground"
      aria-label="Interactive query playground"
    >
      <div className="lab-intro">
        <div>
          <span className="lab-eyebrow">
            <FlaskConical size={14} /> THE PLAYGROUND
          </span>
          <h2>
            Less imagining. More <span>trying.</span>
          </h2>
          <p>Change the query. Run it. See exactly what comes back.</p>
        </div>
        <span className="simulation-badge">
          <span /> Local simulation
        </span>
      </div>
      <div className="demo-frame">
        <div className="demo-topline">
          <span>
            <span className="resource-cube">
              <Database size={15} />
            </span>
            <strong>User</strong>
            <span className="resource-operation">find.many</span>
          </span>
          <button
            className="reset-demo"
            onClick={reset}
            aria-label="Reset query playground"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
        </div>
        <DemoView value={view} onChange={setView}>
          {view === "schema" ? (
            <SchemaPreview code={userSchema}>
              <p>
                <code>User</code> defines the fields available to this query.{" "}
                <code>name</code> is optional; <code>email</code> must be
                unique.
              </p>
              <div
                className="schema-selection"
                aria-label="Fields selected in the query"
              >
                <span>Your selection</span>
                <div>
                  {query.fields.map((field) => (
                    <code key={field}>{field}</code>
                  ))}
                </div>
              </div>
              <p className="schema-hint">
                Selecting fields changes the response, not the model.
              </p>
            </SchemaPreview>
          ) : view === "preview" ? (
            <div className="query-preview">
              <fieldset className="query-controls" disabled={busy}>
                <legend className="sr-only">Configure sample query</legend>
                <div className="panel-label">
                  <SlidersHorizontal size={14} /> Shape your query
                </div>
                <label className="control-label" htmlFor={`${id}-filter`}>
                  Email contains <span>where</span>
                </label>
                <div className="filter-input">
                  <span>@</span>
                  <input
                    id={`${id}-filter`}
                    value={query.filter}
                    onChange={(e) =>
                      setQuery((q) => ({ ...q, filter: e.target.value }))
                    }
                    placeholder="Any email"
                    spellCheck={false}
                  />
                </div>
                <div className="query-presets" aria-label="Query presets">
                  <button
                    onClick={() => setQuery((q) => ({ ...q, filter: "" }))}
                  >
                    All users
                  </button>
                  <button
                    onClick={() =>
                      setQuery((q) => ({ ...q, filter: "research.dev" }))
                    }
                  >
                    Researchers
                  </button>
                  <button
                    onClick={() =>
                      setQuery((q) => ({ ...q, filter: "nobody.invalid" }))
                    }
                  >
                    No matches
                  </button>
                </div>
                <div className="control-label fields-label">
                  Return fields <span>select</span>
                </div>
                <div className="field-toggles">
                  {(["id", "name", "email"] as UserField[]).map((field) => (
                    <button
                      key={field}
                      type="button"
                      aria-pressed={query.fields.includes(field)}
                      disabled={
                        query.fields.length === 1 &&
                        query.fields.includes(field)
                      }
                      onClick={() => toggle(field)}
                    >
                      <span className="field-check">
                        {query.fields.includes(field) && <Check size={11} />}
                      </span>
                      {field}
                    </button>
                  ))}
                </div>
                <div className="query-limits">
                  <label htmlFor={`${id}-limit`}>
                    Results <span>{query.limit}</span>
                    <input
                      id={`${id}-limit`}
                      aria-label="Result limit"
                      type="range"
                      min={1}
                      max={5}
                      value={query.limit}
                      onChange={(e) =>
                        setQuery((q) => ({
                          ...q,
                          limit: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label htmlFor={`${id}-sort`}>
                    Order
                    <div className="select-wrap">
                      <select
                        id={`${id}-sort`}
                        value={query.order}
                        onChange={(e) =>
                          setQuery((q) => ({
                            ...q,
                            order: e.target.value as "asc" | "desc",
                          }))
                        }
                      >
                        <option value="asc">ID ascending</option>
                        <option value="desc">ID descending</option>
                      </select>
                      <ChevronDown size={12} />
                    </div>
                  </label>
                </div>
                <Button className="run-query" onClick={execute} disabled={busy}>
                  {busy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Play size={14} fill="currentColor" />
                  )}
                  {busy ? "Running query…" : "Run query"}
                  <ArrowRight size={15} />
                </Button>
                <span className="control-footnote">
                  5 sample records. Yours to explore.
                </span>
              </fieldset>
              <div className="query-output" aria-busy={busy}>
                <div className="panel-label">
                  <Table2 size={14} /> Query result
                  <span
                    className={`result-badge ${dirty ? "result-stale" : ""}`}
                    role="status"
                  >
                    {busy
                      ? "Running…"
                      : dirty
                        ? "Run to update"
                        : `${result.length} ${result.length === 1 ? "record" : "records"}`}
                  </span>
                </div>
                <div
                  className={`result-stage ${busy ? "result-loading" : ""}`}
                  key={run}
                >
                  {result.length ? (
                    <div className="result-table-scroll">
                      <table className="result-table">
                        <thead>
                          <tr>
                            {executed.fields.map((field) => (
                              <th key={field}>
                                {field}
                                <span>
                                  {field === "id"
                                    ? "int"
                                    : field === "name"
                                      ? "string?"
                                      : "string"}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.map((row, i) => (
                            <tr
                              key={i}
                              style={{ animationDelay: `${i * 45}ms` }}
                            >
                              {executed.fields.map((field) => (
                                <td key={field}>
                                  {field === "name" ? (
                                    <span className="person">
                                      <span
                                        className={`person-avatar avatar-${i % 3}`}
                                      >
                                        {String(row[field])
                                          .split(" ")
                                          .map((p) => p[0])
                                          .join("")}
                                      </span>
                                      {row[field]}
                                    </span>
                                  ) : field === "id" ? (
                                    <span className="record-id">
                                      {row[field]}
                                    </span>
                                  ) : (
                                    row[field]
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-query">
                      <Database size={26} />
                      <strong>No matching users</strong>
                      <p>
                        A <code>find.many</code> miss returns an empty array.
                      </p>
                      <code>[]</code>
                    </div>
                  )}
                </div>
                <div className="result-explainer">
                  <span className="explain-icon">
                    <Braces size={18} />
                  </span>
                  <div>
                    <strong>Your query shapes your result.</strong>
                    <p>
                      Only the fields you select come back. The generated client
                      knows their types.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="query-code-view">
              <div>
                <div className="panel-label">
                  <Code2 size={14} /> Your generated query
                  <CopyButton value={queryCode(query)} />
                </div>
                <DemoCode code={queryCode(query)} />
              </div>
              <div>
                <div className="panel-label">
                  <Braces size={14} /> Last result{" "}
                  {dirty && (
                    <span className="result-badge result-stale">
                      Run to update
                    </span>
                  )}
                  <CopyButton value={JSON.stringify(result, null, 2)} />
                </div>
                <DemoCode code={JSON.stringify(result, null, 2)} />
              </div>
              <div className="code-run-bar">
                <Button onClick={execute} disabled={busy}>
                  <Play size={13} />
                  {busy ? "Running…" : "Run query"}
                </Button>
              </div>
            </div>
          )}
        </DemoView>

        <div className="request-journey" aria-label="Simulated request stages">
          {["Typed client", "Contract", "Prisma", "Result"].map((label, i) => (
            <span key={label} data-active={step >= i}>
              <span className="journey-dot">
                {step >= i ? <Check size={10} /> : i + 1}
              </span>
              {label}
              {i < 3 && <ArrowRight size={12} />}
            </span>
          ))}
          <span className="journey-status" aria-live="polite">
            {busy
              ? "Following your request…"
              : step === 4
                ? "Simulation complete"
                : "Every layer, in agreement."}
          </span>
        </div>
      </div>
      <p className="simulation-note">
        Runs against sample data in your browser. No server or database
        connection.
      </p>
    </section>
  );
}
