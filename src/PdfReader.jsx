import AnnotationSurface from "./AnnotationSurface.jsx";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
GlobalWorkerOptions.workerSrc = workerUrl;
const emptyMarkers = [];
const clamp = (n) => Math.max(0.2, Math.min(4, n));

// Reserve every page's geometry. Only nearby pages allocate canvases. Render into
// detached surfaces, then swap a complete canvas and text layer together.
const PdfPage = React.memo(function PdfPage({
  pdf,
  number,
  size,
  zoom,
  container,
  annotation = {},
  onSource,
  markers = emptyMarkers,
}) {
  const root = useRef(),
    paint = useRef(),
    [near, setNear] = useState(false),
    [paintScale, setPaintScale] = useState(zoom),
    [error, setError] = useState(""),
    [links, setLinks] = useState([]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setNear(entries[0].isIntersecting),
      { root: container.current, rootMargin: "1000px 0px" },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [container]);
  useEffect(() => {
    if (!near) {
      paint.current.replaceChildren();
      return;
    }
    let canceled = false,
      renderTask,
      textLayer;
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(number);
        if (canceled) return;
        const viewport = page.getViewport({ scale: zoom }),
          ratio = Math.min(
            devicePixelRatio || 1,
            2,
            Math.sqrt(12000000 / (viewport.width * viewport.height)),
          );
        const canvas = document.createElement("canvas"),
          layer = document.createElement("div");
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        canvas.setAttribute("aria-label", "PDF page " + number);
        layer.className = "textLayer";
        layer.style.setProperty("--scale-factor", zoom);
        layer.style.setProperty("--total-scale-factor", zoom);
        renderTask = page.render({
          canvasContext: canvas.getContext("2d"),
          viewport,
          transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
        });
        await renderTask.promise;
        if (canceled) return;
        const annotations = await page.getAnnotations();
        if (!canceled)
          setLinks(
            annotations
              .filter(
                (a) =>
                  a.subtype === "Link" && /^https?:\/\//i.test(a.url || ""),
              )
              .map((a) => {
                const v = page.getViewport({ scale: 1 });
                const r = [
                  ...v.convertToViewportPoint(a.rect[0], a.rect[1]),
                  ...v.convertToViewportPoint(a.rect[2], a.rect[3]),
                ];
                return {
                  url: a.url,
                  left: Math.min(r[0], r[2]),
                  top: Math.min(r[1], r[3]),
                  width: Math.abs(r[2] - r[0]),
                  height: Math.abs(r[3] - r[1]),
                };
              }),
          );
        const content = await page.getTextContent();
        if (canceled) return;
        textLayer = new TextLayer({
          textContentSource: content,
          container: layer,
          viewport,
        });
        await textLayer.render();
        if (canceled) return;
        paint.current.replaceChildren(canvas, layer);
        setPaintScale(zoom);
        setError("");
      } catch (e) {
        if (!canceled && e.name !== "RenderingCancelledException")
          setError(e.message);
      }
    }, 70);
    return () => {
      canceled = true;
      clearTimeout(timer);
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, number, zoom, near]);
  return (
    <AnnotationSurface
      {...annotation}
      rootRef={root}
      textRef={paint}
      page={number}
      pageScale={zoom}
      className="pdfPage"
      data-page={number}
      style={{ width: size.width * zoom, height: size.height * zoom }}
      tabIndex={0}
      aria-label={"Page " + number}
      onReadDoubleClick={(e) => {
        e.preventDefault();
        const r = root.current.getBoundingClientRect();
        onSource?.({
          page: number,
          x: (e.clientX - r.left) / zoom,
          y: (e.clientY - r.top) / zoom,
        });
      }}
    >
      <div
        ref={paint}
        className="pdfPaint"
        style={{
          width: size.width * paintScale,
          height: size.height * paintScale,
          transform: `scale(${zoom / paintScale})`,
        }}
      />
      {links.map((link, i) => (
        <a
          key={i}
          data-annotation-ui="true"
          className="pdfLink"
          aria-label={"Open " + link.url}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          style={{
            position: "absolute",
            zIndex: 4,
            left: link.left * zoom,
            top: link.top * zoom,
            width: link.width * zoom,
            height: link.height * zoom,
          }}
        />
      ))}
      {error && (
        <p className="pdfPageError" role="alert">
          Could not render page {number}: {error}
        </p>
      )}
      {markers
        .filter((m) => m.page === number)
        .map((m, i) => (
          <span
            key={i}
            className="pdfCommentMarker"
            style={{ left: m.x * zoom, top: m.y * zoom }}
            title="Commented location"
          />
        ))}
    </AnnotationSurface>
  );
});

