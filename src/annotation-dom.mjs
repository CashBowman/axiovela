import { sentenceBounds, quoteAnchor } from "../shared/annotations.mjs";

// Keep overlays out of the text tree. The projection is rebuilt after reflow,
// and synthetic block separators never become DOM offsets.
export function textProjection(root) {
  const entries = [];
  const pdf = root.classList.contains("textLayer") || !!root.querySelector(".textLayer");
  let text = "",
    previousBlock = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return !node.textContent ||
        (!node.textContent.trim() &&
          !node.parentElement.closest(
            "p,li,pre,td,th,h1,h2,h3,h4,blockquote,.textLayer",
          )) ||
        node.parentElement?.closest(
          ".katex-mathml,script,style,button,input,textarea,select,[data-annotation-ui],[inert],.hiddenLibraryView",
        )
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  let node;
  while ((node = walker.nextNode())) {
    const block =
      node.parentElement.closest(
        "p,li,h1,h2,h3,h4,pre,blockquote,.textLayer > span,figure,td,.katex-display",
      ) || root;
    if (previousBlock && previousBlock !== block && !/\s$/.test(text))
      text +=
        pdf
          ? "\n"
          : "\n\n";
    entries.push({
      node,
      start: text.length,
      end: text.length + node.textContent.length,
    });
    text += node.textContent;
    previousBlock = block;
  }
  return { text, entries };
}
export function rangeFromAnchor(projection, anchor) {
  if (
    !Number.isInteger(anchor?.start) ||
    !Number.isInteger(anchor?.end) ||
    projection.text.slice(anchor.start, anchor.end) !== anchor.quote
  )
    return null;
  const first = projection.entries.find((e) => e.end > anchor.start),
    last = projection.entries.find((e) => e.end >= anchor.end);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, Math.max(0, anchor.start - first.start));
  range.setEnd(last.node, Math.min(last.node.length, anchor.end - last.start));
  return range;
}
function offset(projection, node, at) {
  const entry = projection.entries.find((e) => e.node === node);
  if (entry) return entry.start + at;
  const child = node.childNodes?.[at];
  const next = projection.entries.find(
    (e) => child === e.node || child?.contains(e.node),
  );
  if (next) return next.start;
  const inside = projection.entries.filter((e) => node.contains?.(e.node));
  return inside.at(-1)?.end;
}
export function capturePassage(root, event, { exact = false, projection = textProjection(root) } = {}) {
  if (!projection.text.trim()) return null;
  const selection = window.getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const clickedBlock = event?.target?.closest(".katex-display,pre");
  if (
    clickedBlock &&
    root.contains(clickedBlock) &&
    (!range || range.collapsed)
  ) {
    const entries = projection.entries.filter((e) =>
      clickedBlock.contains(e.node),
    );
    if (entries.length) {
      const anchor = quoteAnchor(
        projection.text,
        entries[0].start,
        entries.at(-1).end,
      );
      const line =
        clickedBlock.closest("[data-source-line]")?.dataset.sourceLine;
      return { ...anchor, ...(line ? { line: Number(line) } : {}) };
    }
  }
  if (
    !range ||
    range.collapsed ||
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    if (event?.clientX === undefined) return null;
    const caret = document.caretPositionFromPoint?.(
      event.clientX,
      event.clientY,
    );
    if (caret) {
      range = document.createRange();
      range.setStart(caret.offsetNode, caret.offset);
      range.collapse(true);
    } else range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
  }
  if (
    !range ||
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null;
  let start = offset(projection, range.startContainer, range.startOffset),
    end = offset(projection, range.endContainer, range.endOffset);
  if (start === undefined || end === undefined) return null;
  const block =
    range.startContainer.parentElement?.closest(".katex-display,pre");
  if (block && range.collapsed) {
    const entries = projection.entries.filter((e) => block.contains(e.node));
    start = entries[0]?.start;
    end = entries.at(-1)?.end;
  } else if (!exact || start === end)
    ({ start, end } = sentenceBounds(projection.text, start, end));
  if (end <= start) return null;
  const anchor = quoteAnchor(projection.text, start, end),
    selected = rangeFromAnchor(projection, anchor);
  if (!selected) return null;
  const line =
    selected.startContainer.parentElement?.closest("[data-source-line]")
      ?.dataset.sourceLine;
  return { ...anchor, ...(line ? { line: Number(line) } : {}) };
}
export function rangeRects(range, root) {
  if (!range) return [];
  const base = root.getBoundingClientRect(),
    rows = [];
  for (const r of range.getClientRects()) {
    if (r.width < 1 || r.height < 1) continue;
    const next = {
      left: r.left - base.left,
      top: r.top - base.top,
      width: r.width,
      height: r.height,
    };
    const row = rows.find(
      (x) =>
        Math.abs(x.top - next.top) < 2 &&
        Math.abs(x.height - next.height) < 3 &&
        next.left <= x.left + x.width + 3 &&
        next.left + next.width >= x.left - 3,
    );
    if (row) {
      const right = Math.max(row.left + row.width, next.left + next.width);
      row.left = Math.min(row.left, next.left);
      row.width = right - row.left;
    } else rows.push(next);
  }
  return rows;
}

// Overlay highlights and pins must not invalidate the document they measure.
export function hasContentMutation(records) {
  const overlay = node => (node.nodeType === 1 ? node : node.parentElement)?.closest?.('[data-annotation-ui]');
  return records.some(record => {
    if (overlay(record.target)) return false;
    if (record.type !== 'childList') return true;
    return [...record.addedNodes, ...record.removedNodes].some(node => !overlay(node));
  });
}
