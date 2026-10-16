"use client";

import type { ScreenMap as ScreenMapData } from "@tapscout/shared";
import { useId, useMemo } from "react";
import { layoutScreenMap, MAP_NODE } from "@/lib/report/screen-map-layout";
import { platformShort } from "./ui";

/** One platform's screens and the moves between them (docs/07 C2). */
function PlatformMap(props: {
  platform: "android" | "ios";
  map: ScreenMapData;
  onShowEvidence(platform: string, artifactId: string): void;
}) {
  const layout = useMemo(() => layoutScreenMap(props.map), [props.map]);
  const arrow = useId();
  const taps = props.map.edges.filter((e) => e.type === "tap").length;
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-xs text-muted">
        <span className="font-semibold text-text">{platformShort(props.platform)}</span> ·{" "}
        {layout.screens.length} screens · {taps} observed {taps === 1 ? "tap" : "taps"} between
        them. Solid arrows are taps, dashed ones go back. Select a screen to open its screenshot.
        <span className="sm:hidden"> Swipe sideways to see the whole map.</span>
      </figcaption>
      <div className="overflow-x-auto rounded-xl border border-border bg-bg">
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
          <svg
            aria-hidden="true"
            width={layout.width}
            height={layout.height}
            className="absolute inset-0 text-accent"
          >
            <defs>
              <marker
                id={arrow}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {layout.edges.map((e) => (
              <path
                key={`${e.from}→${e.to}:${e.type}`}
                d={e.path}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeOpacity={e.type === "back" ? 0.45 : 0.8}
                strokeDasharray={e.type === "back" ? "4 4" : undefined}
                markerEnd={`url(#${arrow})`}
              >
                <title>
                  {e.type === "back"
                    ? `Back from ${e.from} to ${e.to}`
                    : `${e.from} → ${e.to}${e.via ? ` (tap "${e.via}")` : ""}`}
                </title>
              </path>
            ))}
          </svg>
          {layout.screens.map((s) => (
            <div
              key={s.label}
              className="absolute flex flex-col items-center gap-1"
              style={{ left: s.x, top: s.y, width: MAP_NODE.width }}
            >
              {s.screenshotArtifactId ? (
                <button
                  type="button"
                  onClick={() =>
                    props.onShowEvidence(props.platform, s.screenshotArtifactId as string)
                  }
                  className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                  style={{ width: MAP_NODE.width, height: MAP_NODE.height }}
                  aria-label={`Screenshot of ${s.label}`}
                >
                  {/* biome-ignore lint/performance/noImgElement: a signed-URL redirect, not a static asset */}
                  <img
                    src={`/api/artifacts/${s.screenshotArtifactId}`}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover object-top"
                  />
                </button>
              ) : (
                <div
                  className="flex items-center justify-center rounded-lg border border-dashed border-border bg-surface p-2 text-center text-xs text-muted"
                  style={{ width: MAP_NODE.width, height: MAP_NODE.height }}
                >
                  No screenshot
                </div>
              )}
              <span
                className="line-clamp-2 w-full text-center text-xs leading-tight"
                title={`${s.label} · visited ${s.visits}×`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

export function ScreenMapSection(props: {
  maps: { platform: "android" | "ios"; map: ScreenMapData }[];
  onShowEvidence(platform: string, artifactId: string): void;
}) {
  if (props.maps.length === 0) return null;
  return (
    <details open className="group flex flex-col gap-2">
      <summary className="cursor-pointer text-sm font-semibold">Screen map</summary>
      <div className="mt-2 flex flex-col gap-4">
        {props.maps.map((m) => (
          <PlatformMap
            key={m.platform}
            platform={m.platform}
            map={m.map}
            onShowEvidence={props.onShowEvidence}
          />
        ))}
      </div>
    </details>
  );
}
