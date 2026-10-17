"use client";

import type { ScreenMap as ScreenMapData } from "@tapscout/shared";
import { useId, useMemo, useState } from "react";
import { ChevronDownIcon, MapIcon } from "@/components/icons";
import { platformShort } from "@/components/ui";
import { layoutScreenMap, MAP_NODE } from "@/lib/report/screen-map-layout";

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
      <div className="bg-grid overflow-x-auto rounded-lg border border-border bg-bg">
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
                  className="overflow-hidden rounded-lg border border-border-strong bg-surface shadow-sm ring-accent/30 transition hover:-translate-y-0.5 hover:border-accent hover:ring-3"
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
                className="line-clamp-2 w-full rounded bg-surface/90 px-1 text-center text-[11px] font-medium leading-tight"
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
  const [shown, setShown] = useState(props.maps[0]?.platform);
  const current = props.maps.find((m) => m.platform === shown) ?? props.maps[0];
  if (!current) return null;
  return (
    <details open className="group/map flex flex-col">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <MapIcon size={15} className="text-muted" /> Screen map
        </span>
        <ChevronDownIcon
          size={15}
          className="text-muted transition-transform group-open/map:rotate-180"
        />
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {props.maps.length > 1 ? (
          <div
            role="tablist"
            aria-label="Screen map platform"
            className="flex w-fit gap-1 rounded-lg border border-border bg-surface-2 p-0.5"
          >
            {props.maps.map((m) => (
              <button
                key={m.platform}
                type="button"
                role="tab"
                aria-selected={m.platform === current.platform}
                onClick={() => setShown(m.platform)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  m.platform === current.platform
                    ? "bg-surface text-text shadow-xs ring-1 ring-border"
                    : "text-muted hover:text-text"
                }`}
              >
                {platformShort(m.platform)}{" "}
                <span className="font-mono opacity-70">{m.map.screens.length}</span>
              </button>
            ))}
          </div>
        ) : null}
        <PlatformMap
          key={current.platform}
          platform={current.platform}
          map={current.map}
          onShowEvidence={props.onShowEvidence}
        />
      </div>
    </details>
  );
}
