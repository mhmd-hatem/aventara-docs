"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

const optOutKey = "aventara-analytics-disabled";
let disabledForSession = false;

function beforeSend(event: BeforeSendEvent) {
  const preference = new URLSearchParams(window.location.search).get(
    "analytics",
  );

  // Apply the preference before the first page view, including on a fresh visit.
  if (preference === "off") disabledForSession = true;
  if (preference === "on") disabledForSession = false;

  try {
    if (preference === "off") localStorage.setItem(optOutKey, "1");
    if (preference === "on") localStorage.removeItem(optOutKey);
    if (localStorage.getItem(optOutKey) === "1") return null;
  } catch {
    // Keep the in-memory preference when browser storage is unavailable.
  }

  if (disabledForSession || preference === "off" || preference === "on") {
    return null;
  }

  return event;
}

export function SiteAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
