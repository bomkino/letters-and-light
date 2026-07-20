/** Evidence drawer: the annotated proof. Gate-by-gate traces, exclusions,
 *  caveats, missing validation, determinism fingerprints. Pulls forward like
 *  a proof sheet; nothing here is decoration. */

import { useId } from "react";

import { copy, type DirectionCard } from "@core/index.js";

import { systemById } from "../wiring/catalog";
import { validationLabel } from "../wiring/labels";

const GATE_LABELS: Record<string, string> = {
  G0: "Eligibility",
  G1: "Mandatory family",
  G2: "Writing systems",
  G3: "Licence & files",
  G4: "Application",
  G5: "Handoff",
  G6: "Density",
  G7: "Data & numerals",
  G8: "Viewing",
};

export const EvidenceDrawer = ({ direction }: { direction: DirectionCard }) => {
  const id = useId();
  const type = direction.type;
  const palette = direction.colour?.systems.find((system) => system.id === direction.selected.paletteSystemId) ?? null;

  return (
    <details className="drawer" aria-describedby={`${id}-hint`}>
      <summary id={`${id}-hint`}>{copy.result.evidenceLabel}</summary>
      <div className="drawer-body">
        <h3 style={{ fontSize: "1.05rem" }}>Type gates, in order</h3>
        <p style={{ fontSize: "0.86rem", color: "var(--graphite)", marginTop: "0.3rem" }}>
          Ordered hard gates decide what survives. Caveats stay visible; removals name their gate.
        </p>
        {type.recommendations.length > 0 ? (
          type.recommendations.map((item) => (
            <div key={item.systemId} style={{ marginTop: "1rem" }}>
              <h4 style={{ fontSize: "0.95rem" }}>
                {item.name} <span className="status-tag status-tag--candidate">{item.status}</span>
              </h4>
              <table className="trace-table">
                <thead>
                  <tr>
                    <th scope="col">Gate</th>
                    <th scope="col">Result</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(type.trace[item.systemId] ?? []).map((gate) => (
                    <tr key={`${item.systemId}-${gate.gate}`}>
                      <td>
                        {gate.gate} · {GATE_LABELS[gate.gate] ?? gate.gate}
                      </td>
                      <td>{gate.result}</td>
                      <td>{gate.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(() => {
                const record = systemById(item.systemId);
                return record && record.requiredValidation.length > 0 ? (
                  <p style={{ fontSize: "0.82rem", color: "var(--caution)", marginTop: "0.4rem" }}>
                    Still owed before production: {record.requiredValidation.map((key) => `${validationLabel(key)} (${key})`).join(", ")}.
                  </p>
                ) : null;
              })()}
            </div>
          ))
        ) : (
          <p style={{ marginTop: "0.6rem" }}>No surviving system carries a trace this time.</p>
        )}

        {type.exclusions.length > 0 ? (
          <>
            <h3 style={{ fontSize: "1.05rem", marginTop: "1.6rem" }}>Removed, and where</h3>
            <table className="trace-table">
              <thead>
                <tr>
                  <th scope="col">System</th>
                  <th scope="col">Gate</th>
                  <th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {type.exclusions.map((exclusion) => (
                  <tr key={exclusion.systemId}>
                    <td>{systemById(exclusion.systemId)?.name ?? exclusion.systemId}</td>
                    <td>
                      {exclusion.atGate} · {GATE_LABELS[exclusion.atGate] ?? exclusion.atGate}
                    </td>
                    <td>{exclusion.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {palette ? (
          <>
            <h3 style={{ fontSize: "1.05rem", marginTop: "1.6rem" }}>Color determinism</h3>
            <table className="trace-table">
              <tbody>
                <tr>
                  <th scope="row">Engine</th>
                  <td>{palette.determinism.engineVersion}</td>
                </tr>
                <tr>
                  <th scope="row">Working-pixel fingerprint</th>
                  <td>
                    <code>{palette.determinism.workingPixelHash}</code>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Crop</th>
                  <td>
                    x {palette.determinism.crop.x.toFixed(3)}, y {palette.determinism.crop.y.toFixed(3)}, w{" "}
                    {palette.determinism.crop.width.toFixed(3)}, h {palette.determinism.crop.height.toFixed(3)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Capabilities</th>
                  <td>{palette.determinism.capabilities.join(", ")}</td>
                </tr>
              </tbody>
            </table>
          </>
        ) : null}

        <h3 style={{ fontSize: "1.05rem", marginTop: "1.6rem" }}>Truth and limits</h3>
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
          {direction.truth.claims.map((claim) => (
            <li key={claim}>{claim}</li>
          ))}
          {direction.truth.limits.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </div>
    </details>
  );
};
