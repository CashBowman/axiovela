import { researchKinds } from "../shared/research-outline.mjs";
import MarkdownPreview from "./MarkdownPreview.jsx";
import { AnnotatedContent } from "./WorkspaceFeedback.jsx";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from "d3-force";
const colors = {
  project: "#497e85",
  paper: "#4d7898",
  web: "#668878",
  claim: "#b48b43",
  hypothesis: "#a48651",
  question: "#4d7898",
  assumption: "#86745c",
  decision: "#497e85",
  limitation: "#9b6e6a",
  result: "#668878",
  experiment: "#8a789d",
  method: "#497e85",
  argument: "#95627b",
};
function NodeShape({ kind, r = 12, ...props }) {
  if (kind === "hypothesis") return <ellipse rx={r} ry={r * 0.65} {...props} />;
  if (kind === "question")
    return (
      <g>
        <circle r={r} {...props} />
        <text
          textAnchor="middle"
          y={r * 0.42}
          style={{ fill: "white", fontSize: r * 1.4, fontWeight: 700 }}
        >
          ?
        </text>
      </g>
    );
  if (kind === "assumption")
    return (
      <polygon
        points={`${-r},${-r * 0.65} ${r},${-r * 0.65} ${r * 0.6},${r * 0.65} ${-r * 0.6},${r * 0.65}`}
        {...props}
      />
    );
  if (kind === "decision")
    return (
      <polygon
        points={`${-r * 0.65},${-r} ${r * 0.65},${-r} ${r},${-r * 0.65} ${r},${r * 0.65} ${r * 0.65},${r} ${-r * 0.65},${r} ${-r},${r * 0.65} ${-r},${-r * 0.65}`}
        {...props}
      />
    );
  if (kind === "limitation")
    return (
      <g>
        <polygon points={`0,${-r} ${r},${r} ${-r},${r}`} {...props} />
        <text
          textAnchor="middle"
          y={r * 0.7}
          style={{ fill: "white", fontSize: r * 1.4, fontWeight: 700 }}
        >
          !
        </text>
      </g>
    );
  if (kind === "claim")
    return <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} {...props} />;
  if (kind === "method")
    return (
      <polygon
        points={`${-r},0 ${-r / 2},${-r} ${r / 2},${-r} ${r},0 ${r / 2},${r} ${-r / 2},${r}`}
        {...props}
      />
    );
  if (kind === "experiment")
    return <polygon points={`0,${-r} ${r},${r} ${-r},${r}`} {...props} />;
  if (kind === "argument")
    return (
      <polygon
        points={`${-r},${-r * 0.8} ${r * 0.55},${-r * 0.8} ${r},0 ${r * 0.55},${r * 0.8} ${-r},${r * 0.8} ${-r * 0.55},0`}
        {...props}
      />
    );
  if (kind === "result" || kind === "web")
    return (
      <rect
        x={-r}
        y={-r * 0.8}
        width={2 * r}
        height={r * 1.6}
        rx={kind === "web" ? 5 : 0}
        {...props}
      />
    );
  return <circle r={r} {...props} />;
}
export default function ConnectionsGraph({
  items,
  links,
  selected,
  onSelect,
  onAsk,
  context,
  catalog = false,
  edgeActions,
}) {
  const arrowId = useId();
  const DetailSurface = catalog ? "div" : AnnotatedContent;
  const root = useRef(),
    drag = useRef();
  const [size, setSize] = useState({ width: 600, height: 500 }),
    [view, setView] = useState({ x: 0, y: 0, k: 1 }),
    [hover, setHover] = useState(""),
    [edgeId, setEdgeId] = useState(null),
    [local, setLocal] = useState(catalog),
    [moved, setMoved] = useState({});
  useEffect(() => {
    const el = root.current,
      observer = new ResizeObserver(() => {
        if (el.clientWidth > 0)
          setSize({
            width: el.clientWidth,
            height: Math.max(320, el.clientHeight),
          });
      });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const selectedEdge = links.find((l) => l.id === edgeId);
  const selectNode = (key) => {
    setEdgeId(null);
    onSelect(key);
  };
  const closeEdge = () => {
    const edge = [...root.current.querySelectorAll("[data-edge]")].find(
      (el) => el.dataset.edge === edgeId,
    );
    setEdgeId(null);
    edge?.focus();
  };
  useEffect(() => {
    if (edgeId && !links.some((l) => l.id === edgeId)) setEdgeId(null);
  }, [links, edgeId]);
  const nearby = new Set([
    selected,
    ...links
      .filter((l) => l.from === selected || l.to === selected)
      .flatMap((l) => [l.from, l.to]),
  ]);
  const visible = items.filter((x) => !local || nearby.has(x.key));
  const signature =
    visible.map((x) => x.key).join("|") +
    links.map((l) => l.from + l.to).join("|");
  const positions = useMemo(() => {
    const nodes = visible.map((x) => ({ id: x.key })),
      ids = new Set(nodes.map((n) => n.id));
    const edges = links
      .filter((l) => ids.has(l.from) && ids.has(l.to))
      .map((l) => ({ source: l.from, target: l.to }));
    const sim = forceSimulation(nodes)
      .force(
        "links",
        forceLink(edges)
          .id((n) => n.id)
          .distance(160),
      )
      .force("charge", forceManyBody().strength(-320))
      .force("collide", forceCollide(78))
      .force("center", forceCenter(size.width / 2, size.height / 2))
      .stop();
    sim.tick(160);
    // Fit the whole layout uniformly. Per-node clamping piles unrelated nodes
    // onto the same boundary and hides edge hit targets in narrow columns.
    const xs = nodes.map((n) => n.x),
      ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const factor = Math.min(
      1,
      (size.width - 150) / Math.max(1, maxX - minX),
      (size.height - 85) / Math.max(1, maxY - minY),
    );
    return Object.fromEntries(
      nodes.map((n) => [
        n.id,
        {
          x: size.width / 2 + (n.x - (minX + maxX) / 2) * factor,
          y: size.height / 2 + (n.y - (minY + maxY) / 2) * factor,
        },
      ]),
    );
  }, [signature, size.width, size.height]);
  useEffect(() => setMoved({}), [signature, size.width, size.height]);
  const point = (id) => moved[id] || positions[id];
  const focus = hover || selected,
    neighbors = new Set([
      focus,
      ...links
        .filter((l) => l.from === focus || l.to === focus)
        .flatMap((l) => [l.from, l.to]),
    ]);
  const zoom = (delta) =>
    setView((v) => {
      const k = Math.max(0.35, Math.min(3, v.k * delta)),
        ratio = k / v.k;
      return {
        k,
        x: size.width / 2 - (size.width / 2 - v.x) * ratio,
        y: size.height / 2 - (size.height / 2 - v.y) * ratio,
      };
    });

  return (
    <div className="connectionsView">
      <div className="graphToolbar">
        <div className="formatSwitch">
          <button aria-pressed={!local} onClick={() => setLocal(false)}>
            All items
          </button>
          <button
            aria-pressed={local}
            disabled={!selected}
            onClick={() => setLocal(true)}
          >
            Local connections
          </button>
        </div>
        <span className="graphZoom">
          <button aria-label="Zoom graph out" onClick={() => zoom(0.8)}>
            −
          </button>
          <button
            onClick={() => {
              setView({ x: 0, y: 0, k: 1 });
              setMoved({});
            }}
          >
            Reset view
          </button>
          <button aria-label="Zoom graph in" onClick={() => zoom(1.25)}>
            +
          </button>
        </span>
      </div>
      <div className="graphCanvas" ref={root}>
        <svg
          aria-label="Source connections graph"
          role="group"
          tabIndex={0}
          viewBox={`0 0 ${size.width} ${size.height}`}
          onWheel={(e) => {
            e.stopPropagation();
            zoom(Math.exp(-e.deltaY * 0.002));
          }}
          onKeyDown={(e) => {
            if (
              [
                "+",
                "=",
                "-",
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
              ].includes(e.key)
            ) {
              e.preventDefault();
              if (["+", "="].includes(e.key)) zoom(1.2);
              else if (e.key === "-") zoom(0.8);
              else
                setView((v) => ({
                  ...v,
                  x:
                    v.x +
                    (e.key === "ArrowRight"
                      ? 25
                      : e.key === "ArrowLeft"
                        ? -25
                        : 0),
                  y:
                    v.y +
                    (e.key === "ArrowDown"
                      ? 25
                      : e.key === "ArrowUp"
                        ? -25
                        : 0),
                }));
            }
          }}
          onPointerDown={(e) => {
            if (e.target.closest("[data-node],[data-edge]")) return;
            drag.current = { x: e.clientX, y: e.clientY, view };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            if (d.node)
              setMoved((p) => ({
                ...p,
                [d.node]: {
                  x: d.point.x + dx / view.k,
                  y: d.point.y + dy / view.k,
                },
              }));
            else setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--blue)" />
            </marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {links.map((l) => {
              const a = point(l.from),
                b = point(l.to);
              const from = items.find((x) => x.key === l.from)?.label || l.from,
                to = items.find((x) => x.key === l.to)?.label || l.to,
                length =
                  a && b ? Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) : 1,
                line =
                  a && b
                    ? {
                        x1: a.x + ((b.x - a.x) / length) * 16,
                        y1: a.y + ((b.y - a.y) / length) * 16,
                        x2: b.x - ((b.x - a.x) / length) * 21,
                        y2: b.y - ((b.y - a.y) / length) * 21,
                      }
                    : {};
              return a && b ? (
                <g
                  key={l.id}
                  data-edge={l.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Explain connection: ${from} ${l.type} ${to}`}
                  aria-pressed={edgeId === l.id}
                  className="graphEdge"
                  onClick={() => setEdgeId(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setEdgeId(l.id);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEdgeId(null);
                    }
                  }}
                >
                  <line
                    {...line}
                    className="edgeHit"
                    stroke="transparent"
                    strokeWidth={24}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    {...line}
                    className="edgeLine"
                    markerEnd={l.type === "shares sources with" ? undefined : `url(#${arrowId})`}
                    strokeDasharray={
                      l.type === "contradicts" ? "5 4" : undefined
                    }
                    stroke={edgeId === l.id ? "var(--ink)" : "var(--blue)"}
                    strokeWidth={edgeId === l.id ? 3 : 1.5}
                    opacity={
                      edgeId === l.id
                        ? 1
                        : focus && l.from !== focus && l.to !== focus
                          ? 0.25
                          : 0.65
                    }
                  />
                  <title>
                    {from} {l.type} {to}
                  </title>
                </g>
              ) : null;
            })}
            {visible.map((n) => {
              const p = point(n.key),
                degree = links.filter(
                  (l) => l.from === n.key || l.to === n.key,
                ).length;
              return (
                p && (
                  <g
                    key={n.key}
                    data-node={n.key}
                    transform={`translate(${p.x} ${p.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${n.label}`}
                    aria-pressed={selected === n.key}
                    opacity={focus && !neighbors.has(n.key) ? 0.7 : 1}
                    onFocus={() => setHover(n.key)}
                    onBlur={() => setHover("")}
                    onMouseEnter={() => setHover(n.key)}
                    onMouseLeave={() => setHover("")}
                    onClick={() => selectNode(n.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        selectNode(n.key);
                      }
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag.current = {
                        node: n.key,
                        point: p,
                        x: e.clientX,
                        y: e.clientY,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                  >
                    <title>
                      {n.label} · {degree} connections
                    </title>
                    <NodeShape
                      kind={n.sourceType === "web" ? "web" : n.kind}
                      r={9 + Math.min(9, degree * 1.5)}
                      fill={colors[n.sourceType === "web" ? "web" : n.kind]}
                      stroke={
                        selected === n.key ? "var(--ink)" : "var(--background)"
                      }
                      strokeWidth={selected === n.key ? 3 : 2}
                    />
                    <text
                      y={27}
                      textAnchor="middle"
                      fontSize={12}
                      fill="var(--ink)"
                    >
                      {n.label.length > 24
                        ? n.label.slice(0, 22) + "…"
                        : n.label}
                    </text>
                  </g>
                )
              );
            })}
          </g>
        </svg>
        {!visible.length && (
          <p className="graphEmpty">No sources match this filter.</p>
        )}
      </div>
      <div className="graphLegend">
        {[
          ...(catalog ? [["project", "Projects"]] : []),
          ["paper", "Papers"],
          ["web", "Web pages"],
          ...Object.entries(researchKinds).map(([kind, meta]) => [
            kind,
            meta.plural,
          ]),
          ["experiment", "Experiments"],
        ].filter(([k]) => !catalog || items.some(x=>x.kind===k)).map(([k, label]) => (
          <span key={k}>
            <svg
              width="22"
              height="22"
              viewBox="-15 -15 30 30"
              aria-hidden="true"
            >
              <NodeShape kind={k} fill={colors[k]} />
            </svg>
            {label}
          </span>
        ))}
      </div>
      {selectedEdge ? (
        <DetailSurface
          className="connectionDetail"
          title={"Connection " + selectedEdge.id}
          role="region"
          aria-label="Connection explanation"
        >
          <div className="connectionDetailHead" data-annotation-ui="true">
            <strong>Connection</strong>
            <button
              aria-label="Close connection explanation"
              onClick={closeEdge}
            >
              ×
            </button>
          </div>
          <div className="connectionEndpoints" data-annotation-ui="true">
            <button onClick={() => selectNode(selectedEdge.from)}>
              {items.find((x) => x.key === selectedEdge.from)?.label}
            </button>
            <strong>{selectedEdge.type} {selectedEdge.type === "shares sources with" ? "↔" : "→"}</strong>
            <button onClick={() => selectNode(selectedEdge.to)}>
              {items.find((x) => x.key === selectedEdge.to)?.label}
            </button>
          </div>
          <MarkdownPreview source={selectedEdge.description} />
          {selectedEdge.location && (
            <p>Source location: {selectedEdge.location}</p>
          )}
          {[
            ["Evidence", selectedEdge.evidence],
            ["Assumptions", selectedEdge.assumptions],
            ["Open gaps", selectedEdge.gaps],
          ]
            .filter(([, value]) => value?.length)
            .map(([label, value]) => (
              <div key={label}>
                <strong>{label}</strong>
                <MarkdownPreview
                  source={
                    Array.isArray(value)
                      ? value.map((x) => "- " + x).join("\n")
                      : value
                  }
                />
              </div>
            ))}
          <p className="connectionCaveat">
            {selectedEdge.origin || "Recorded interpretation"}. Review evidence and scope; this
            relationship does not establish causality.
          </p>
          {edgeActions?.(selectedEdge)}
        </DetailSurface>
      ) : (
        <details
          className="graphInspector"
          key={selected}
          open={Boolean(selected)}
        >
          <summary>
            Selected item ·{" "}
            {items.find((x) => x.key === selected)?.label || "Choose a node"}
          </summary>
          {context}
        </details>
      )}
      <details className="graphRelationships">
        <summary>Relationships · {links.length}</summary>
        <p className="hint">
          Arrows read “from → to”; the relation and justification appear below.
          Dashed arrows mean “contradicts”. Links record interpretations, not
          established proofs. Drag to pan; scroll to zoom. Select a node to
          inspect its notes, or a connection to read its explanation.
        </p>
        {links.map((l) => (
          <p key={l.id} className="connectionRow">
            {items.find((x) => x.key === l.from)?.label}{" "}
            <strong title={l.description}>{l.type}</strong>{" "}
            {items.find((x) => x.key === l.to)?.label}
            {l.description && (
              <small className="connectionReason">
                {l.origin || "Assistant interpretation"}: {l.description}
              </small>
            )}
          </p>
        ))}
        {!links.length && (
          <p>
            {catalog ? "No links yet. Add a connection with an explanation, or import a shared source into both project libraries." : "Ask the Experiment Chatbot to connect the sources as it develops the argument."}
          </p>
        )}
      </details>
    </div>
  );
}
