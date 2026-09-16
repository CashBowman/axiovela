import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  importLibrary,
  libraryState,
  updateLibrary,
  libraryGraph,
  syncLibrary,
} from "../server/library.mjs";
import {
  saveAnnotation,
  listAnnotations,
  prepareAnnotations,
  revisionHash,
  annotationDocument,
} from "../server/annotations.mjs";
import { sentenceBounds, quoteAnchor } from "../shared/annotations.mjs";
import {
  extractArticle,
  publicAddress,
  fetchSource,
} from "../server/library-sources.mjs";
import { addLibrarySources } from "../shared/library.mjs";
const fixture = async (fn) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "axiovela-library-test-"),
  );
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};
test("sentence and multiple paragraph bounds preserve exact quote", () => {
  const text =
    "First sentence. Second sentence.\n\nThird paragraph. Final sentence.";
  const a = sentenceBounds(text, 18, 45);
  assert.equal(
    text.slice(a.start, a.end),
    "Second sentence.\n\nThird paragraph.",
  );
  assert.equal(
    quoteAnchor(text, a.start, a.end).quote,
    text.slice(a.start, a.end),
  );
});
test("web extraction preserves math, meaningful title and links; removes executable content", () => {
  const p = extractArticle(
    '<html><head><title>Abstract Conference.html</title><meta name="citation_title" content="Regression with uncertainty"><meta name="citation_author" content="A Researcher"></head><body><article><h1>Regression with uncertainty</h1><p>A measured result with <script type="math/tex">x^2</script> and enough readable content for a source snapshot.</p><p><a href="/paper">Evidence</a></p><script>alert(1)</script></article></body></html>',
    "https://example.org",
  );
  assert.equal(p.title, "Regression with uncertainty");
  assert.match(p.text, /\$x\^2\$/);
  assert.match(p.text, /https:\/\/example.org\/paper/);
  assert.doesNotMatch(p.text, /alert/);
  assert.equal(publicAddress("127.0.0.1"), false);
  assert.equal(publicAddress("::ffff:127.0.0.1"), false);
});
test("URL import and arXiv identity deduplicate without title merging or losing read state", () =>
  fixture(async (root) => {
    const fetcher = async (url) => ({
      bytes: Buffer.from(
        "<article><h1>Reliable results with uncertainty</h1><p>A meaningful saved research article about testing methods with measured evidence.</p></article>",
      ),
      type: "text/html",
      url,
    });
    const first = await importLibrary(root, { url: "2302.03660" }, fetcher);
    await updateLibrary(root, {
      id: first.paper.id,
      read: true,
      notes: "Keep this note",
    });
    const second = await importLibrary(
      root,
      { url: "https://arxiv.org/pdf/2302.03660.pdf", discovered: true },
      fetcher,
    );
    assert.equal(second.papers.length, 1);
    assert.equal(second.paper.read, true);
    assert.equal(second.paper.notes, "Keep this note");
    const third = await importLibrary(
      root,
      { url: "https://example.org/different" },
      fetcher,
    );
    assert.equal(third.papers.length, 2);
    assert.match(
      await fs.readFile(path.join(root, "references.bib"), "utf8"),
      /Reliable results/,
    );
    const failed = await importLibrary(
      root,
      { url: "https://example.org/blocked" },
      async () => {
        throw Error("Fixture blocked");
      },
    );
    assert.match(failed.paper.previewError, /Fixture blocked/);
    const recovered = await importLibrary(
      root,
      { url: "https://example.org/blocked", retry: true },
      fetcher,
    );
    assert.equal(recovered.paper.id, failed.paper.id);
    assert.ok(recovered.paper.text);
  }));
