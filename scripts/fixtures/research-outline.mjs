export const researchOutline = {
  nodes: [
    {
      id: "question:cooling",
      kind: "question",
      title: "Can cooling reduce drift?",
      text: "Does active cooling reduce sensor drift under the stated load?",
      status: "open",
    },
    {
      id: "hypothesis:cooling",
      kind: "hypothesis",
      title: "Cooling reduces drift",
      text: "At matched load, cooling is expected to reduce drift.",
      assumptions: ["Matched sensor calibration."],
      obligations: ["Run a held-out comparison."],
    },
    {
      id: "claim:stability",
      kind: "claim",
      title: "Stability within the tested range",
      text: "The proposed stability claim is limited to $20 \\le T \\le 30$ °C.",
      mainResult: true,
      assumptions: ["Constant input power."],
      obligations: ["Measure long-term drift."],
      evidence: [
        {
          path: "runs/pilot/metrics.json",
          drift: 0.0123456789,
          unit: "mV/h",
          scope: "Synthetic fixture only; no executed experiment is claimed.",
        },
      ],
    },
    {
      id: "method:comparison",
      kind: "method",
      title: "Matched-load comparison",
      text: "Compare sensors with matched calibration and load.",
    },
    {
      id: "result:pilot",
      kind: "result",
      title: "Pilot observation",
      text: "The synthetic fixture reports drift of 0.0123456789 mV/h; no real measurement was performed.",
      status: "inconclusive",
    },
    {
      id: "assumption:power",
      kind: "assumption",
      title: "Constant input power",
      text: "Assume power remains constant during comparison.",
    },
    {
      id: "decision:cooling",
      kind: "decision",
      title: "Evaluate active cooling",
      text: "Compare drift reduction against energy cost before selecting a design.",
    },
    {
      id: "limitation:duration",
      kind: "limitation",
      title: "Short observation period",
      text: "Long-term reliability remains unresolved.",
    },
    {
      id: "argument:scope",
      kind: "argument",
      title: "Scope of the interpretation",
      text: "Observed association does not establish causality.",
    },
  ],
  links: [
    {
      from: "hypothesis:cooling",
      to: "question:cooling",
      type: "addresses",
      description:
        "The **testable prediction** addresses the cooling question under matched load: $\\Delta d < 0$.",
      evidence: "A planned comparison, not an executed result.",
      assumptions: ["Matched calibration and load."],
      gaps: ["No held-out validation yet."],
      location: "research/protocol.md §2",
    },
    {
      from: "claim:stability",
      to: "assumption:power",
      type: "depends-on",
      description:
        "The stability claim requires constant input power; varying power would confound the comparison.",
    },
    {
      from: "limitation:duration",
      to: "claim:stability",
      type: "constrains",
      description:
        "The short observation window leaves long-term reliability unresolved.",
    },
  ],
};
