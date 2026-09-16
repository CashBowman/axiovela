// Bibliography metadata is deliberately minimal; unknown authors/dates are not invented.
const bibText = (value) =>
  String(value)
    .replace(/[\\{}%&#_$]/g, (c) => "\\" + c)
    .replace(/[\r\n]+/g, " ");
function generatedEntry(p) {
  return (
    "@misc{" +
    p.citationKey +
    ",\n  title = {" +
    bibText(p.title) +
    "}," +
    (p.sourceUrl ? "\n  url = {" + bibText(p.sourceUrl) + "}," : "") +
    (p.authors?.length
      ? "\n  author = {" + p.authors.map(bibText).join(" and ") + "},"
      : "") +
    (p.published
      ? "\n  year = {" + bibText(p.published.slice(0, 4)) + "},"
      : "") +
    (p.doi ? "\n  doi = {" + bibText(p.doi) + "}," : "") +
    (p.arxivId
      ? "\n  eprint = {" + bibText(p.arxivId) + "},\n  archivePrefix = {arXiv},"
      : "") +
    "\n  note = {" +
    (p.sourceType === "web"
      ? "Web source"
      : "Imported PDF; bibliographic metadata needs review") +
    "}\n}\n"
  );
}
// Aliases keep old citations and saved files reachable after records are consolidated.
export function sourceAliases(p) {
  return [
    ...new Set(
      [
        p.id,
        p.sourceUrl,
        p.canonicalUrl,
        p.localPath,
        p.originalName,
        ...(p.aliases || []),
      ].filter(Boolean),
    ),
  ];
}
const normalizedTitle = (p) =>
  String(p.title || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
function identity(p) {
  const keys = [
    p.id,
    p.sourceUrl,
    p.canonicalUrl,
    p.originalPath,
    p.localPath,
    ...(p.aliases || []).filter(
      (x) => /^https?:\/\//.test(x) || /^[a-f0-9-]{32,36}$/.test(x),
    ),
  ]
    .filter(Boolean)
    .map((x) => "ref:" + x.replace(/#.*$/, ""));
  if (p.contentHash) keys.push("hash:" + p.contentHash);
  if (p.doi)
    keys.push(
      "doi:" +
        p.doi.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi.org\//, ""),
    );
  const arxiv =
    p.arxivId || p.sourceUrl?.match(/arxiv.org\/(?:abs|pdf)\/([^?#]+)/)?.[1];
  if (arxiv)
    keys.push("arxiv:" + arxiv.replace(/\.pdf$/, "").replace(/v\d+$/, ""));
  // Bibliographic identity only: titles alone never establish equivalence.
  return keys;
}
export function addLibrarySources(project, incoming = []) {
  const papers = [],
    index = new Map();
  let bibliography = project.bibliography || "";
  const aliases = new Map(),
    mergedIds = [];
  for (const row of [...project.papers, ...incoming]) {
    const old = identity(row)
      .map((k) => index.get(k))
      .find(Boolean);
    if (!old) {
      const next = { ...row };
      papers.push(next);
      for (const k of identity(next)) index.set(k, next);
      continue;
    }
    if (row.id === old.id && !row.contentVersion) continue;
    if (
      row.id === old.id &&
      row.contentVersion === old.contentVersion &&
      row.capturedAt === old.capturedAt
    )
      continue;
    const prior = { ...old };
    const upgrade = row.contentVersion && row.capturedAt !== old.capturedAt;
    // Keep the first (usually user-imported) identity and PDF; retain every alternate URL/file.
    const pdf =
      row.sourceType === "pdf" && upgrade
        ? row
        : old.sourceType === "pdf"
          ? old
          : row.sourceType === "pdf"
            ? row
            : null;
    const notes =
      old.notes && row.notes && !old.notes.includes(row.notes)
        ? old.notes + "\n\n" + row.notes
        : old.notes || row.notes || "";
    Object.assign(old, {
      ...row,
      ...old,
      ...(upgrade ? row : {}),
      id: prior.id,
      title: prior.titleEdited
        ? prior.title
        : upgrade
          ? row.title
          : prior.title,
      titleEdited: prior.titleEdited,
      notes,
      read: !!(prior.read || row.read),
      citationKey: prior.citationKey || row.citationKey,
      discovered: !!prior.discovered,
      ...(pdf === old
        ? {
            annotationRevision:
              prior.annotationRevision ||
              prior.contentHash ||
              prior.capturedAt ||
              prior.id,
            text: prior.text,
            contentHash: prior.contentHash,
          }
        : {}),
      aliases: [
        ...new Set([...sourceAliases(prior), ...sourceAliases(row)]),
      ].sort(),
      ...(pdf
        ? {
            sourceType: "pdf",
            pdfId: pdf.pdfId || pdf.id,
            contentHash: pdf.contentHash,
          }
        : {}),
    });
    if (prior.citationKey && bibliography.includes(generatedEntry(prior)))
      bibliography = bibliography.replace(
        generatedEntry(prior),
        generatedEntry(old),
      );
    if (row.id !== old.id) {
      aliases.set(row.id, old.id);
      mergedIds.push(row.id);
    }
    for (const k of identity(old)) index.set(k, old);
  }
  for (const p of [...papers, ...project.papers, ...incoming])
    if (p.citationKey && !bibliography.includes("{" + p.citationKey + ","))
      bibliography += "\n\n" + generatedEntry(p);
  const patch = {};
  if (JSON.stringify(papers) !== JSON.stringify(project.papers))
    patch.papers = papers;
  if (bibliography !== project.bibliography) patch.bibliography = bibliography;
  if (mergedIds.some((id) => project.papers.some((p) => p.id === id))) {
    const endpoint = (x) =>
      x?.startsWith("paper:") && aliases.has(x.slice(6))
        ? "paper:" + aliases.get(x.slice(6))
        : x;
    patch.links = (project.links || [])
      .map((l) => ({ ...l, from: endpoint(l.from), to: endpoint(l.to) }))
      .filter(
        (l, i, a) =>
          l.from !== l.to &&
          a.findIndex(
            (x) => x.from === l.from && x.to === l.to && x.type === l.type,
          ) === i,
      );
    // Annotation targets retain their original IDs/revisions through aliases.
    // Preserve full original records for reversible migration, including conflicting metadata.
    patch.sourceMergeHistory = [
      ...(project.sourceMergeHistory || []),
      {
        at: new Date().toISOString(),
        papers: project.papers.filter((p) => mergedIds.includes(p.id)),
        links: project.links || [],
      },
    ];
  }
  return patch;
}
