import { researchOutline } from "./fixtures/research-outline.mjs";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";
const root = process.cwd(),
  tmp = await mkdtemp(path.join(os.tmpdir(), "axiovela-annotations-")),
  home = path.join(tmp, "home"),
  project = path.join(tmp, "project");
const evidence =
  process.env.AXIOVELA_ANNOTATION_EVIDENCE ||
  path.join(root, ".local/library-annotations-20260915");
await mkdir(evidence, { recursive: true });
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  APPDATA: path.join(home, "AppData/Roaming"),
  LOCALAPPDATA: path.join(home, "AppData/Local"),
  AXIOVELA_DESKTOP_PROFILE: path.join(tmp, "profile"),
  XDG_CONFIG_HOME: home,
  XDG_CACHE_HOME: home,
};
for (const directory of [home, env.APPDATA, env.LOCALAPPDATA])
  await mkdir(directory, { recursive: true });
for (const key of Object.keys(env))
  if (
    /^(WORKBENCH_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AZURE_|ELECTRON_RUN_AS_NODE$|NODE_OPTIONS$|NODE_PATH$)/.test(
      key,
    )
  )
    delete env[key];
const fixture = path.join(tmp, "codex.mjs");
await writeFile(
  fixture,
  (await readFile("scripts/fixtures/assistant-rpc.mjs", "utf8"))
    .replace(
      "      if (request.includes('FIXTURE_CHILD')) {",
      `
      if (request.includes('FIXTURE_OUTLINE') && session.sandbox !== 'read-only') {
        if(!prompt.includes('AUTOMATIC RESEARCH ORGANIZATION')) throw Error('Missing research organization contract');
        const file = path.join(process.cwd(),'research/connections.json');
        const prior = JSON.parse(await readFile(file,'utf8').catch(()=>'{}'));
        const next = ${JSON.stringify(researchOutline)};
        if(request.includes('FIXTURE_OUTLINE_REVISE')) next.nodes.find(n=>n.id==='claim:stability').text = 'Updated stability interpretation, pending validation.';
        const nodes = new Map((prior.nodes || []).map(n=>[n.id,n]));
        for(const node of next.nodes) nodes.set(node.id,node);
        await writeFile(file,JSON.stringify({...prior,nodes:[...nodes.values()],links:next.links}));
      }
      if (request.includes('FIXTURE_CHILD')) {`,
    )
    .replace(
      "const text = request.includes('FIXTURE_CHILD')",
      "const text = request.includes('FIXTURE_ANNOTATION_REVIEW') ? '```markdown\\nA qualified claim.\\n```' : request.includes('FIXTURE_CHILD')",
    ),
);
env.WORKBENCH_CODEX_PATH = fixture;
let app, page;
try {
  app = await electron.launch({
    executablePath:
      process.env.AXIOVELA_ANNOTATION_TEST_BINARY ||
      (await import("electron")).default,
    args: process.env.AXIOVELA_ANNOTATION_TEST_BINARY ? [] : [root],
    env,
    chromiumSandbox: true,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE", m.text());
  });
  await page.waitForFunction(
    () =>
      document.querySelector('select[aria-label="Conversation"]')?.disabled ===
      false,
  );
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("textbox", { name: "Project folder" }).fill(project);
  await page
    .getByRole("button", { name: "Open or create", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const summary =
    "First complete sentence. Second sentence explains uncertainty.\n\nAnother paragraph contains evidence. Final sentence stays separate.";
  await writeFile(
    path.join(project, "research/summary.json"),
    JSON.stringify({ summary, findings: [], limitations: [], nextSteps: [] }),
  );
  const surface = page.getByLabel("Summary annotation surface");
  await surface
    .getByText("First complete sentence.", { exact: false })
    .waitFor();
  const select = async (locator, start, end) => {
    await locator.evaluate(
      (el, { start, end }) => {
        el.closest(".annotationSurface")?.focus({ preventScroll: true });
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        const nodes = [];
        while ((n = w.nextNode()))
          if (
            n.textContent.trim() &&
            !n.parentElement.closest("button,[data-annotation-ui]")
          )
            nodes.push(n);
        const r = document.createRange();
        r.setStart(nodes[0], start);
        r.setEnd(nodes[end.node || 0], end.offset);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        el.dispatchEvent(
          new MouseEvent("mouseup", { bubbles: true, button: 0 }),
        );
      },
      { start, end },
    );
  };
  const drag = async (locator, start, end) => {
    const points = await locator.evaluate(
      (element, { start, end }) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) if (node.textContent.trim()) break;
        const point = (offset) => {
          const range = document.createRange();
          range.setStart(node, offset);
          range.collapse(true);
          const box = range.getBoundingClientRect();
          return { x: box.left + 0.25, y: box.top + box.height / 2 };
        };
        return { start: point(start), end: point(end) };
      },
      { start, end },
    );
    await page.mouse.move(points.start.x, points.start.y);
    await page.mouse.down();
    await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
    await page.mouse.up();
  };
  // Real pointer dragging must retain both exact native selection and copy focus.
  await drag(surface.locator("p").first(), 3, 12);
  await page.getByRole("dialog", { name: "Add annotation" }).waitFor();
  assert.equal(
    await page.evaluate(() => getSelection().toString()),
    "st comple",
  );
  await page.keyboard.press("Control+c");
  await page.waitForTimeout(100);
  assert.equal(
    await app.evaluate(({ clipboard }) => clipboard.readText()),
    "st comple",
  );
  assert.equal(await page.getByRole("button", {name:"Copy passage",exact:true}).count(),0);
  assert.equal(await page.locator('.annotationPopover blockquote').count(),0);
  assert.ok(!/Enter adds|Shift\+Enter/.test(await page.locator('.annotationPopover').innerText()));
  await page
    .getByRole("textbox", { name: "Annotation feedback" })
    .fill("Canceled note");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    await page.locator(".annotationChips .annotationChip").count(),
    0,
  );
  await select(surface, 3, { offset: 12 });
  const feedbackField = page.getByRole("textbox", {
    name: "Annotation feedback",
  });
  await feedbackField.fill("Clarify this sentence.");
  await feedbackField.press("Shift+Enter");
  assert.equal(await feedbackField.inputValue(), "Clarify this sentence.\n");
  await feedbackField.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(
    await page.locator(".annotationChip").count(),
    0,
    "IME Enter must not attach",
  );
  await feedbackField.press("Enter");
  await page.locator(".annotationPopover").waitFor({ state: "hidden" });
  await page.locator(".annotationChip").waitFor();
  assert.equal(await surface.locator(".annotationPin").count(), 1);
  assert.equal(
    (
      await page.evaluate(() =>
        fetch("/api/assistant?allConversations=1").then((r) => r.json()),
      )
    ).jobs.length,
    0,
    "Enter adds without starting a model turn",
  );
  assert.ok((await surface.locator(".passageHighlight").count()) > 0);
  const pinBox = await page.getByRole("button", { name: "Comment 1", exact: true }).boundingBox();
  await page.getByRole("button", { name: "Comment 1", exact: true }).click();
  await page.getByRole("dialog", {name:"Edit annotation"}).waitFor();
  const editPosition = await page.locator('.annotationPopover').evaluate(el=>({box:el.getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight}));
  assert.ok(Math.abs(editPosition.box.left-Math.max(12,Math.min(editPosition.width-332,pinBox.x)))<2,'Editing opens next to the pin');
  assert.ok(Math.abs(editPosition.box.top-Math.max(12,Math.min(editPosition.height-230,pinBox.y+pinBox.height+10)))<2,'Editing preserves the pin position');

  await page
    .getByRole("textbox", { name: "Annotation feedback" })
    .fill("Clarify the first sentence.");
  await page
    .getByRole("button", { name: "Add to message", exact: true })
    .click();
  await page.locator(".annotationPopover").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Remove annotation 1 from message" })
    .click();
  assert.equal(await page.locator(".annotationChip").count(), 0);
  assert.equal(await surface.locator(".annotationPin").count(), 1);
  await page.getByRole("button", { name: "Comment 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Add to message", exact: true })
    .click();
  await page.locator(".annotationPopover").waitFor({ state: "hidden" });
  await page
    .getByRole("textbox", { name: "Experiment Chatbot message" })
    .fill("Keep the recorded values unchanged.");
  await page.screenshot({
    path: path.join(evidence, "summary-annotations.png"),
  });
  await page.reload();
  await page
    .getByRole("textbox", { name: "Experiment Chatbot message" })
    .waitFor();
  await page.locator(".annotationChip").waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Experiment Chatbot message" })
      .inputValue(),
    "Keep the recorded values unchanged.",
  );
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  assert.equal(await page.locator(".annotationChip").count(), 0);
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await page.locator(".annotationChip").waitFor();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".stopTask"));
  await page.locator(".sentAnnotations").waitFor();
  const history = await page.evaluate(
    async () => await (await fetch("/api/assistant?allConversations=1")).json(),
  );
  assert.equal(
    history.jobs.at(-1).annotations[0].comment,
    "Clarify the first sentence.",
  );
  assert.equal(history.jobs.at(-1).role, "experiment");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  assert.deepEqual(
    await page
      .locator('nav[aria-label="Workspace sections"] button')
      .allTextContents(),
    ["Results", "Methods", "Trials", "Library", "Write-up"],
  );
  // Seed a deterministic readable article through the production importer with a fixture fetcher.
  const { importLibrary } = await import("../server/library.mjs");
  const imported = await importLibrary(
    project,
    { url: "https://example.org/article" },
    async (url) => ({
      url,
      type: "text/html",
      bytes: Buffer.from(
        '<article><h1>Uncertainty in measured experiments</h1><p>The first article sentence discusses evidence. Another sentence gives context.</p><p>The next paragraph has a <a href="https://example.org/reference">reference</a> and mathematical notation \\(x^2\\).</p></article>',
      ),
    }),
  );
  await page
    .getByRole("button", { name: imported.paper.title, exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: imported.paper.title, exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Read " + imported.paper.title })
    .check();
  const readingFilter=page.getByRole('combobox',{name:'Reading status',exact:true});
  await readingFilter.selectOption('unread');
  assert.equal(await page.getByRole('checkbox',{name:'Read '+imported.paper.title,exact:true}).count(),0);
  await readingFilter.selectOption('read');
  const readBox=page.getByRole('checkbox',{name:'Read '+imported.paper.title,exact:true});
  await readBox.waitFor();
  assert.equal(await readBox.evaluate(el=>getComputedStyle(el).appearance),'none');
  await readingFilter.selectOption('all');
  assert.ok(await page.locator('.libraryGroup h3').count()>0);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("group", { name: "Source connections graph" }).waitFor();
  await page.screenshot({
    path: path.join(evidence, "library-connections.png"),
  });
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.screenshot({ path: path.join(evidence, "library-reader.png") });
  const article = page.getByLabel(imported.paper.title + " annotation surface");
  await select(article.locator("p").first(), 4, { offset: 18 });
  await page
    .getByRole("textbox", { name: "Annotation feedback" })
    .fill("Connect this source to the experiment.");
  await page
    .getByRole("button", { name: "Add to message", exact: true })
    .click();
  await page.locator(".annotationPopover").waitFor({ state: "hidden" });
  // Multiple paragraphs use complete sentences and distinct line overlays.
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await select(surface, 30, { node: 1, offset: 15 });
  await page.getByRole("dialog", { name: "Add annotation" }).waitFor();
  assert.equal(await page.locator('.annotationPopover blockquote').count(),0);
  await surface.locator(".draftHighlight").nth(1).waitFor();
  assert.ok((await surface.locator(".draftHighlight").count()) >= 2);
  // Context menus use native edit roles and right-click never dismisses the note.
  await app.evaluate(({ Menu }) => {
    const build = Menu.buildFromTemplate;
    Menu.buildFromTemplate = function (template) {
      globalThis.annotationMenu = template.map((x) => ({
        role: x.role,
        enabled: x.enabled,
      }));
      const menu = build.call(this, template);
      menu.popup = () => {};
      return menu;
    };
  });
  await page
    .getByRole("textbox", { name: "Annotation feedback" })
    .click({ button: "right" });
  assert.ok(
    (await app.evaluate(() => globalThis.annotationMenu)).some(
      (x) => x.role === "paste",
    ),
  );
  await app.evaluate(({ clipboard }) =>
    clipboard.writeText("Pasted native feedback."),
  );
  await page.getByRole("textbox", { name: "Annotation feedback" }).click();
  await page.keyboard.press("Control+v");
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="Annotation feedback"]')
        ?.value === "Pasted native feedback.",
  );
  assert.equal(
    await page
      .getByRole("textbox", { name: "Annotation feedback" })
      .inputValue(),
    "Pasted native feedback.",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".annotationPopover").count(), 0);
  // A native sentence click opens the popover without a separate mode.
  await surface
    .locator("p")
    .first()
    .click({ position: { x: 40, y: 8 } });
  await page.getByRole("dialog", { name: "Add annotation" }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const { annotationPdf } = await import("./fixtures/annotation-pdf.mjs");
  const pdf = path.join(tmp, "evidence.pdf");
  await writeFile(pdf, annotationPdf());
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator(".librarySources input[type=file]").setInputFiles(pdf);
  await page
    .getByRole("button", { name: "Fixture multi-page evidence", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector(".pdfPage .textLayer span")
      ?.textContent?.includes("Page 1"),
  );
  const reader = page.getByRole("region", {
      name: "Fixture multi-page evidence",
    }),
    pdfPage = reader.locator(".pdfPage").first();
  await drag(pdfPage.locator(".textLayer span").first(), 7, 20);
  await page.getByRole("dialog", { name: "Add annotation" }).waitFor();
  assert.equal(
    await page.evaluate(() => getSelection().toString()),
    "first complet",
  );
  await page
    .getByRole("textbox", { name: "Annotation feedback" })
    .fill("Discuss page one.");
  await page
    .getByRole("button", { name: "Add to message", exact: true })
    .click();
  await page.locator(".annotationPopover").waitFor({ state: "hidden" });
  await pdfPage.locator(".annotationPin").waitFor();
  const geometry = () =>
    pdfPage.evaluate((el) => {
      const mark = el
          .querySelector(".passageHighlight")
          .getBoundingClientRect(),
        text = el.querySelector(".textLayer span").getBoundingClientRect();
      return {
        left: mark.left - text.left,
        top: mark.top - text.top,
        width: mark.width,
      };
    });
  let g = await geometry();
  assert.ok(Math.abs(g.left) < 2 && Math.abs(g.top) < 3);
  const beforeZoom = Number(await reader.getAttribute("data-zoom"));
  await page.getByRole("button", { name: "Zoom in PDF" }).click();
  await page.waitForFunction(
    (z) => Number(document.querySelector(".pdfReader").dataset.zoom) > z,
    beforeZoom,
  );
  await page.waitForTimeout(250);
  g = await geometry();
  assert.ok(Math.abs(g.left) < 2 && Math.abs(g.top) < 3);
  await page.getByRole("button", { name: "Fullscreen reader" }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".documentReader.expandedPanel")
        .getBoundingClientRect().width >
      innerWidth * 0.9,
  );
  await page.waitForTimeout(150);
  g = await geometry();
  assert.ok(Math.abs(g.left) < 2 && Math.abs(g.top) < 3);
  await reader.focus();
  const z = Number(await reader.getAttribute("data-zoom"));
  await page.keyboard.press("Control+-");
  await page.waitForFunction(
    (z) => Number(document.querySelector(".pdfReader").dataset.zoom) < z,
    z,
  );
  await page.keyboard.press("Control+=");
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Next PDF page" }).click();
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "PDF page number" })
      .inputValue(),
    "2",
  );
  const readingPoint = () =>
    reader.locator(".pdfCanvasScroll").evaluate((el) => {
      const top = el.getBoundingClientRect().top + 40,
        z = Number(el.closest(".pdfReader").dataset.zoom);
      const p = [...el.querySelectorAll(".pdfPage")].find(
        (p) => p.getBoundingClientRect().bottom > top,
      );
      return {
        page: p.dataset.page,
        y: (top - p.getBoundingClientRect().top) / z,
      };
    });
  const chromeHeight = () =>
    page
      .locator(".documentReader.expandedPanel")
      .evaluate(
        (el) =>
          el.querySelector(".readerTitleRow").getBoundingClientRect().height +
          el.querySelector(".pdfToolbar").getBoundingClientRect().height,
      );
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.waitForTimeout(150);
  assert.ok(
    (await chromeHeight()) <= 100,
    "Ordinary fullscreen chrome <=100 CSS pixels",
  );
  const savedReading = await readingPoint();
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.waitForTimeout(150);
  assert.ok(
    (await chromeHeight()) <= 115,
    "Narrow fullscreen chrome <=115 CSS pixels",
  );
  assert.equal((await readingPoint()).page, savedReading.page);
  assert.ok(Math.abs((await readingPoint()).y - savedReading.y) < 3);
  await page.screenshot({
    path: path.join(evidence, "compact-fullscreen-narrow.png"),
  });
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.waitForTimeout(150);
  const beforeClose = await readingPoint();
  await page.screenshot({ path: path.join(evidence, "pdf-annotations.png") });
  await page.getByRole("button", { name: "Exit reader fullscreen" }).click();
  await page.waitForTimeout(150);
  assert.equal((await readingPoint()).page, beforeClose.page);
  assert.ok(
    Math.abs((await readingPoint()).y - beforeClose.y) < 3,
    "Fullscreen exit retains reading position",
  );
  // Fit mode may change scale with width, but the same document location stays visible.
  await page.getByRole("button", { name: "Fit width", exact: true }).click();
  await page.waitForTimeout(350);
  const fittedPoint = await readingPoint();
  await page
    .getByRole("button", { name: "Fullscreen reader", exact: true })
    .click();
  await page.waitForTimeout(350);
  assert.equal((await readingPoint()).page, fittedPoint.page);
  assert.ok(
    Math.abs((await readingPoint()).y - fittedPoint.y) < 3,
    "Fit-width fullscreen retains the document location",
  );
  await page
    .getByRole("button", { name: "Exit reader fullscreen", exact: true })
    .click();
  await page.waitForTimeout(350);
  assert.equal((await readingPoint()).page, fittedPoint.page);
  assert.ok(
    Math.abs((await readingPoint()).y - fittedPoint.y) < 3,
    "Fit-width exit retains the document location",
  );
  await reader.locator(".pdfCanvasScroll").evaluate((el) => {
    globalThis.savedPdfScroll = el.scrollTop;
    globalThis.savedCanvas = el.querySelector("canvas");
  });
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  assert.equal(
    await reader
      .locator(".pdfCanvasScroll")
      .evaluate((el) => Math.abs(el.scrollTop - globalThis.savedPdfScroll) < 2),
    true,
  );
  assert.equal(
    await reader
      .locator(".pdfCanvasScroll")
      .evaluate((el) => el.querySelector("canvas") === globalThis.savedCanvas),
    true,
  );
  assert.equal(
    await pdfPage
      .getByRole("link", { name: "Open https://example.org/evidence" })
      .getAttribute("href"),
    "https://example.org/evidence",
  );
  // Importing the same bytes twice keeps one source and its read state.
  await page
    .getByRole("checkbox", { name: "Read Fixture multi-page evidence" })
    .check();
  await page.locator(".librarySources input[type=file]").setInputFiles(pdf);
  await page.waitForTimeout(350);
  assert.equal(
    await page
      .getByRole("button", { name: "Fixture multi-page evidence", exact: true })
      .count(),
    1,
  );
  await page.setViewportSize({ width: 980, height: 800 });
  await page.screenshot({ path: path.join(evidence, "library-narrow.png") });
  await page.setViewportSize({ width: 1500, height: 1000 });
  // Sources and PDF page feedback are combined through the ordinary composer.
  await page
    .getByRole("textbox", { name: "Experiment Chatbot message" })
    .fill("Use both sources.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".stopTask"));
  await page.waitForTimeout(500);
  const combined = await page.evaluate(
    async () => await (await fetch("/api/assistant?allConversations=1")).json(),
  );
  assert.equal(combined.jobs.at(-1).annotations.length, 2);
  assert.equal(
    combined.jobs.at(-1).annotations.find((n) => n.anchor.page).anchor.page,
    1,
  );
  // Canonical stale sources block sending before a fixture provider starts.
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await select(surface, 3, { offset: 12 });
  await page
    .getByRole("textbox", { name: "Annotation feedback" })
    .fill("Stale feedback.");
  await page
    .getByRole("button", { name: "Add to message", exact: true })
    .click();
  await page.locator(".annotationPopover").waitFor({ state: "hidden" });
  const count = combined.jobs.length;
  await writeFile(
    path.join(project, "research/summary.json"),
    JSON.stringify({ summary: "The revised summary." }),
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "changed" }).waitFor();
  assert.equal(
    (
      await page.evaluate(
        async () =>
          await (await fetch("/api/assistant?allConversations=1")).json(),
      )
    ).jobs.length,
    count,
  );
  // Writing annotations go to a separate read-only proposal and require explicit Apply.
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "Write-up source" }).fill("A claim.");
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  const manuscript = page.getByLabel("Rendered write-up annotation surface");
  await manuscript.getByText("A claim.", { exact: true }).waitFor();
  await manuscript.getByText("A claim.", { exact: true }).dblclick();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Write-up source" })
      .evaluate((el) => document.activeElement === el),
    true,
  );
  assert.equal(await page.locator(".annotationPopover").count(), 0);
  await select(manuscript, 0, { offset: 8 });
  await page
    .getByRole("textbox", { name: "Annotation feedback" })
    .fill("Qualify this statement.");
  await page
    .getByRole("button", { name: "Add to message", exact: true })
    .click();
  await page.locator(".annotationPopover").waitFor({ state: "hidden" });
  await page
    .getByRole("textbox", { name: "Research Assistant message" })
    .fill("FIXTURE_ANNOTATION_REVIEW");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("button", { name: "Review proposed revision" })
    .waitFor();
  assert.equal(
    await readFile(path.join(project, "writeups/main.md"), "utf8"),
    "A claim.",
  );
  const writing = await page.evaluate(
    async () => await (await fetch("/api/assistant?allConversations=1")).json(),
  );
  assert.equal(writing.jobs.at(-1).role, "writing");
  assert.equal(writing.jobs.at(-1).mode, "ask");
  await page.getByRole("button", { name: "Review proposed revision" }).click();
  await page.getByRole("button", { name: "Apply revision" }).click();
  await page.waitForFunction(() => !document.querySelector(".revisionDialog"));
  assert.match(
    await readFile(path.join(project, "writeups/main.md"), "utf8"),
    /A qualified claim/,
  );
  // The ordinary assistant writes a structured outline once; polling populates the Library.
  await page.getByRole("button", { name: "Library", exact: true }).click();
  // The preceding stale-revision test deliberately left an unsent stale note.
  for (const remove of await page
    .getByRole("button", { name: /Remove annotation .* from message/ })
    .all())
    await remove.click();
  await writeFile(
    path.join(project, "research/connections.json"),
    JSON.stringify({
      nodes: [
        {
          id: "claim:preserved",
          kind: "claim",
          title: "Preserved claim",
          text: "Keep prior work.",
        },
      ],
      links: [],
    }),
  );
  const completed = async (message) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const record = await page.evaluate(
        async (message) =>
          (
            await (await fetch("/api/assistant?allConversations=1")).json()
          ).jobs.find((j) => j.message === message),
        message,
      );
      if (record?.status === "complete") return record;
      if (record && ["failed", "canceled"].includes(record.status))
        throw Error(JSON.stringify(record));
      await page.waitForTimeout(100);
    }
    throw Error("Fixture turn did not complete: " + message);
  };
  const runOutline = async (message, mode = "auto") => {
    await page
      .getByRole("combobox", { name: "Access", exact: true })
      .selectOption(mode);
    await page
      .getByRole("textbox", { name: "Experiment Chatbot message" })
      .fill(message);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await completed(message);
  };
  const initialOutline = await readFile(
    path.join(project, "research/connections.json"),
    "utf8",
  );
  await runOutline("FIXTURE_OUTLINE Read-only interpretation.", "ask");
  assert.equal(
    await readFile(path.join(project, "research/connections.json"), "utf8"),
    initialOutline,
  );
  await runOutline("Hello.");
  assert.equal(
    await readFile(path.join(project, "research/connections.json"), "utf8"),
    initialOutline,
  );
  await runOutline("FIXTURE_OUTLINE Frame the cooling study.");
  await page
    .locator(".libraryList")
    .getByRole("button", { name: "Can cooling reduce drift?", exact: true })
    .waitFor();
  const outlineSaved = JSON.parse(
    await readFile(path.join(project, "research/connections.json"), "utf8"),
  );
  assert.ok(outlineSaved.nodes.some((n) => n.id === "claim:preserved"));
  const turnCount = (
    await page.evaluate(() =>
      fetch("/api/assistant?allConversations=1").then((r) => r.json()),
    )
  ).jobs.length;
  const filters = page.getByRole("combobox", { name: "Filter library" });
  for (const [kind, title] of researchOutline.nodes.map((n) => [
    n.kind,
    n.title,
  ])) {
    await filters.selectOption(kind);
    await page
      .locator(".libraryList")
      .getByRole("button", { name: title, exact: true })
      .click();
    await page
      .locator(".researchReading .markdownPreview h1")
      .filter({ hasText: title })
      .waitFor();
    assert.equal(
      await page.locator(".libraryList .sourceMetadata input").count(),
      0,
      "Research records are not read/unread sources",
    );
  }
  await filters.selectOption("claim");
  await page
    .locator(".libraryList")
    .getByRole("button", {
      name: "Stability within the tested range",
      exact: true,
    })
    .click();
  assert.ok(
    await page
      .locator(".researchReading")
      .getByText("Main result", { exact: false })
      .count(),
  );
  assert.ok(
    (await page.locator(".researchReading").innerText()).includes(
      "0.0123456789",
    ),
  );
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const graph = page.getByRole("group", { name: "Source connections graph" });
  const edge = graph.getByRole("button", {
    name: "Explain connection: Cooling reduces drift addresses Can cooling reduce drift?",
  });
  await edge.focus();
  await page.keyboard.press("Enter");
  const explanation = page.getByRole("region", {
    name: "Connection explanation",
  });
  await explanation
    .getByText("No held-out validation yet.", { exact: false })
    .waitFor();
  assert.equal(await explanation.locator(".katex").count(), 1);
  assert.ok(
    (await explanation.innerText()).includes("research/protocol.md §2"),
  );
  await page
    .getByRole("button", { name: "Close connection explanation" })
    .click();
  assert.equal(
    await edge.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Space");
  await explanation.waitFor();
  await page
    .getByRole("button", { name: "Close connection explanation" })
    .click();
  // Click the generous invisible stroke rather than a node or permanent edge label.
  await page.waitForTimeout(150); // Let the detail panel's resize settle.
  const point = await edge.locator(".edgeHit").evaluate((el) => {
    const svg = el.ownerSVGElement;
    for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const p = svg.createSVGPoint();
      p.x =
        el.x1.baseVal.value +
        (el.x2.baseVal.value - el.x1.baseVal.value) * fraction;
      p.y =
        el.y1.baseVal.value +
        (el.y2.baseVal.value - el.y1.baseVal.value) * fraction;
      const s = p.matrixTransform(el.getScreenCTM());
      if (
        document.elementFromPoint(s.x, s.y)?.closest("[data-edge]") ===
        el.parentElement
      )
        return { x: s.x, y: s.y };
    }
    return null;
  });
  assert.ok(
    point,
    "The displayed connection must have an exposed pointer hit target",
  );
  await page.mouse.click(point.x, point.y);
  await explanation.waitFor();
  await page.screenshot({
    path: path.join(evidence, "science-connections.png"),
  });
  assert.equal(
    (
      await page.evaluate(() =>
        fetch("/api/assistant?allConversations=1").then((r) => r.json()),
      )
    ).jobs.length,
    turnCount,
    "Selection does not start another turn",
  );
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Experiment Chatbot message" })
    .fill("FIXTURE_PROMPT Explain the selected result.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const selectedTurn = await completed(
    "FIXTURE_PROMPT Explain the selected result.",
  );
  assert.equal(selectedTurn.projectRoot, project);
  assert.equal(
    JSON.parse(
      await readFile(
        path.join(project, "assistant", selectedTurn.id, "job.json"),
        "utf8",
      ),
    ).message,
    selectedTurn.message,
  );
  assert.ok(
    JSON.parse(selectedTurn.output).prompt.includes(
      "Research item selected by the user",
    ),
  );
  assert.ok(JSON.parse(selectedTurn.output).prompt.includes("claim:stability"));
  await runOutline("FIXTURE_OUTLINE_REVISE Revise the cooling study.");
  await page
    .locator(".researchReading")
    .getByText("Updated stability interpretation, pending validation.", {
      exact: true,
    })
    .waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Filter library" })
    .selectOption("claim");
  await page
    .locator(".libraryList")
    .getByRole("button", {
      name: "Stability within the tested range",
      exact: true,
    })
    .click();
  await page
    .locator(".researchReading")
    .getByText("Updated stability interpretation, pending validation.", {
      exact: true,
    })
    .waitFor();
  const revised = JSON.parse(
    await readFile(path.join(project, "research/connections.json"), "utf8"),
  );
  assert.equal(
    revised.nodes.filter((n) => n.id === "claim:stability").length,
    1,
  );
  assert.ok(revised.nodes.some((n) => n.id === "claim:preserved"));
  await mkdir(path.join(project, "runs/outline-run"), { recursive: true });
  await writeFile(
    path.join(project, "runs/outline-run/run.json"),
    JSON.stringify({
      id: "outline-run",
      name: "Fixture engineering trial",
      status: "complete",
      startedAt: new Date().toISOString(),
      summary: "Recorded fixture trial with a bounded interpretation.",
      metrics: { drift: 0.0123456789 },
    }),
  );
  await page
    .getByRole("combobox", { name: "Filter library" })
    .selectOption("experiment");
  await page
    .locator(".libraryList")
    .getByRole("button", { name: "Fixture engineering trial", exact: true })
    .click();
  await page
    .locator(".researchReading")
    .getByText("Recorded fixture trial with a bounded interpretation.", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Annotation and Library desktop smoke passed. Evidence:",
    evidence,
  );
} catch (error) {
  console.error(
    await page
      ?.locator(".libraryReader")
      .innerText()
      .catch(() => ""),
  );
  await page
    ?.screenshot({ path: path.join(evidence, "failure.png") })
    .catch(() => {});
  throw error;
} finally {
  await app
    ?.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
      dialog.showMessageBoxSync = () => 1;
    })
    .catch(() => {});
  await app?.close();
  if (!process.env.AXIOVELA_KEEP_FIXTURE)
    await rm(tmp, { recursive: true, force: true });
  else console.log("Fixture retained:", tmp);
}
