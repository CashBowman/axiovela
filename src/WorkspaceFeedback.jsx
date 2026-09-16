import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import AnnotationSurface from "./AnnotationSurface.jsx";
import AnnotationChips from "./AnnotationChips.jsx";
import { textProjection } from "./annotation-dom.mjs";
import "./annotations.css";
export const FeedbackContext = createContext(null);
const digest = async (text) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
// Stable event identities keep document measurement independent of composer renders.
function useCurrentCallback(callback) {
  const current = useRef(callback);
  current.current = callback;
  return useCallback((...args) => current.current(...args), []);
}
const emptyNotes = [];
const storage = "axiovela-annotation-attachments-v1";
function restored() {
  try {
    return JSON.parse(localStorage.getItem(storage) || "{}");
  } catch {
    return {};
  }
}
export function useFeedback({
  root,
  chatKey,
  role,
  panel,
  request,
  beforeSave,
}) {
  const [notes, setNotes] = useState([]),
    [loadedRoot, setLoadedRoot] = useState(null),
    [queues, setQueues] = useState(restored),
    [pending, setPending] = useState(null),
    [error, setError] = useState("");
  const latest = useRef();
  latest.current = { root, chatKey, role, request, panel };
  const queueRef = useRef(queues);
  queueRef.current = queues;
  const refresh = async () => {
    const r = root;
    if (!r) {
      setNotes([]);
      return;
    }
    const result = await request("/api/annotations", {
      headers: { "x-axiovela-project": r },
    });
    if (latest.current.root === r) {
      setNotes(old => JSON.stringify(old) === JSON.stringify(result.notes) ? old : result.notes);
      setLoadedRoot(r);
    }
  };
  useEffect(() => {
    setNotes([]);
    setLoadedRoot(null);
    setPending(null);
    refresh().catch((e) => setError(e.message));
  }, [root]);
  useEffect(() => {
    setPending(null);
  }, [root, chatKey, panel]);
  useEffect(() => {
    const keyboard = (e) => {
      if (
        e.altKey &&
        e.key.toLowerCase() === "m" &&
        !e.target.closest?.(".annotationSurface")
      ) {
        const surface = window
          .getSelection()
          ?.anchorNode?.parentElement?.closest(".annotationSurface");
        if (surface) {
          e.preventDefault();
          surface.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "m",
              altKey: true,
              bubbles: true,
            }),
          );
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, []);
  const changeQueues = (fn) => {
    const next = fn(queueRef.current);
    try {
      localStorage.setItem(storage, JSON.stringify(next));
      setError("");
    } catch {
      setError(
        "Attachments could not be saved for reopening. They remain in this window.",
      );
    }
    queueRef.current = next;
    setQueues(next);
  };
  const selected = useMemo(() => (queues[chatKey] || [])
    .map((id) => notes.find((n) => n.id === id))
    .filter(Boolean), [queues, chatKey, notes]);
  const detach = (id) =>
    changeQueues((q) => ({
      ...q,
      [chatKey]: (q[chatKey] || []).filter((n) => n !== id),
    }));
  const move = (oldKey, nextKey) =>
    changeQueues((q) => {
      if (oldKey === nextKey || !q[oldKey]?.length) return q;
      const next = {
        ...q,
        [nextKey]: [...new Set([...(q[nextKey] || []), ...q[oldKey]])],
      };
      delete next[oldKey];
      return next;
    });
  const clear = (key, ids) =>
    changeQueues((q) => ({
      ...q,
      [key]: (q[key] || []).filter((id) => !ids.includes(id)),
    }));
  const capture = async ({
    target,
    source,
    revision = "",
    anchor,
    surface,
    position,
    panelText,
    expectedRoot,
    expectedScope,
  }) => {
    if (expectedRoot && latest.current.root !== expectedRoot) return;
    if (expectedScope && ["root","chatKey","panel"].some(k=>expectedScope[k]!==latest.current[k])) return;
    const at = { ...latest.current };
    const sourceHash = await digest(source + "\0" + revision);
    if (panelText !== undefined)
      target = { ...target, panelHash: await digest(panelText) };
    if (
      latest.current.root !== at.root ||
      latest.current.chatKey !== at.chatKey ||
      latest.current.panel !== at.panel
    )
      return;
    setPending({
      target,
      sourceHash,
      anchor,
      surface,
      position,
      root: at.root,
      key: at.chatKey,
      comment: "",
      focusFeedback: anchor.focusFeedback,
    });
    setError("");
  };
  const edit = (note, position) => {
    if (!note) return;
    const pin = [...document.querySelectorAll('[data-annotation-id]')].find(el => el.dataset.annotationId === note.id && el.getClientRects().length && !el.closest('[inert],.hiddenLibraryView'));
    const rect = pin?.getBoundingClientRect();
    setPending({
      ...note, root, key: chatKey,
      position: rect || position || {left: innerWidth - 352, top: innerHeight - 270, height: 0},
      surface: note.target.kind === "snapshot" ? note.target.title : JSON.stringify(note.target),
      focusFeedback: true,
    });
  };
  const save = async (comment) => {
    const p = pending;
    if (!p) return;
    await beforeSave?.(p.target);
    const note = await request("/api/annotations", {
      method: "POST",
      headers: { "x-axiovela-project": p.root },
      body: JSON.stringify({ ...p, comment }),
    });
    if (latest.current.root === p.root)
      setNotes((ns) => [...ns.filter((n) => n.id !== note.id), note]);
    changeQueues((q) => ({
      ...q,
      [p.key]: [...new Set([...(q[p.key] || []), note.id])],
    }));
    if (latest.current.root === p.root && latest.current.chatKey === p.key)
      setPending(null);
  };
  return {
    scope: {root,chatKey,panel},
    root,
    role,
    request,
    ready: loadedRoot === root,
    notes,
    pending,
    setPending,
    capture,
    edit,
    save,
    error,
    setError,
    selected,
    detach,
    clear,
    move,
    refresh,
  };
}
export function AnnotatedContent({
  children,
  target,
  source,
  revision = "",
  title = "",
  className = "",
  ...props
}) {
  const feedback = useContext(FeedbackContext),
    root = useRef(),
    [hash, setHash] = useState("");
  const identity = target ? JSON.stringify(target) : title;
  useEffect(() => {
    let active = true;
    setHash("");
    if (target)
      digest((source || "") + "\0" + revision).then((h) => {
        if (active) setHash(h);
      });
    return () => {
      active = false;
    };
  }, [source, revision, identity]);
  const surface = identity;
  const matching = useMemo(() => (feedback?.notes || emptyNotes).filter((n) =>
    target
      ? JSON.stringify(n.target) === identity && n.sourceHash === hash
      : n.target.kind === "snapshot" &&
        n.target.title === title &&
        n.role === feedback?.role,
  ), [feedback?.notes, feedback?.role, identity, hash, !!target, title]);
  const pending =
    feedback?.pending?.surface === surface ? feedback.pending : null;
  const capture = (anchor, position, measuredProjection) => {
    if (target && !hash) return;
    const projection = measuredProjection || (!target ? textProjection(root.current) : null);
    if (anchor.quote.length > 12000) {
      feedback.setError("Select a passage shorter than 12,000 characters.");
      return;
    }
    const offset = anchor.kind === "figure" ? 0 : Math.max(0, anchor.start - 500),
      snapshot = anchor.kind === "figure" ? anchor.quote : projection?.text.slice(offset, anchor.end + 500);
    const panelTarget = target
      ? null
      : {
          kind: "snapshot",
          title,
          source: snapshot,
          role: feedback.role,
          offset,
        };
    feedback.capture({
      target: target || panelTarget,
      panelText: target ? undefined : projection.text,
      source: target ? source : snapshot,
      revision,
      anchor: target
        ? anchor
        : { ...anchor, start: anchor.start - offset, end: anchor.end - offset },
      surface,
      position,
    });
  };
  const annotations = useMemo(() => matching.map((n, i) => ({
    ...n,
    anchor: n.target.kind === "snapshot" ? {...n.anchor, start:n.anchor.start+(n.target.offset||0), end:n.anchor.end+(n.target.offset||0)} : n.anchor,
    number: i + 1,
  })), [matching]);
  const draft = useMemo(() => pending ? {...pending.anchor, start:pending.anchor.start+(pending.target.offset||0), end:pending.anchor.end+(pending.target.offset||0)} : null, [pending?.anchor, pending?.target]);
  if (!feedback)
    return (
      <div {...props} className={className}>
        {children}
      </div>
    );
  return (
    <AnnotationSurface
      {...props}
      rootRef={root}
      className={className}
      annotating={!!feedback.root}
      annotations={annotations}
      draft={draft}
      onCapture={capture}
      onSelect={(id, position) => feedback.edit(matching.find((n) => n.id === id), position)}
      onDraftRect={(position) =>
        feedback.setPending((p) =>
          !p?.id && p?.surface === surface
            ? p.position &&
              Math.abs(p.position.left - position.left) < 1 &&
              Math.abs(p.position.top - position.top) < 1
              ? p
              : { ...p, position }
            : p,
        )
      }
    >
      {children}
    </AnnotationSurface>
  );
}
export function useDocumentAnnotation(target, source, revision = "") {
  const feedback = useContext(FeedbackContext),
    [hash, setHash] = useState(""),
    identity = JSON.stringify(target);
  useEffect(() => {
    let live = true;
    setHash("");
    digest(source + "\0" + revision).then((h) => {
      if (live) setHash(h);
    });
    return () => {
      live = false;
    };
  }, [source, revision, identity]);
  const notes = useMemo(() => (feedback?.notes || emptyNotes).filter(
    n => JSON.stringify(n.target) === identity && n.sourceHash === hash,
  ), [feedback?.notes, identity, hash]);
  const annotations = useMemo(() => notes.map((n,i) => ({...n, number:i+1})), [notes]);
  const draft = feedback?.pending && feedback.pending.surface === identity ? feedback.pending.anchor : null;
  const annotating = !!target && !!feedback?.root && !!hash;
  const onCapture = useCurrentCallback((anchor, position) => feedback?.capture({target, source, revision, anchor, position, surface:identity}));
  const onSelect = useCurrentCallback((id, position) => feedback?.edit(notes.find(n => n.id === id), position));
  const onDraftRect = useCurrentCallback(position => feedback?.setPending(p =>
    !p?.id && p?.surface === identity
      ? p.position && Math.abs(p.position.left-position.left)<1 && Math.abs(p.position.top-position.top)<1 ? p : {...p,position}
      : p,
  ));
  return useMemo(() => ({annotating, annotations, draft, onCapture, onSelect, onDraftRect}), [annotating, annotations, draft, onCapture, onSelect, onDraftRect]);
}
export function FeedbackChips() {
  const f = useContext(FeedbackContext);
  return (
    <>
      {f?.error && (
        <p className="renderError" role="alert">
          {f.error}
          <button onClick={() => f.setError("")}>Dismiss</button>
        </p>
      )}
      <AnnotationChips
        notes={f?.selected || []}
        onEdit={f?.edit}
        onRemove={f?.detach}
      />
    </>
  );
}
export default function WorkspaceFeedback() {
  const f = useContext(FeedbackContext),
    p = f.pending,
    input = useRef(),
    popup = useRef(),
    [comment, setComment] = useState(""),
    [status, setStatus] = useState(""),
    [saving, setSaving] = useState(false),
    [viewport, setViewport] = useState({width:innerWidth,height:innerHeight});
  useLayoutEffect(() => {
    if (!p) return;
    const resize = () => setViewport({width:innerWidth,height:innerHeight});
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [!!p]);
  const close = () => f.setPending(null);
  useLayoutEffect(() => {
    setComment(p?.comment || "");
    setStatus("");
  }, [p?.anchor, p?.id]);
  useLayoutEffect(() => {
    if (p?.position && (p.focusFeedback || p.id || window.getSelection()?.isCollapsed))
      input.current?.focus({preventScroll:true});
  }, [p?.anchor, p?.id, !!p?.position]);
  useEffect(() => {
    if (!p) return;
    const outside = (e) => {
      if (e.button === 0 && !popup.current?.contains(e.target)) close();
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("axiovela-dismiss-feedback", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("axiovela-dismiss-feedback", close);
    };
  }, [!!p]);
  if (!p) return null;
  const add = async (e) => {
    e.preventDefault();
    if (saving || !comment.trim()) return;
    setSaving(true);
    try {
      await f.save(comment);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setSaving(false);
    }
  };
  const position = p.position,
    style = position
      ? {
          left: Math.max(12, Math.min(viewport.width - 332, position.left)),
          top: Math.max(
            12,
            Math.min(viewport.height - 230, position.top + position.height + 10),
          ),
        }
      : { visibility: "hidden", left: 12, top: 12 };
  return createPortal(
    <section
      className="annotationPopover"
      ref={popup}
      role="dialog"
      aria-label={p.id ? "Edit annotation" : "Add annotation"}
      data-annotation-ui="true"
      style={style}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.nativeEvent.isComposing &&
          e.keyCode !== 229 &&
          (e.target === input.current || e.ctrlKey || e.metaKey)
        ) {
          e.preventDefault();
          e.stopPropagation();
          add(e);
        }
      }}
    >
      <form onSubmit={add}>
        <div className="annotationListHead">
          <strong>{p.id ? "Edit feedback" : "Leave feedback"}</strong>
          <button type="button" aria-label="Cancel annotation" onClick={close}>
            ×
          </button>
        </div>
        <textarea
          ref={input}
          aria-label="Annotation feedback"
          placeholder="What should change here?"
          value={comment}
          maxLength={4000}
          onChange={(e) => setComment(e.target.value)}
        />
        {status && <p role="alert" className="renderError">{status}</p>}
        <div className="annotationPopoverFoot">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="newBtn" disabled={!comment.trim() || saving}>
            {saving ? "Adding…" : "Add to message"}
          </button>
        </div>
      </form>
    </section>,
    document.querySelector("dialog[open]") || document.body,
  );
}