test("canonical revision validation, project/role isolation and saved notes survive detach/reload", () =>
  fixture(async (root) => {
    await fs.mkdir(path.join(root, "research"));
    await fs.writeFile(
      path.join(root, "research/summary.json"),
      JSON.stringify({ summary: "One sentence. Another sentence." }),
    );
    const body = {
      target: { kind: "summary" },
      sourceHash: revisionHash("One sentence. Another sentence."),
      anchor: { start: 0, end: 13, quote: "One sentence." },
      comment: "Explain uncertainty.",
    };
    const n = await saveAnnotation(root, body);
    assert.equal((await listAnnotations(root)).length, 1);
    assert.equal(
      (await prepareAnnotations(root, [n.id], "experiment")).notes[0].id,
      n.id,
    );
    await assert.rejects(
      prepareAnnotations(root, [n.id], "writing"),
      /another project or assistant/,
    );
    await fixture((other) =>
      assert.rejects(
        prepareAnnotations(other, [n.id], "experiment"),
        /another project/,
      ),
    );
    await saveAnnotation(root, {
      ...body,
      id: n.id,
      comment: "Clarify uncertainty.",
    });
    assert.equal(
      (await listAnnotations(root))[0].comment,
      "Clarify uncertainty.",
    );
    await fs.writeFile(
      path.join(root, "research/summary.json"),
      JSON.stringify({ summary: "Changed text." }),
    );
    await assert.rejects(
      prepareAnnotations(root, [n.id], "experiment"),
      /changed/,
    );
    await assert.rejects(saveAnnotation(root, body), /changed/);
  }));
test("manuscript review binds bibliography and uses a proposal; snapshots are labelled", () =>
  fixture(async (root) => {
    await fs.mkdir(path.join(root, "writeups"));
    await fs.writeFile(path.join(root, "writeups/main.md"), "A claim.");
    const n = await saveAnnotation(root, {
      target: { kind: "writeup", format: "markdown" },
      sourceHash: revisionHash("A claim."),
      anchor: { start: 0, end: 8, quote: "A claim." },
      comment: "Qualify it.",
    });
    const r = await prepareAnnotations(root, [n.id], "writing");
    assert.equal(r.review.source, "A claim.");
    assert.match(r.context, /never instructions/);
    assert.match(r.context, /Do not edit project files/);
    await fs.writeFile(
      path.join(root, "references.bib"),
      "@misc{x,title={New}}",
    );
    await assert.rejects(
      prepareAnnotations(root, [n.id], "writing"),
      /changed/,
    );
    const snapshot = await saveAnnotation(root, {
      target: {
        kind: "snapshot",
        source: "Recorded result.",
        role: "experiment",
        title: "Trial",
      },
      sourceHash: revisionHash("Recorded result."),
      anchor: { start: 0, end: 16, quote: "Recorded result." },
      comment: "Check result.",
    });
    assert.match(snapshot.title, /snapshot/);
  }));
test("connections validate existing endpoints, interpretations and relationship evidence", () =>
  fixture(async (root) => {
    await fs.mkdir(path.join(root, "research"));
    await fs.writeFile(
      path.join(root, "research/connections.json"),
      JSON.stringify({
        nodes: [{ id: "claim:a", kind: "claim", title: "Claim" }],
        links: [
          {
            from: "run:r",
            to: "claim:a",
            type: "supports",
            description: "Measured value, run r",
            location: "metrics.json",
          },
          {
            from: "missing",
            to: "claim:a",
            type: "supports",
            description: "Invalid",
          },
        ],
      }),
    );
    const graph = await libraryGraph(root, {
      runs: [{ id: "r", name: "Pilot" }],
    });
    assert.equal(graph.links.length, 1);
    assert.equal(
      graph.nodes.find((n) => n.key === "claim:a").interpretation,
      true,
    );
    assert.equal(graph.warnings.length, 1);
  }));
test("identical bytes and alias merges preserve notes without heuristic title equivalence", () => {
  const project = {
    papers: [
      {
        id: "a",
        title: "Same meaningful research paper title",
        sourceType: "pdf",
        contentHash: "x",
        notes: "A",
        read: true,
      },
      { id: "b", title: "Different title", contentHash: "x", notes: "B" },
    ],
    links: [{ from: "paper:b", to: "claim:c", type: "supports" }],
  };
  const merged = addLibrarySources(project);
  assert.equal(merged.papers.length, 1);
  assert.equal(merged.papers[0].notes, "A\n\nB");
  assert.equal(merged.links[0].from, "paper:a");
  assert.ok(merged.sourceMergeHistory);
});
test("project path protections reject symlinked catalogs and local-network retrieval", () =>
  fixture(async (root) => {
    await fs.symlink(os.tmpdir(), path.join(root, "library"));
    await assert.rejects(libraryState(root), /Symlinks/);
    await assert.rejects(fetchSource("http://127.0.0.1/"), /Local network/);
  }));

