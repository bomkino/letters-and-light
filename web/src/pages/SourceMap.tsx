/** Source map: what the image actually gave us. Spatial provenance computed
 *  in this browser from the working pixels (centroid + bounds per cluster),
 *  with a real text/table alternative. Dominant fields, small details,
 *  protected selections, merged duplicates — inspectable, never decorative. */

import { useEffect, useRef, useState } from "react";

import { copy } from "@core/index.js";

import type { SourceSession } from "../app/store";
import { roleLabels } from "../wiring/catalog";

export const SourceMap = ({ source }: { source: SourceSession }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "table">("map");
  const analysis = source.analysis;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis) return;
    canvas.width = source.workingWidth;
    canvas.height = source.workingHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.putImageData(new ImageData(new Uint8ClampedArray(source.rgba), source.workingWidth, source.workingHeight), 0, 0);
    // Crop frame
    context.strokeStyle = "#2b4ad8";
    context.lineWidth = Math.max(2, source.workingWidth / 400);
    context.strokeRect(
      source.crop.x * source.workingWidth,
      source.crop.y * source.workingHeight,
      source.crop.width * source.workingWidth,
      source.crop.height * source.workingHeight,
    );
    // Cluster centroids + bounds: graphite registration marks, not confetti.
    for (const cluster of analysis.spatial) {
      const cx = cluster.centroid.x * source.workingWidth;
      const cy = cluster.centroid.y * source.workingHeight;
      const active = hovered === null || hovered === cluster.clusterId;
      context.globalAlpha = active ? 1 : 0.25;
      context.fillStyle = cluster.hex;
      context.strokeStyle = "#232327";
      context.lineWidth = Math.max(1.5, source.workingWidth / 600);
      const radius = Math.max(6, source.workingWidth / 64) * (cluster.protected ? 1.4 : 1);
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.globalAlpha = 1;
    }
  }, [analysis, hovered, source]);

  if (!analysis) return null;

  const spatial = analysis.spatial;
  const dominant = spatial.filter((cluster) => cluster.population >= 0.12);
  const details = spatial.filter((cluster) => cluster.population < 0.12);

  return (
    <section className="section" aria-labelledby="sourcemap-h">
      <div className="section-head">
        <h2 id="sourcemap-h">{copy.source.sourceMap}</h2>
        <span className="eyebrow">computed in this browser · nothing uploaded</span>
      </div>
      <p style={{ color: "var(--graphite)" }}>{copy.source.sourceMapHint}</p>
      <p style={{ marginTop: "0.5rem", fontFamily: "var(--mono)", fontSize: "0.74rem", color: "var(--graphite-faint)" }}>
        Working-pixel SHA-256: <code>{analysis.workingPixelHash}</code>
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.9rem" }} role="tablist" aria-label="Source map views">
        <button type="button" role="tab" aria-selected={view === "map"} className="btn" onClick={() => setView("map")}>
          Spatial map
        </button>
        <button type="button" role="tab" aria-selected={view === "table"} className="btn" onClick={() => setView("table")}>
          Text table
        </button>
      </div>

      {view === "map" ? (
        <div className="source-map-grid" style={{ marginTop: "1rem" }}>
          <div className="source-canvas-wrap" style={{ touchAction: "auto" }}>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Working image with ${spatial.length} cluster markers. ${dominant.length} dominant fields and ${details.length} smaller details were found. Switch to the text table for the same information.`}
            />
          </div>
          <ul className="cluster-list" aria-label="Color clusters with their jobs">
            {spatial.map((cluster) => (
              <li key={cluster.clusterId}>
                <button
                  type="button"
                  className="cluster-row"
                  style={{ width: "100%", textAlign: "left", cursor: "default" }}
                  onMouseEnter={() => setHovered(cluster.clusterId)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(cluster.clusterId)}
                  onBlur={() => setHovered(null)}
                >
                  <span className="cluster-swatch" style={{ background: cluster.hex }} aria-hidden="true" />
                  <span>
                    <code>{cluster.hex}</code>{" "}
                    <span style={{ fontSize: "0.78rem", color: "var(--graphite)" }}>
                      {(cluster.population * 100).toFixed(1)}% · {cluster.population >= 0.12 ? "dominant field" : "small detail"}
                      {cluster.protected ? " · protected" : ""}
                      {cluster.usedByRoles.length > 0
                        ? ` · feeds ${cluster.usedByRoles.map((role) => roleLabels[role]?.label ?? role).join(", ")}`
                        : " · no role claimed it"}
                    </span>
                    <span className="cluster-pop" aria-hidden="true">
                      <i style={{ width: `${Math.max(2, cluster.population * 100)}%` }} />
                    </span>
                  </span>
                  <span className="role-meta">
                    {(cluster.centroid.x * 100).toFixed(0)}%, {(cluster.centroid.y * 100).toFixed(0)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "1rem" }}>
          <table className="trace-table">
            <caption className="visually-hidden">Source clusters as text</caption>
            <thead>
              <tr>
                <th scope="col">Color</th>
                <th scope="col">Share</th>
                <th scope="col">Kind</th>
                <th scope="col">Protected</th>
                <th scope="col">Feeds roles</th>
                <th scope="col">Where it lives</th>
              </tr>
            </thead>
            <tbody>
              {spatial.map((cluster) => (
                <tr key={cluster.clusterId}>
                  <td>
                    <span className="cluster-swatch" style={{ background: cluster.hex, display: "inline-block", width: "1rem", height: "1rem", verticalAlign: "-0.15rem" }} aria-hidden="true" />{" "}
                    <code>{cluster.hex}</code>
                  </td>
                  <td>{(cluster.population * 100).toFixed(1)}%</td>
                  <td>{cluster.population >= 0.12 ? "dominant field" : "small detail"}</td>
                  <td>{cluster.protected ? "yes" : "no"}</td>
                  <td>{cluster.usedByRoles.length > 0 ? cluster.usedByRoles.map((role) => roleLabels[role]?.label ?? role).join(", ") : "none"}</td>
                  <td>
                    centered {(cluster.centroid.x * 100).toFixed(0)}% across, {(cluster.centroid.y * 100).toFixed(0)}% down
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
