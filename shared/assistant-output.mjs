// Provider output is untrusted text. These directives describe UI attachments only.
export const unescapeAttribute = (value) => {
  try {
    return JSON.parse('"' + value.replace(/\\([_\[\]])/g, "$1") + '"');
  } catch {
    return value.replace(/\\([_"\\])/g, "$1");
  }
};
const attr = (text, key) => {
  const match = text.match(
    new RegExp("(?:^|\\s)" + key + '="((?:\\\\.|[^"\\\\])*)"'),
  );
  return match ? unescapeAttribute(match[1]) : "";
};
// Import/render directives only in prose, never inside code or JSON data.
function mapProse(source, transform, keepCode = true) {
  try {
    const value = JSON.parse(source);
    if (value && typeof value === "object") return keepCode ? source : "";
  } catch {}
  let fence = null,
    prose = "",
    result = "";
  const flush = () => {
    result += prose
      .split(/(`+[^`]*`+)/g)
      .map((part) =>
        part.startsWith("`") ? (keepCode ? part : "") : transform(part),
      )
      .join("");
    prose = "";
  };
  for (const line of source.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (keepCode) result += line;
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !line.slice(marker[0].length).trim()
      )
        fence = null;
    } else if (marker) {
      flush();
      fence = marker[1];
      if (keepCode) result += line;
    } else prose += line;
  }
  flush();
  return result;
}
export const assistantProse = (source) =>
  mapProse(source, (text) => text, false);
export function outputDirectives(source = "") {
  const references = [],
    followups = [];
  const text = mapProse(source, (prose) =>
    prose
      .replace(
        /:{1,2}codex-file-citation\{((?:"(?:\\.|[^"\\])*"|[^}"])*?)\}/g,
        (_, attributes) => {
          const path = attr(attributes, "path");
          if (!path) return "[Source unavailable]";
          const index = references.push({ path }) - 1;
          return `[Source ${index + 1}](axiovela-source:${index})`;
        },
      )
      .replace(
        /:{1,2}codex-followup\[([^\]]+)\]\{((?:"(?:\\.|[^"\\])*"|[^}"])*?)\}/g,
        (_, label, attributes) => {
          const prompt = attr(attributes, "prompt");
          if (!prompt) return label;
          const index = followups.push({ label, prompt }) - 1;
          return `[${label}](axiovela-followup:${index})`;
        },
      ),
  );
  return { text, references, followups };
}
export function sourceForReference(reference, sources = []) {
  const name = reference.path.replaceAll("\\", "/").split("/").at(-1);
  return sources.find(
    (p) =>
      (p.aliases || []).some(
        (a) =>
          a === reference.path ||
          name === a + ".pdf" ||
          a.split("/").at(-1) === name,
      ) ||
      p.localPath === reference.path ||
      p.sourceUrl === reference.path ||
      name === `${p.id}.pdf` ||
      p.originalName === name,
  );
}
// Code fences around an entire prose document are an LLM transport wrapper.
// Never unwrap a code example embedded within a document.
export function proseDocument(source = "") {
  const match = source
    .trim()
    .match(/^```(?:markdown|md)\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1] : source;
}