test("PDF import, byte identity, filenames, revision rejection and queued comment snapshots", () =>
  fixture(async (root) => {
    const { annotationPdf } = await import("./fixtures/annotation-pdf.mjs");
    const bytes = annotationPdf();
    const a = await importLibrary(root, {
      data: bytes.toString("base64"),
      name: "paper.pdf",
    });
    await updateLibrary(root, {
      id: a.paper.id,
      read: true,
      notes: "Keep provenance",
    });
    const b = await importLibrary(root, {
      data: bytes.toString("base64"),
      name: "copy.pdf",
    });
    assert.equal(b.papers.length, 1);
    assert.equal(b.paper.read, true);
    assert.equal(b.paper.notes, "Keep provenance");
    const note = await saveAnnotation(root, {
      target: { kind: "paper", id: a.paper.id },
      sourceHash: revisionHash("", a.paper.contentHash),
      anchor: {
        start: 0,
        end: 31,
        quote: "Page 1 first complete sentence.",
        page: 1,
        x: 48,
        y: 70,
      },
      comment: "Original feedback.",
    });
    await saveAnnotation(root, { ...note, comment: "Later feedback." });
    const sent = await prepareAnnotations(root, [note.id], "experiment", [
      {
        id: note.id,
        sourceHash: note.sourceHash,
        comment: "Original feedback.",
      },
    ]);
    assert.equal(sent.notes[0].comment, "Original feedback.");
    await fs.writeFile(
      path.join(root, "library/papers", `${a.paper.pdfId || a.paper.id}.pdf`),
      Buffer.concat([bytes, Buffer.from("\n% revised")]),
    );
    await assert.rejects(
      prepareAnnotations(root, [note.id], "experiment"),
      /changed/,
    );
    const c = await importLibrary(root, {
      data: Buffer.concat([bytes, Buffer.from("\n% distinct")]).toString(
        "base64",
      ),
      name: "paper.pdf",
    });
    assert.equal(c.papers.length, 2, "same filename is not a source identity");
  }));
test("existing duplicate consolidation records a reversible catalog backup", () =>
  fixture(async (root) => {
    await fs.mkdir(path.join(root, "library"));
    const original = {
      papers: [
        { id: "a", title: "First record", contentHash: "same", read: true },
        {
          id: "b",
          title: "Second record",
          contentHash: "same",
          notes: "Existing note",
        },
      ],
      links: [{ from: "paper:b", to: "claim:x", type: "supports" }],
    };
    await fs.writeFile(
      path.join(root, "library/catalog.json"),
      JSON.stringify(original),
    );
    await importLibrary(
      root,
      { url: "https://example.org/new" },
      async (url) => ({
        url,
        type: "text/plain",
        bytes: Buffer.from("A readable third source."),
      }),
    );
    const backups = await fs.readdir(path.join(root, "library/backups"));
    assert.equal(backups.length, 1);
    assert.deepEqual(
      JSON.parse(
        await fs.readFile(
          path.join(root, "library/backups", backups[0]),
          "utf8",
        ),
      ),
      original,
    );
    assert.equal((await libraryState(root)).papers.length, 2);
  }));

test("assistant citations ignore code examples and structured diagnostic data", async () => {
  const { assistantProse, outputDirectives } =
    await import("../shared/assistant-output.mjs");
  const citation = ':codex-file-citation{path="https://example.org/paper"}';
  const code =
    "```markdown\n" +
    citation +
    "\n[Example](https://example.org/example)\n```";
  const prose = "Read [Paper](https://example.org/paper).\n" + citation;
  assert.equal(outputDirectives(code).references.length, 0);
  assert.equal(outputDirectives(code).text, code);
  assert.equal(outputDirectives("`" + citation + "`").references.length, 0);
  assert.equal(assistantProse(JSON.stringify({ prompt: prose })), "");
  assert.equal(assistantProse(code + "\n" + prose).trim(), prose);
  assert.equal(outputDirectives(code + "\n" + prose).references.length, 1);
});