export default function PdfReader({
  url,
  title = "PDF document",
  onSource,
  location,
  markers = emptyMarkers,
  annotation,
  layoutKey,
}) {
  const [doc, setDoc] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(0.9),
    [fit, setFit] = useState(true);
  const container = useRef(),
    reader = useRef(),
    zoomRef = useRef(zoom),
    fitRef = useRef(true),
    anchor = useRef(),
    frame = useRef();
  zoomRef.current = zoom;
  function fitWidth() {
    fitRef.current = true;
    setFit(true);
  }
  useEffect(() => {
    let canceled = false;
    setDoc(null);
    setError("");
    setPage(1);
    fitWidth();
    container.current.scrollTop = 0;
    const task = getDocument({ url, isEvalSupported: false });
    (async () => {
      try {
        const pdf = await task.promise;
        const sizes = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const p = await pdf.getPage(i);
          if (canceled) return;
          const v = p.getViewport({ scale: 1 });
          sizes.push({ width: v.width, height: v.height });
        }
        if (!canceled) setDoc({ pdf, sizes });
      } catch (e) {
        if (!canceled) setError(e.message);
      }
    })();
    return () => {
      canceled = true;
      void task.destroy();
    };
  }, [url]);
  useEffect(() => {
    const panel = reader.current?.closest(".documentReader");
    const changing = () =>
      remember(undefined, container.current.getBoundingClientRect().top + 40);
    panel?.addEventListener("axiovela-reader-layout", changing);
    return () => panel?.removeEventListener("axiovela-reader-layout", changing);
  }, []);
  function remember(clientX, clientY) {
    const el = container.current,
      r = el.getBoundingClientRect(),
      x = clientX == null ? el.clientWidth / 2 : clientX - r.left,
      y = clientY == null ? el.clientHeight / 2 : clientY - r.top;
    const items = [...el.querySelectorAll(".pdfPage")];
    const target =
      items.find((p) => p.getBoundingClientRect().bottom > r.top + y) ||
      items.at(-1);
    if (target) {
      const box = target.getBoundingClientRect();
      anchor.current = {
        number: Number(target.dataset.page),
        x: (r.left + x - box.left) / zoomRef.current,
        y: (r.top + y - box.top) / zoomRef.current,
        screenX: x,
        screenY: y,
      };
    }
  }
  function scale(value, x, y) {
    remember(x, y);
    fitRef.current = false;
    setFit(false);
    zoomRef.current = clamp(value);
    setZoom(zoomRef.current);
  }
  useLayoutEffect(() => {
    const a = anchor.current,
      el = container.current;
    if (!a) return;
    const target = el.querySelector(`[data-page="${a.number}"]`);
    if (target) {
      const r = el.getBoundingClientRect(),
        box = target.getBoundingClientRect();
      el.scrollLeft += box.left - r.left + a.x * zoom - a.screenX;
      el.scrollTop += box.top - r.top + a.y * zoom - a.screenY;
    }
    anchor.current = null;
  }, [zoom, layoutKey]);
  useEffect(() => {
    if (!doc || !fit) return;
    const el = container.current;
    const resize = () => {
      if (!fitRef.current || el.clientWidth < 40 || el.closest("[inert]"))
        return;
      const next = clamp(
        (el.clientWidth - 36) / Math.max(...doc.sizes.map((s) => s.width)),
      );
      if (Math.abs(next - zoomRef.current) > 0.001) {
        remember(undefined, el.getBoundingClientRect().top + 40);
        zoomRef.current = next;
        setZoom(next);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => observer.disconnect();
  }, [doc, fit]);
  function go(number, y = 0) {
    const el = container.current,
      target = el.querySelector(`[data-page="${number}"]`);
    if (!target) return;
    el.scrollTop +=
      target.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      y * zoomRef.current -
      18;
    setPage(number);
  }
  useEffect(() => {
    if (location && doc) go(location.page, Math.max(0, location.y - 50));
  }, [location, doc]);
  useEffect(() => {
    const el = reader.current;
    const wheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        scale(
          zoomRef.current * Math.exp(-e.deltaY * 0.01),
          e.clientX,
          e.clientY,
        );
      }
    };
    const key = (e) => {
      if (el.closest("[inert]")) return;
      if (
        !el.closest(".expandedPanel") &&
        !el.contains(document.activeElement) &&
        !el.matches(":hover")
      )
        return;
      if (!(e.ctrlKey || e.metaKey) || !["+", "=", "-", "0"].includes(e.key))
        return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "0") fitWidth();
      else scale(zoomRef.current * (e.key === "-" ? 1 / 1.15 : 1.15));
    };
    const native = (e) => {
      if (el.closest("[inert]")) return;
      if (
        !el.closest(".expandedPanel") &&
        !el.contains(document.activeElement) &&
        !el.matches(":hover")
      )
        return;
      e.preventDefault();
      if (e.detail === "reset") fitWidth();
      else scale(zoomRef.current * (e.detail === "out" ? 1 / 1.15 : 1.15));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("keydown", key);
    window.addEventListener("axiovela-reader-zoom", native);
    return () => {
      el.removeEventListener("wheel", wheel);
      document.removeEventListener("keydown", key);
      window.removeEventListener("axiovela-reader-zoom", native);
    };
  }, []);
  function scrolled() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = container.current.getBoundingClientRect();
      const closest = [...container.current.querySelectorAll(".pdfPage")].find(
        (p) =>
          p.getBoundingClientRect().bottom >
          r.top + Math.min(100, r.height / 3),
      );
      if (closest) setPage(Number(closest.dataset.page));
    });
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return (
    <div
      ref={reader}
      className="pdfReader"
      role="region"
      aria-label={title}
      tabIndex={0}
      data-zoom={zoom.toFixed(3)}
    >
      <div className="pdfToolbar">
        <button
          disabled={!doc || page <= 1}
          onClick={() => go(page - 1)}
          aria-label="Previous PDF page"
        >
          ‹
        </button>
        <label>
          Page{" "}
          <input
            aria-label="PDF page number"
            type="number"
            min={1}
            max={doc?.sizes.length || 1}
            value={page}
            onChange={(e) =>
              go(
                Math.max(
                  1,
                  Math.min(doc?.sizes.length || 1, Number(e.target.value) || 1),
                ),
              )
            }
          />
        </label>
        <span>of {doc?.sizes.length || "…"}</span>
        <button
          disabled={!doc || page >= doc.sizes.length}
          onClick={() => go(page + 1)}
          aria-label="Next PDF page"
        >
          ›
        </button>
        <button
          onClick={() => scale(zoomRef.current / 1.15)}
          aria-label="Zoom out PDF"
        >
          −
        </button>
        <button aria-pressed={fit} onClick={fitWidth}>
          Fit width
        </button>
        <button
          onClick={() => scale(zoomRef.current * 1.15)}
          aria-label="Zoom in PDF"
        >
          +
        </button>
        <span className="pdfZoomValue">{Math.round(zoom * 100)}%</span>
      </div>
      <div ref={container} className="pdfCanvasScroll" onScroll={scrolled}>
        {error ? (
          <p role="alert">Could not display this PDF: {error}</p>
        ) : doc ? (
          doc.sizes.map((size, i) => (
            <PdfPage
              key={i}
              pdf={doc.pdf}
              size={size}
              number={i + 1}
              zoom={zoom}
              container={container}
              onSource={onSource}
              markers={markers}
              annotation={annotation}
            />
          ))
        ) : (
          <p role="status">Loading PDF…</p>
        )}
      </div>
    </div>
  );
}
