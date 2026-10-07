"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  Code2,
  Database,
  Radio,
  Settings2,
} from "lucide-react";
import { Logo } from "@/components/logo";

const phases = [
  {
    label: "Compile",
    detail:
      "Your Prisma schema and Aventara configuration compile into contracts. The NestJS host uses those contracts to serve the API.",
  },
  {
    label: "Generate",
    detail:
      "avclient generate reads GET /api/_contract from the host and writes a typed AvClient for your frontend.",
  },
  {
    label: "Request",
    detail:
      "avClient.User.find.many(...) sends an HTTP POST to /api/_resources/User/find/many. The host validates and executes the operation.",
  },
];

export function ProtocolFlow() {
  const [phase, setPhase] = useState(0);
  return (
    <figure
      className="protocol-flow"
      data-phase={phase}
      aria-label="From schema to a typed HTTP request"
    >
      <div className="protocol-heading">
        <span>THE ROUND TRIP</span>
        <span>ONE CONTRACT. BOTH SIDES.</span>
      </div>
      <div className="protocol-art">
        <div className="protocol-inputs">
          <span>
            <Database size={15} />
            <code>schema.prisma</code>
          </span>
          <span className="protocol-plus">+</span>
          <span>
            <Settings2 size={15} />
            <code>aventara.config.ts</code>
          </span>
        </div>
        <div className="protocol-compile" data-lit={phase === 0}>
          <span className="protocol-wire" />
          <div className="protocol-seal">
            <Logo icon />
            <span>COMPILE</span>
          </div>
          <span className="protocol-wire" />
          <div className="protocol-contract">
            <Braces size={16} />
            <strong>Contracts</strong>
            <span>Resources · fields · operations</span>
          </div>
          <svg
            className="protocol-feed"
            viewBox="0 0 400 36"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M200 0 V8 Q200 17 190 17 H104 Q94 17 94 26 V34 M90 29 L94 34 L98 29" />
          </svg>
        </div>
        <div className="protocol-endpoints">
          <div
            className="protocol-endpoint protocol-host"
            data-lit={phase !== 1}
          >
            <span className="protocol-node-label">01 / SERVER</span>
            <div className="protocol-node-title">
              <Radio size={20} />
              <strong>NestJS host</strong>
            </div>
            <span>Serves your contract & HTTP API</span>
            <code>
              <span>POST</span> /api/_resources/
              <br />
              User/find/many
            </code>
          </div>
          <div className="protocol-bridge" aria-hidden="true">
            <span data-lit={phase === 1}>
              <ArrowRight size={22} />
            </span>
            <span className="protocol-bridge-dot" />
            <span data-lit={phase === 2}>
              <ArrowLeft size={22} />
            </span>
          </div>
          <div
            className="protocol-endpoint protocol-client"
            data-lit={phase !== 0}
          >
            <span className="protocol-node-label">02 / FRONTEND</span>
            <div className="protocol-node-title">
              <Code2 size={20} />
              <strong>Typed AvClient</strong>
            </div>
            <span>Generated from the deployed contract</span>
            <code>
              avClient.User
              <br />
              .find.many(...)
            </code>
          </div>
        </div>
        <div className="protocol-routes">
          <div data-lit={phase === 1}>
            <ArrowRight size={16} />
            <span>
              <code>GET /api/_contract</code>
              <small>avclient generate → typed client</small>
            </span>
          </div>
          <div data-lit={phase === 2}>
            <ArrowLeft size={16} />
            <span>
              <code>HTTP request</code>
              <small>client → host → result</small>
            </span>
          </div>
        </div>
      </div>
      <figcaption className="protocol-caption">
        <div
          className="protocol-controls"
          aria-label="Explore the request flow"
        >
          {phases.map(({ label }, i) => (
            <button
              type="button"
              key={label}
              aria-pressed={phase === i}
              onClick={() => setPhase(i)}
            >
              <span>0{i + 1}</span>
              {label}
            </button>
          ))}
        </div>
        <p aria-live="polite">{phases[phase].detail}</p>
      </figcaption>
    </figure>
  );
}