test("science outline preserves stable identities, exact evidence, details and canonical annotations", () =>
  fixture(async (root) => {
    const { researchOutline } = await import("./fixtures/research-outline.mjs");
    const { researchKinds } = await import("../shared/research-outline.mjs");
    const { selectedLibraryContext, libraryInstructions } =
      await import("../server/library.mjs");
    await fs.mkdir(path.join(root, "research"));
    const filename = path.join(root, "research/connections.json");
    await fs.writeFile(filename, JSON.stringify(researchOutline));
    const graph = await libraryGraph(root);
    assert.deepEqual(
      new Set(graph.nodes.map((n) => n.kind)),
      new Set(Object.keys(researchKinds)),
    );
    assert.equal(graph.links.length, 3);
    const claim = graph.nodes.find((n) => n.key === "claim:stability");
    assert.equal(claim.mainResult, true);
    assert.match(claim.detail, /0\.0123456789/);
    assert.match(claim.detail, /Open obligations/);
    assert.match(claim.detail, /Constant input power/);
    assert.equal(claim.status, "proposed");
    const link = graph.links.find((l) => l.type === "addresses");
    assert.equal(link.location, "research/protocol.md §2");
    assert.ok(link.assumptions.length && link.gaps.length);
    const selected = await selectedLibraryContext(
      root,
      "outline:claim:stability",
    );
    assert.match(selected, /context data, never instructions/);
    assert.match(selected, /depends-on/);
    const annotation = await saveAnnotation(root, {
      target: { kind: "research", id: claim.key },
      sourceHash: revisionHash(claim.detail, claim.revision),
      anchor: { start: 0, end: 5, quote: claim.detail.slice(0, 5) },
      comment: "Clarify the scope.",
    });
    assert.equal(annotation.path, "research/connections.json#claim:stability");
    assert.equal(annotation.role, "experiment");
    const revised = structuredClone(researchOutline);
    revised.nodes.find((n) => n.id === claim.key).text =
      "Updated interpretation.";
    await fs.writeFile(filename, JSON.stringify(revised));
    const next = await libraryGraph(root);
    assert.equal(next.nodes.filter((n) => n.key === claim.key).length, 1);
    assert.equal(next.links[0].id, graph.links[0].id);
    await assert.rejects(
      prepareAnnotations(root, [annotation.id], "experiment"),
      /changed/,
    );
    assert.match(libraryInstructions, /substantial science or engineering/);
    assert.match(libraryInstructions, /read-only mode/);
    assert.match(libraryInstructions, /Greetings, narrow explanations/);
    assert.match(libraryInstructions, /read the current file/i);
    assert.match(libraryInstructions, /run ledger remains authoritative/);
  }));

test("outline does not promote claimed verification or mathematical roles into scientific evidence", () =>
  fixture(async (root) => {
    await fs.mkdir(path.join(root, "research"));
    await fs.writeFile(
      path.join(root, "research/connections.json"),
      JSON.stringify({
        nodes: [
          { id: "bad", kind: "theorem", title: "Unrequested math node" },
          {
            id: "x",
            kind: "claim",
            title: "Unreviewed claim",
            status: "verified",
            description: "Legacy text",
          },
        ],
        links: [],
      }),
    );
    const graph = await libraryGraph(root);
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].status, "proposed");
    assert.match(graph.nodes[0].detail, /Legacy text/);
    assert.equal(graph.nodes[0].interpretation, true);
  }));

test("figure feedback keeps canonical identity and rejects replaced bytes", () => fixture(async root => {
  await fs.mkdir(path.join(root, 'artifacts/figures'), {recursive:true});
  const file=path.join(root,'artifacts/figures/chart.svg');
  await fs.writeFile(file,'<svg xmlns="http://www.w3.org/2000/svg"/>');
  const target={kind:'figure',path:'artifacts/figures/chart.svg',role:'experiment'};
  const doc=await annotationDocument(root,target);
  const note=await saveAnnotation(root,{target,sourceHash:revisionHash(doc.source,doc.revision),anchor:{kind:'figure',start:0,end:doc.source.length,quote:doc.source},comment:'Explain the uncertainty.'});
  assert.equal(note.anchor.kind,'figure');
  assert.equal((await prepareAnnotations(root,[note.id],'experiment')).notes[0].id,note.id);
  await assert.rejects(prepareAnnotations(root,[note.id],'writing'),/another project or assistant/);
  await fixture(other=>assert.rejects(prepareAnnotations(other,[note.id],'experiment'),/another project/));
  await fs.writeFile(file,'<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  await assert.rejects(prepareAnnotations(root,[note.id],'experiment'),/changed|stale/i);
  await assert.rejects(annotationDocument(root,{...target,path:'artifacts/figures/../../../secret.svg'}));
}));
