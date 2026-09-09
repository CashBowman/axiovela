// A drop targets the start of a source line, including in a scrolled/wrapped editor.
// Mirror layout rather than estimating with a fixed character or line height.
export function dropLineOffset(textarea, clientY) {
  const doc = textarea.ownerDocument;
  const style = doc.defaultView.getComputedStyle(textarea);
  const mirror = doc.createElement('div');
  for (const key of ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'tabSize']) mirror.style[key] = style[key];
  Object.assign(mirror.style, {position: 'fixed', left: '-10000px', top: '0', width: `${textarea.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`, borderStyle: 'solid', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word'});
  doc.body.append(mirror);
  const target = clientY - textarea.getBoundingClientRect().top + textarea.scrollTop;
  let offset = 0;
  try {
    for (const line of textarea.value.split('\n')) {
      const row = doc.createElement('div');
      row.textContent = line || '\u200b';
      mirror.append(row);
      if (target < row.getBoundingClientRect().bottom) return offset;
      offset += line.length + 1;
    }
    return textarea.value.length;
  } finally { mirror.remove(); }
}
export function insertBlock(source, snippet, offset) {
  const at = Math.max(0, Math.min(source.length, Number.isInteger(offset) ? offset : source.length));
  const before = source.slice(0, at);
  const after = source.slice(at);
  const prefix = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const suffix = after.startsWith('\n') ? '\n' : '\n\n';
  const inserted = `${prefix}${snippet}${suffix}`;
  return {source: before + inserted + after, caret: at + inserted.length};
}
