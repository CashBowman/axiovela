// One vocabulary shared by the Library list, Connections and assistant contract.
export const researchKinds = {
  claim: { label: "Claim", plural: "Claims" },
  hypothesis: { label: "Hypothesis", plural: "Hypotheses" },
  question: { label: "Question", plural: "Questions" },
  method: { label: "Method", plural: "Methods" },
  result: { label: "Finding", plural: "Findings" },
  assumption: { label: "Assumption", plural: "Assumptions" },
  decision: { label: "Design decision", plural: "Design decisions" },
  limitation: { label: "Limitation", plural: "Limitations" },
  argument: { label: "Argument", plural: "Arguments" },
};
export const relationshipTypes = [
  "supports",
  "contradicts",
  "uses",
  "motivates",
  "tests",
  "extends",
  "cites",
  "derived-from",
  "depends-on",
  "addresses",
  "constrains",
];
const bounded = (value) =>
  typeof value === "string" ? value.slice(0, 12000) : "";
const details = (value) =>
  Array.isArray(value)
    ? value
        .slice(0, 50)
        .filter((x) => typeof x === "string" || (x && typeof x === "object"))
        .map((x) =>
          typeof x === "string" ? bounded(x) : JSON.parse(JSON.stringify(x)),
        )
    : bounded(value);
export function researchNode(node) {
  if (
    !node ||
    !/^[a-zA-Z0-9:_-]{1,128}$/.test(node.id) ||
    !Object.hasOwn(researchKinds, node.kind) ||
    typeof node.title !== "string" ||
    !node.title.trim()
  )
    return null;
  return {
    id: node.id,
    kind: node.kind,
    title: node.title.trim().slice(0, 500),
    text: bounded(node.text || node.description),
    mainResult: node.mainResult === true,
    status: [
      "proposed",
      "open",
      "in-progress",
      "supported",
      "inconclusive",
      "refuted",
      "completed",
    ].includes(node.status)
      ? node.status
      : "proposed",
    assumptions: details(node.assumptions || node.hypotheses),
    obligations: details(node.obligations || node.gaps),
    evidence: details(node.evidence),
    provenance: details(node.provenance),
  };
}
function section(title, value) {
  if (!value?.length) return "";
  return (
    `\n\n## ${title}\n\n` +
    (Array.isArray(value)
      ? value
          .map((x) =>
            typeof x === "string"
              ? "- " + x
              : "```json\n" + JSON.stringify(x, null, 2) + "\n```",
          )
          .join("\n\n")
      : value)
  );
}
export function researchNodeText(node) {
  return (
    `# ${node.title}\n\n${node.text || "No statement recorded yet."}` +
    section("Assumptions", node.assumptions) +
    section("Open obligations", node.obligations) +
    section("Evidence", node.evidence) +
    section("Provenance", node.provenance)
  );
}
