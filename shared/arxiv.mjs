// Accept identifiers, never an arbitrary fetch destination.
export function arxivId(input) {
  let value = String(input || "").trim();
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (
      !["arxiv.org", "www.arxiv.org", "export.arxiv.org"].includes(
        url.hostname,
      ) ||
      url.port ||
      url.username ||
      url.password
    )
      throw Error("Use an arxiv.org abstract or PDF link.");
    value = url.pathname.replace(/^\/(abs|pdf)\//, "").replace(/\.pdf$/i, "");
  } else value = value.replace(/^arxiv:\s*/i, "");
  if (
    !/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v[1-9]\d*)?$/.test(
      value,
    )
  )
    throw Error("Enter an arXiv URL or ID, for example 2302.03660.");
  return value;
}

export function arxivBibtex(paper) {
  const clean = (value) =>
    String(value || "")
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/[{}]/g, "")
      .replace(/[&%#_]/g, "\\$&")
      .replace(/\s+/g, " ")
      .trim();
  return `@misc{${paper.citationKey},\n  title = {${clean(paper.title)}},\n  author = {${paper.authors.map(clean).join(" and ")}},\n  year = {${paper.published.slice(0, 4)}},\n  eprint = {${paper.arxivId}},\n  archivePrefix = {arXiv},\n  url = {${paper.sourceUrl}}\n}`;
}
