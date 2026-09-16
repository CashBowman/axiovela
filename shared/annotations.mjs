// Sentence boundaries are a selection aid. Quotes and offsets identify the exact
// displayed passage; only the matching manuscript revision may use that anchor.
export function sentenceBounds(text, start, end = start) {
  start = Math.max(0, Math.min(text.length, start));
  end = Math.max(start, Math.min(text.length, end));
  if (start === end && start === text.length && start > 0) start--;
  const segments = [];
  let index = 0;
  for (const paragraph of text.split("\n\n")) {
    for (const s of new Intl.Segmenter("en", {
      granularity: "sentence",
    }).segment(paragraph))
      segments.push({ ...s, index: s.index + index });
    index += paragraph.length + 2;
  }
  const first = segments.find((s) => start < s.index + s.segment.length);
  const last = segments.find(
    (s) => Math.max(start, end - 1) < s.index + s.segment.length,
  );
  let from = first?.index ?? start,
    to = last ? last.index + last.segment.length : end;
  while (/\s/.test(text[from] || "") && from < to) from++;
  while (/\s/.test(text[to - 1] || "") && to > from) to--;
  return { start: from, end: to };
}
export function quoteAnchor(text, start, end) {
  return {
    start,
    end,
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - 40), start),
    suffix: text.slice(end, end + 40),
  };
}
export function reviewDraft(output, format) {
  const language = format === "latex" ? "(?:latex|tex)" : "(?:markdown|md)";
  const matches = [
    ...output.matchAll(
      new RegExp(
        "^(`{3,})" + language + "[ \\t]*\\n([\\s\\S]*?)^\\1[ \\t]*$",
        "gm",
      ),
    ),
  ];
  if (matches.length !== 1 || !matches[0][2].trim())
    throw Error(
      "The reply needs one complete " +
        format +
        " draft before it can be applied. Ask the assistant for the complete revised draft.",
    );
  return matches[0][2];
}
export function changedPassage(before, after) {
  const a = before.split("\n"),
    b = after.split("\n");
  let first = 0,
    last = 0;
  while (first < a.length && first < b.length && a[first] === b[first]) first++;
  while (
    last < a.length - first &&
    last < b.length - first &&
    a.at(-1 - last) === b.at(-1 - last)
  )
    last++;
  const start = Math.max(0, first - 2);
  return {
    line: start + 1,
    before: a.slice(start, Math.min(a.length, a.length - last + 2)).join("\n"),
    after: b.slice(start, Math.min(b.length, b.length - last + 2)).join("\n"),
  };
}
