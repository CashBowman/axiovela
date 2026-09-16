import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export const CONTENT_VERSION = 3;
export function readableTitle(value) {
  const title = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return title.length >= 4 &&
    title.length <= 400 &&
    !/\.(?:html?|pdf)(?:$|\s)/i.test(title) &&
    !/[a-f0-9]{24}/i.test(title) &&
    !/^(?:untitled|document|download|abstract|home|access denied|just a moment)[.!… ]*$/i.test(
      title,
    )
    ? title
    : "";
}
function safeLink(value, base) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, base);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
// Retain mathematics before Readability removes scripts or duplicated rendered math.
export function extractArticle(html, base = "https://example.invalid/") {
  const { document } = parseHTML(html);
  const meta = (name) =>
    document
      .querySelector(`meta[name="${name}"],meta[property="${name}"]`)
      ?.getAttribute("content") || "";
  const title =
    [
      meta("citation_title"),
      meta("og:title"),
      document.querySelector("h1")?.textContent,
      document.title,
    ]
      .map(readableTitle)
      .find(Boolean) || "";
  const pdf = safeLink(
    meta("citation_pdf_url") ||
      [...document.querySelectorAll("a[href]")]
        .find(
          (a) =>
            /\.pdf(?:$|[?#])/i.test(a.getAttribute("href")) &&
            /^(?:pdf|download(?: paper)?(?: pdf)?|view pdf|paper)$/i.test(
              a.textContent.trim(),
            ),
        )
        ?.getAttribute("href"),
    base,
  );
  const authors = [...document.querySelectorAll('meta[name="citation_author"]')]
    .map((n) => n.getAttribute("content"))
    .filter(Boolean);
  for (const node of [
    ...document.querySelectorAll('script[type^="math/tex"],.katex,math'),
  ]) {
    if (!node.parentNode) continue;
    const tex =
      node.tagName.toLowerCase() === "script"
        ? node.textContent
        : node.querySelector('annotation[encoding="application/x-tex"]')
            ?.textContent;
    if (tex)
      node.replaceWith(
        document.createTextNode(
          /mode=display/.test(node.getAttribute("type") || "") ||
            node.closest(".katex-display") ||
            node.getAttribute("display") === "block"
            ? "\n\n$$\n" + tex + "\n$$\n\n"
            : "$" + tex + "$",
        ),
      );
  }
  document
    .querySelectorAll("script,style,nav,form,button,iframe,svg")
    .forEach((n) => n.remove());
  const fallback = document.querySelector("article,main")?.cloneNode(true);
  const article = new Readability(document).parse();
  const body = parseHTML(
    article?.content || fallback?.outerHTML || "",
  ).document;
  function md(node) {
    if (node.nodeType === 3) return node.textContent;
    const tag = node.tagName?.toLowerCase();
    const inner = () => [...node.childNodes].map(md).join("");
    if (["script", "style", "iframe", "svg"].includes(tag)) return "";
    if (/^h[1-6]$/.test(tag))
      return (
        "\n\n" + "#".repeat(Number(tag[1])) + " " + inner().trim() + "\n\n"
      );
    if (tag === "pre")
      return "\n\n```\n" + node.textContent.trim() + "\n```\n\n";
    if (tag === "code") return "`" + node.textContent.replace(/`/g, "") + "`";
    if (tag === "br") return "\n";
    if (tag === "a") {
      const url = safeLink(node.getAttribute("href"), base);
      return url
        ? "[" + inner().trim().replace(/\]/g, "\\]") + "](" + url + ")"
        : inner();
    }
    if (tag === "img") {
      const url = safeLink(node.getAttribute("src"), base);
      return url
        ? "\n\n![" +
            (node.getAttribute("alt") || "Article figure").replace(
              /[\[\]]/g,
              "",
            ) +
            "](" +
            url +
            ")\n\n"
        : "";
    }
    if (["strong", "b"].includes(tag)) return "**" + inner() + "**";
    if (["em", "i"].includes(tag)) return "*" + inner() + "*";
    if (tag === "li") return "\n- " + inner().trim() + "\n";
    if (tag === "tr")
      return (
        "\n" + [...node.children].map((n) => md(n).trim()).join(" | ") + "\n"
      );
    if (
      ["p", "div", "section", "blockquote", "ul", "ol", "table"].includes(tag)
    )
      return "\n\n" + inner().trim() + "\n\n";
    return inner();
  }
  const text = md(body)
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 100000);
  return {
    canonicalUrl: safeLink(
      document.querySelector("link[rel=canonical]")?.getAttribute("href"),
      base,
    ),
    doi: meta("citation_doi"),
    published:
      meta("citation_publication_date") || meta("article:published_time"),
    title: title || readableTitle(article?.title),
    text,
    contentVersion: CONTENT_VERSION,
    authors: authors.length ? authors : article?.byline ? [article.byline] : [],
    pdfUrl: pdf,
  };
}
