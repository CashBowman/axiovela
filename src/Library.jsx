import { researchKinds } from "../shared/research-outline.mjs";
import React, {
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Upload, Maximize2, Minimize2 } from "lucide-react";
import PdfReader from "./PdfReader.jsx";
import MarkdownPreview from "./MarkdownPreview.jsx";
import ConnectionsGraph from "./ConnectionsGraph.jsx";
import {
  FeedbackContext,
  AnnotatedContent,
  useDocumentAnnotation,
} from "./WorkspaceFeedback.jsx";
import { arxivId } from "../shared/arxiv.mjs";
import "./library.css";
const external = (value) => {
  try {
    arxivId(value);
    return true;
  } catch {
    return /^https?:\/\//i.test(value);
  }
};
export function useLibrary({ root, request, active }) {
  const [state, setState] = useState({ papers: [] }),
    [graph, setGraph] = useState({ nodes: [], links: [] }),
    [selected, setSelected] = useState(""),
    [view, setView] = useState("read"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const current = useRef(root);
  current.current = root;
  const refresh = async () => {
    if (!root) return;
    const [s, g] = await Promise.all([
      request("/api/library", { headers: { "x-axiovela-project": root } }),
      request("/api/library/graph", {
        headers: { "x-axiovela-project": root },
      }),
    ]);
    if (current.current !== root) return;
    setState(old => JSON.stringify(old) === JSON.stringify(s) ? old : s);
    setGraph(old => JSON.stringify(old) === JSON.stringify(g) ? old : g);
    setSelected((old) =>
      s.papers.some((p) => p.id === old) ||
      g.nodes.some((n) => "outline:" + n.key === old)
        ? old
        : s.papers[0]?.id || (g.nodes[0] ? "outline:" + g.nodes[0].key : ""),
    );
  };
  useEffect(() => {
    setState({ papers: [] });
    setGraph({ nodes: [], links: [] });
    setError("");
    setSelected("");
    if (root) refresh().catch((e) => setError(e.message));
  }, [root]);
  useEffect(() => {
    if (!active || !root) return;
    let live = true;
    const tick = () =>
      refresh().catch((e) => {
        if (live) setError(e.message);
      });
    tick();
    const timer = setInterval(tick, 3500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [active, root]);
  const act = async (fn) => {
    const r = root;
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (current.current === r) {
        await refresh();
        return result;
      }
    } catch (e) {
      if (current.current === r) setError(e.message);
    } finally {
      if (current.current === r) setBusy(false);
    }
  };
  const importSource = (body) =>
    act(async () => {
      const result = await request("/api/library/import", {
        method: "POST",
        headers: { "x-axiovela-project": root },
        body: JSON.stringify(body),
      });
      if (current.current === root && result.paper)
        setSelected(result.paper.id);
      return result;
    });
  const update = (body) => {
    setState((s) => ({
      ...s,
      papers: s.papers.map((p) => (p.id === body.id ? { ...p, ...body } : p)),
    }));
    return act(() =>
      request("/api/library", {
        method: "PUT",
        headers: { "x-axiovela-project": root },
        body: JSON.stringify(body),
      }),
    );
  };
  const sync = () =>
    act(() =>
      request("/api/library/sync", {
        method: "POST",
        headers: { "x-axiovela-project": root },
        body: "{}",
      }),
    );
  return {
    root,
    state,
    graph,
    selected,
    setSelected,
    view,
    setView,
    error,
    busy,
    importSource,
    update,
    refresh,
    sync,
  };
}
export function LibrarySources({ library: l }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [readFilter, setReadFilter] = useState("all"),
    upload = useRef();
  const papers = l.state.papers.filter(
    (p) =>
      (filter === "all" ||
        filter === p.sourceType ||
        (filter === "unread" && !p.read) ||
        (filter === "read" && p.read)) &&
      (readFilter === "all" || (readFilter === "read" ? p.read : !p.read)) &&
      (!query ||
        external(query) ||
        [p.title, ...(p.authors || []), p.notes, p.arxivId]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const research = l.graph.nodes.filter(
    (n) =>
      !n.source &&
      readFilter === "all" &&
      (filter === "all" || filter === n.kind) &&
      (!query ||
        [n.title, n.detail]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const submit = async (e) => {
    e?.preventDefault();
    if (external(query)) {
      const result = await l.importSource({ url: query });
      if (result) setQuery("");
    }
  };
  return (
    <section className="pane librarySources">
      <header className="paneHead">
        <strong>Research library</strong>
        <button
          className="textButton"
          title="Import PDF"
          aria-label="Import PDF"
          disabled={!l.root || l.busy}
          onClick={() => upload.current.click()}
        >
          <Upload size={15} />
        </button>
      </header>
      <form className="librarySearch" onSubmit={submit}>
        <input
          aria-label="Search or import source"
          placeholder="Search, paste a URL or arXiv ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPaste={(e) => {
            const value = e.clipboardData.getData("text").trim();
            if (external(value)) {
              e.preventDefault();
              setQuery(value);
              void l.importSource({ url: value }).then((result) => {
                if (result) setQuery("");
              });
            }
          }}
        />
        <button
          disabled={!l.root || l.busy || !external(query)}
          title="Import source"
          aria-label="Import source"
        >
          +
        </button>
      </form>
      <div className="libraryFilter">
        <select
          aria-label="Filter library"
          value={filter}
          onChange={(e) => {setFilter(e.target.value);if(!["all","pdf","web"].includes(e.target.value))setReadFilter("all");}}
        >
          {[
            ["all", "All items"],
            ["pdf", "PDFs"],
            ["web", "Web pages"],
            ["experiment", "Experiments"],
            ...Object.entries(researchKinds).map(([kind, meta]) => [
              kind,
              meta.plural,
            ]),
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Reading status" value={readFilter} onChange={e=>setReadFilter(e.target.value)} disabled={filter !== "all" && filter !== "pdf" && filter !== "web"}>
          <option value="all">Any status</option><option value="unread">Unread</option><option value="read">Read</option>
        </select>
        <button
          className="textButton"
          disabled={l.busy || !l.root}
          onClick={l.sync}
        >
          Refresh imports
        </button>
      </div>
      <input
        ref={upload}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={async (e) => {
          const f = e.target.files[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 128 * 1024 * 1024) return;
          const data = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result.split(",")[1]);
            r.onerror = reject;
            r.readAsDataURL(f);
          });
          await l.importSource({ data, name: f.name });
        }}
      />
      {l.busy && (
        <p className="paneHint" role="status">
          Importing source…
        </p>
      )}
      {l.error && (
        <p className="renderError" role="alert">
          {l.error}
        </p>
      )}
      <div className="libraryList">
        {papers.length>0 && <section className="libraryGroup" aria-label="Sources"><h3>Sources <span>{papers.length}</span></h3>{papers.map((p) => (
          <article
            key={p.id}
            className={"libraryCard " + (p.id === l.selected ? "selected" : "")}
          >
            <button
              className="sourceTitle"
              aria-pressed={p.id === l.selected}
              onClick={() => {
                l.setSelected(p.id);
                l.setView("read");
              }}
            >
              {p.title}
            </button>
            {p.authors?.length > 0 && <small>{p.authors.join(", ")}</small>}
            <div className="sourceMetadata">
              <label>
                <input
                  aria-label={"Read " + p.title}
                  type="checkbox"
                  checked={!!p.read}
                  onChange={(e) =>
                    l.update({ id: p.id, read: e.target.checked })
                  }
                />
                {p.sourceType === "pdf" ? "PDF" : "Web page"} ·{" "}
                {p.read ? "Read" : "Unread"}
              </label>
              {p.discovered && <small>AI added source</small>}
            </div>
          </article>
        ))}</section>}
        {["experiment",...Object.keys(researchKinds)].filter(kind=>research.some(n=>n.kind===kind)).map(kind=><section className="libraryGroup" aria-label={researchKinds[kind]?.plural || "Experiments"} key={kind}><h3>{researchKinds[kind]?.plural || "Experiments"} <span>{research.filter(n=>n.kind===kind).length}</span></h3>{research.filter(n=>n.kind===kind).map((n) => (
          <article
            key={n.key}
            className={
              "libraryCard researchCard " +
              (l.selected === "outline:" + n.key ? "selected" : "")
            }
          >
            <button
              className="sourceTitle"
              aria-pressed={l.selected === "outline:" + n.key}
              onClick={() => {
                l.setSelected("outline:" + n.key);
                l.setView("read");
              }}
            >
              {n.title}
            </button>
            <div className="sourceMetadata">
              <span>
                {researchKinds[n.kind]?.label || "Experiment"} ·{" "}
                {n.status || "Recorded"}
              </span>
              {n.mainResult && (
                <span className="mainResultLabel">Main result</span>
              )}
            </div>
          </article>
        ))}</section>)}
        {!papers.length && !research.length && (
          <p className="emptyResearch">
            {l.root
              ? l.state.papers.length || l.graph.nodes.length
                ? "No items match this filter."
                : "Import a source or develop a research question with the assistant."
              : "Open a project to use its library."}
          </p>
        )}
      </div>
    </section>
  );
}
export function DocumentReader({
  target,
  source = "",
  revision = "",
  url,
  title,
  children,
  onSource,
  originalUrl,
  capturedAt,
}) {
  const annotation = useDocumentAnnotation(target, source, revision),
    [expanded, setExpanded] = useState(false),
    ref = useRef(),
    readingAnchor = useRef();
  const expand = (value) => {
    ref.current?.dispatchEvent(new Event("axiovela-reader-layout"));
    const scroll = ref.current?.querySelector(".articleScroll");
    if (scroll) {
      const top = scroll.getBoundingClientRect().top;
      const element = [...scroll.querySelectorAll("p,h1,h2,h3,li,pre")].find(
        (el) => el.getBoundingClientRect().bottom > top,
      );
      readingAnchor.current = element
        ? { element, offset: element.getBoundingClientRect().top - top }
        : null;
    }
    setExpanded(value);
  };
  useLayoutEffect(() => {
    const scroll = ref.current?.querySelector(".articleScroll"),
      a = readingAnchor.current;
    if (scroll && a?.element.isConnected)
      scroll.scrollTop +=
        a.element.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top -
        a.offset;
    readingAnchor.current = null;
  }, [expanded]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape" && !document.querySelector(".annotationPopover"))
        expand(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <div
      ref={ref}
      className={"documentReader " + (expanded ? "expandedPanel" : "")}
    >
      <div className="readerTitleRow" data-annotation-ui="true">
        <strong title={title}>{title}</strong>
        <div className="readerTitleActions">
          {capturedAt && (
            <span
              className="readerSnapshot"
              title={"Snapshot saved " + new Date(capturedAt).toLocaleString()}
            >
              Saved {new Date(capturedAt).toLocaleDateString()}
            </span>
          )}
          {(originalUrl || url) && (
            <a href={originalUrl || url} target="_blank" rel="noreferrer">
              {originalUrl ? "Open original" : "Open PDF"}
            </a>
          )}
          <button
            className="textButton"
            aria-label={
              expanded ? "Exit reader fullscreen" : "Fullscreen reader"
            }
            title={expanded ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => expand(!expanded)}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      {url ? (
        <PdfReader
          url={url}
          title={title}
          annotation={annotation}
          layoutKey={expanded}
          onSource={onSource}
        />
      ) : (
        <div className="articleScroll">
          <AnnotatedContent
            target={target}
            source={source}
            revision={revision}
            title={title}
            tabIndex={0}
            aria-label={title + " annotation surface"}
          >
            {children || <MarkdownPreview source={source} />}
          </AnnotatedContent>
        </div>
      )}
    </div>
  );
}
export function LibraryReader({ library: l, apiBase = "" }) {
  const chosenPaper = l.state.papers.find((p) => p.id === l.selected),
    retained = useRef();
  if (!retained.current || retained.current.root !== l.root)
    retained.current = { root: l.root };
  if (chosenPaper) retained.current.paper = chosenPaper;
  const paper = chosenPaper || retained.current.paper;
  const key = l.selected.startsWith("outline:")
      ? l.selected.slice(8)
      : "paper:" + l.selected,
    item = l.graph.nodes.find((n) => n.key === key);
  const url = useCallback((path) =>
    apiBase +
    path +
    (path.includes("?") ? "&" : "?") +
    "workspace=" +
    encodeURIComponent(l.root || ""), [apiBase, l.root]);
  const imageUrl = useCallback(src => /^https?:\/\//.test(src) ? url("/api/library/image?id=" + encodeURIComponent(paper?.id) + "&url=" + encodeURIComponent(src)) : "", [url, paper?.id]);
  const context = (
    <AnnotatedContent className="graphDetails" title="Connections">
      {item ? (
        <>
          {item.source && <strong>{item.title}</strong>}
          <MarkdownPreview
            source={
              item.source?.notes ||
              l.graph.sourceNotes?.[key] ||
              item.detail ||
              "Select relationships to inspect their supporting evidence."
            }
          />
          {item.source && (
            <>
              <small>{item.source.sourceUrl}</small>
              <label>
                Source notes
                <textarea
                  aria-label="Source notes"
                  key={item.source.id + item.source.notes}
                  defaultValue={item.source.notes || ""}
                  onBlur={(e) => {
                    if (e.target.value !== (item.source.notes || ""))
                      l.update({ id: item.source.id, notes: e.target.value });
                  }}
                />
              </label>
              <button
                onClick={() => {
                  l.setSelected(item.source.id);
                  l.setView("read");
                }}
              >
                Read source
              </button>
            </>
          )}
          {l.graph.links
            .filter((e) => e.from === key || e.to === key)
            .map((e, i) => (
              <p key={i}>
                <b>{e.type}</b>: {e.description}
                {e.location && <small> · {e.location}</small>}
              </p>
            ))}
        </>
      ) : (
        <p>Select a source or research object.</p>
      )}
      <small>
        Connections are recorded interpretations. They do not establish
        causality or verify a claim.
      </small>
    </AnnotatedContent>
  );
  return (
    <section className="pane libraryReader">
      <header className="paneHead">
        <strong>{l.view === "read" ? "Paper reader" : "Connections"}</strong>
        <div className="formatToggle">
          <button
            aria-pressed={l.view === "read"}
            onClick={() => l.setView("read")}
          >
            Read
          </button>
          <button
            aria-pressed={l.view === "connections"}
            onClick={() => l.setView("connections")}
          >
            Connections
          </button>
        </div>
      </header>
      <div
        inert={l.view !== "read" || !chosenPaper}
        className={
          "libraryReading " +
          (l.view === "read" && chosenPaper ? "" : "hiddenLibraryView")
        }
      >
        {paper ? (
          <>
            {paper.sourceType === "pdf" || paper.text ? (
              <DocumentReader
                key={paper.id}
                target={{ kind: "paper", id: paper.id }}
                source={paper.text || ""}
                revision={paper.contentHash || paper.capturedAt || paper.id}
                title={paper.title}
                originalUrl={paper.sourceUrl}
                capturedAt={paper.capturedAt}
                url={
                  paper.sourceType === "pdf"
                    ? url("/api/library/pdf?id=" + encodeURIComponent(paper.id))
                    : null
                }
              >
                <MarkdownPreview
                  source={paper.text || ""}
                  assetUrl={imageUrl}
                />
              </DocumentReader>
            ) : (
              <div className="emptyResearch">
                <p>{paper.previewError || "No readable preview available."}</p>
                <button
                  onClick={() =>
                    l.importSource({ url: paper.sourceUrl, retry: true })
                  }
                  disabled={l.busy}
                >
                  Retry preview
                </button>
                {paper.sourceUrl && (
                  <a href={paper.sourceUrl} target="_blank" rel="noreferrer">
                    Open original
                  </a>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="emptyResearch">Choose a source to read.</p>
        )}
      </div>
      {l.view === "read" && !chosenPaper && item && (
        <div className="libraryReading researchReading">
          <DocumentReader
            key={item.key}
            title={item.title}
            target={
              item.interpretation
                ? { kind: "research", id: item.key }
                : undefined
            }
            source={item.detail}
            revision={item.revision || ""}
          >
            <div className="researchItemMetadata" data-annotation-ui="true">
              {researchKinds[item.kind]?.label || "Experiment"} ·{" "}
              {item.status || "Recorded"}
              {item.mainResult && " · Main result"}
              {item.interpretation && " · Research interpretation"}
            </div>
            <MarkdownPreview
              source={item.detail || "No description recorded."}
            />
          </DocumentReader>
        </div>
      )}
      {l.view === "read" && !chosenPaper && !item && (
        <p className="emptyResearch">Choose a source or research item.</p>
      )}
      <div
        inert={l.view !== "connections"}
        className={
          "libraryConnections " +
          (l.view === "connections" ? "" : "hiddenLibraryView")
        }
      >
        <ConnectionsGraph
          items={l.graph.nodes.map((n) => ({ ...n, label: n.title }))}
          links={l.graph.links}
          selected={key}
          onSelect={(key) => {
            const n = l.graph.nodes.find((n) => n.key === key);
            l.setSelected(n?.source ? n.source.id : "outline:" + key);
          }}
          context={context}
        />
        {l.graph.warnings?.map((w) => (
          <small key={w}>{w}</small>
        ))}
      </div>
    </section>
  );
}

export function SavedDocumentReader({ url, title = "Document" }) {
  const context = useContext(FeedbackContext),
    [doc, setDoc] = useState(null),
    [error, setError] = useState("");
  let sourcePath = "";
  try {
    sourcePath =
      new URL(url, window.location.href).searchParams.get("path") || "";
  } catch {}
  const target = {
    kind: "document",
    path: sourcePath,
    role: context?.role || "experiment",
  };
  useEffect(() => {
    let live = true;
    setDoc(null);
    setError("");
    context
      .request("/api/annotations/document", {
        method: "POST",
        headers: { "x-axiovela-project": context?.root || "" },
        body: JSON.stringify({ target }),
      })
      .then((d) => {
        if (live) setDoc(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [url, context?.root, target.role]);
  return doc ? (
    <DocumentReader
      target={target}
      source={doc.source}
      revision={doc.revision}
      url={url}
      title={title}
    />
  ) : (
    <p role={error ? "alert" : "status"}>{error || "Loading document…"}</p>
  );
}
