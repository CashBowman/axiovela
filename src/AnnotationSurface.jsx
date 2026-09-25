import {MessageSquarePlus} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  feedbackExcluded,
  capturePassage,
  hasContentMutation,
  textProjection,
  rangeFromAnchor,
  rangeRects,
} from "./annotation-dom.mjs";

const emptyAnnotations = [];
export default function AnnotationSurface({
  children,
  rootRef,
  textRef,
  className = "",
  annotating = false,
  annotations = emptyAnnotations,
  draft,
  onCapture,
  onSelect,
  onDraftRect,
  onReadDoubleClick,
  page,
  pageScale = 1,
  ...props
}) {
  const captureTimer = useRef();
  useEffect(() => () => clearTimeout(captureTimer.current), []);
  const own = useRef(),
    root = rootRef || own,
    callbacks = useRef();
  callbacks.current = { onCapture, onSelect, onDraftRect };
  const [marks, setMarks] = useState([]);
  const [images, setImages] = useState([]);
  useEffect(() => {
    const element=root.current, target=textRef?.current || element;
    if(!element || !annotating)return;
    let frame;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const base=element.getBoundingClientRect();
      const next=[...target.querySelectorAll('img')].flatMap((img,index)=>{
        if(img.closest('[data-image-feedback]') || img.closest('.annotationSurface')!==element)return [];
        const r=img.getBoundingClientRect();if(r.width<48||r.height<48)return [];
        resize.observe(img);
        return [{index,src:img.getAttribute('src'),quote:img.alt||'Image',line:Number(img.closest('[data-source-line]')?.dataset.sourceLine)||undefined,left:r.right-base.left-34,top:r.bottom-base.top-34}];
      });
      setImages(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
    });};
    const resize=new ResizeObserver(update);resize.observe(element);
    const mutation=new MutationObserver(records => { if (hasContentMutation(records)) update(); });mutation.observe(target,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
    target.addEventListener('load',update,true);window.addEventListener('resize',update);document.addEventListener('scroll',update,true);update();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();target.removeEventListener('load',update,true);window.removeEventListener('resize',update);document.removeEventListener('scroll',update,true);};
  },[annotating,textRef,pageScale]);
  useEffect(() => {
    const element = root.current,
      target = textRef?.current || element;
    if (!element || !target) return;
    if (
      !annotations.some((item) => !page || item.anchor.page === page) &&
      (!draft || (page && draft.page !== page))
    ) {
      setMarks((old) => (old.length ? [] : old));
      return;
    }
    let frame,
      disposed = false;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(async () => {
        const projection = textProjection(target),
          base = element.getBoundingClientRect();
        const panelHash = annotations.some((n) => n.target?.panelHash)
          ? [
              ...new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  new TextEncoder().encode(projection.text),
                ),
              ),
            ]
              .map((x) => x.toString(16).padStart(2, "0"))
              .join("")
          : "";
        if (disposed) return;
        const next = [
          ...annotations,
          ...(draft ? [{ id: "draft", anchor: draft }] : []),
        ].flatMap((item) => {
          if (page && item.anchor.page !== page) return [];
          if (
            item.target?.kind === "snapshot" &&
            (item.target.panelHash
              ? item.target.panelHash !== panelHash
              : item.target.source !== projection.text)
          )
            return [];
          const figure =
            item.anchor.kind === "figure"
              ? [...target.querySelectorAll("img")][item.anchor.figureIndex]
              : null;
          const box = figure?.getBoundingClientRect();
          const rects =
            box && figure.getAttribute("src") === item.anchor.asset
              ? [
                  {
                    left: box.left - base.left,
                    top: box.top - base.top,
                    width: box.width,
                    height: box.height,
                  },
                ]
              : item.anchor.kind === "figure" ? [] : rangeRects(rangeFromAnchor(projection, item.anchor), element);
          if (item.id === "draft" && rects.length) {
            const r = rects.at(-1);
            callbacks.current.onDraftRect?.({
              left: base.left + r.left,
              top: base.top + r.top,
              width: r.width,
              height: r.height,
            });
          }
          return rects.length ? [{ ...item, rects }] : [];
        });
        setMarks((old) =>
          JSON.stringify(old) === JSON.stringify(next) ? old : next,
        );
      });
    };
    const resize = new ResizeObserver(update);
    resize.observe(element);
    const mutation = new MutationObserver(records => { if (hasContentMutation(records)) update(); });
    mutation.observe(target, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [annotations, draft, page, textRef, pageScale]);
  function capture(event, exact = false) {
    if (!event.target?.isConnected || root.current?.closest("[inert]")) return;
    if (
      !annotating ||
      event.target.closest(
        feedbackExcluded + ",a,img",
      )
    )
      return;
    if (event.target.closest(".annotationSurface") !== root.current) return;
    const target = textRef?.current || root.current;
    const projection = textProjection(target);
    const anchor = capturePassage(target, event, { exact, projection });
    if (anchor) {
      const rects = rangeRects(rangeFromAnchor(projection, anchor), root.current);
      const rect = rects[0], last = rects.at(-1), base = root.current.getBoundingClientRect();
      const position = last && {left:base.left+last.left,top:base.top+last.top,width:last.width,height:last.height};
      callbacks.current.onCapture?.({
        ...anchor,
        ...(event.type === "keydown" ? { focusFeedback: true } : {}),
        ...(page
          ? {
              page,
              x: (rect?.left || 0) / pageScale,
              y: (rect?.top || 0) / pageScale,
            }
          : {}),
      }, position, projection);
    }
  }
  let lastPinTop = -24;
  const positioned = [...marks]
    .sort((a, b) => a.rects[0].top - b.rects[0].top)
    .map((m) => {
      const pinTop = Math.max(m.rects[0].top, lastPinTop + 24);
      if (m.id !== "draft") lastPinTop = pinTop;
      return { ...m, pinTop };
    });
  return (
    <div
      {...props}
      ref={root}
      className={
        "annotationSurface " + className + (annotating ? " isAnnotating" : "")
      }
      onMouseUp={(e) => {
        clearTimeout(captureTimer.current);
        if (e.button !== 0 || e.detail > 1) return;
        if (!window.getSelection()?.isCollapsed) capture(e);
        else {
          const event = {
            target: e.target,
            clientX: e.clientX,
            clientY: e.clientY,
          };
          captureTimer.current = setTimeout(() => capture(event), 260);
        }
      }}
      onDoubleClickCapture={(e) => {
        clearTimeout(captureTimer.current);
        window.dispatchEvent(new Event("axiovela-dismiss-feedback"));
        onReadDoubleClick?.(e);
      }}
      onKeyDown={(e) => {
        if (annotating && e.altKey && e.key.toLowerCase() === "m") {
          e.preventDefault();
          capture(e);
        }
      }}
    >
      {children}
      <div className="annotationOverlay" data-annotation-ui="true">
        {annotating && images.map(img=><button key={img.index} type="button" className="figureFeedbackButton surfaceFigureFeedback" style={{left:img.left,top:img.top}} aria-label={'Add feedback on '+img.quote} title="Add image feedback" onMouseUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();callbacks.current.onCapture?.({kind:'figure',figureIndex:img.index,asset:img.src,quote:img.quote,start:0,end:img.quote.length,line:img.line,focusFeedback:true}, (textRef?.current || root.current).querySelectorAll('img')[img.index]?.getBoundingClientRect());}}><MessageSquarePlus size={16}/></button>)}
        {positioned.map((mark) => (
          <React.Fragment key={mark.id}>
            {mark.rects.map((r, i) => (
              <span
                key={i}
                className={
                  "passageHighlight " +
                  (mark.id === "draft" ? "draftHighlight" : "") +
                  (mark.active ? " activeHighlight" : "")
                }
                style={r}
              />
            ))}
            {mark.id !== "draft" && (
              <button
                className={"annotationPin " + (mark.active ? "activePin" : "")}
                style={{ right: 2, top: mark.pinTop }}
                aria-label={"Comment " + mark.number}
                title={"Comment " + mark.number}
                data-annotation-id={mark.id}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  callbacks.current.onSelect?.(mark.id, e.currentTarget.getBoundingClientRect());
                }}
              >
                {mark.number}
              </button>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
