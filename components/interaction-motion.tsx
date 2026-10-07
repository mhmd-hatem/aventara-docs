"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type Ripple = {
  id: number;
  pointerId: number;
  left: number;
  top: number;
  width: number;
  height: number;
  radius: string;
  color: string;
  x: number;
  y: number;
  diameter: number;
};

const pressables = [
  "button",
  "summary",
  "a.button",
  "a.nav-link",
  ".header-nav a",
  "a.discovery-card",
  "a.sidebar-playground",
  "a.hero-play-link",
  ".page-pagination a",
  ".search-results a",
].join(",");

/** One decorative layer covers owned controls, including Radix portal content.
 * It never changes a control's DOM, focus, activation, or pointer handling. */
export function InteractionMotion() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const sequence = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const clear = () => {
      timeouts.forEach(clearTimeout);
      timeouts.clear();
      setRipples((current) => (current.length ? [] : current));
    };
    const pointer = (event: PointerEvent) => {
      root.dataset.motionInput = "pointer";
      if (reduced.matches || event.button !== 0 || !event.isPrimary) return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(pressables)
          : null;
      if (
        !target ||
        target.matches(":disabled, [aria-disabled='true']") ||
        target.closest("[data-no-ripple]")
      )
        return;

      const bounds = target.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const styles = getComputedStyle(target);
      const id = ++sequence.current;
      const ripple: Ripple = {
        id,
        pointerId: event.pointerId,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        radius: styles.borderRadius,
        color: styles.color,
        x,
        y,
        diameter: Math.min(
          Math.hypot(
            Math.max(x, bounds.width - x),
            Math.max(y, bounds.height - y),
          ) * 2,
          Math.min(bounds.width, bounds.height) * 3,
        ),
      };
      setRipples((current) => [...current.slice(-7), ripple]);
      // Also clean up when a background tab suppresses animationend.
      const timeout = setTimeout(() => {
        setRipples((current) => current.filter((item) => item.id !== id));
        timeouts.delete(timeout);
      }, 650);
      timeouts.add(timeout);
    };
    const keyboard = () => {
      root.dataset.motionInput = "keyboard";
      clear();
    };
    // Moving the mouse after typing must restore hover transitions, even before a click.
    const pointerMove = (event: PointerEvent) => {
      if (
        event.pointerType === "mouse" &&
        root.dataset.motionInput === "keyboard"
      ) {
        root.dataset.motionInput = "pointer";
      }
    };
    const cancel = (event: PointerEvent) =>
      setRipples((current) =>
        current.filter((item) => item.pointerId !== event.pointerId),
      );
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("pointermove", pointerMove, { passive: true });
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    reduced.addEventListener("change", clear);
    return () => {
      timeouts.forEach(clearTimeout);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("pointermove", pointerMove);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
      reduced.removeEventListener("change", clear);
      delete root.dataset.motionInput;
    };
  }, []);

  if (!ripples.length) return null;
  return createPortal(
    <div className="interaction-layer" aria-hidden="true">
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="ripple-clip"
          style={
            {
              left: ripple.left,
              top: ripple.top,
              width: ripple.width,
              height: ripple.height,
              borderRadius: ripple.radius,
              color: ripple.color,
              "--ripple-x": `${ripple.x}px`,
              "--ripple-y": `${ripple.y}px`,
              "--ripple-size": `${ripple.diameter}px`,
            } as CSSProperties
          }
        >
          <span
            className="click-ripple"
            onAnimationEnd={() =>
              setRipples((current) =>
                current.filter((item) => item.id !== ripple.id),
              )
            }
          />
        </span>
      ))}
    </div>,
    document.body,
  );
}
