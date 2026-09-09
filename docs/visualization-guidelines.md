# Scientific visualization instructions

The shared assistant prompt in `server/research-context.mjs` applies these principles to new analysis tasks. This changes future generation, not existing project figures. Models may still need review; instructions are not a rendering guarantee.

## Sources and synthesis

- [Flourish's AI visualization prompts](https://flourish.studio/usecases/ai-workflows/best-assistant-prompts/) encourage insight-led titles, selective emphasis, decluttering, annotations, and accessibility. We require titles and annotations to remain supported by measured evidence.
- [Anthropic's public data-visualization skill](https://github.com/anthropics/knowledge-work-plugins/blob/main/data/skills/data-visualization/SKILL.md) matches chart types to analytical relationships and promotes restrained, accessible design. It is a useful public AI instruction example, not an empirically established “best prompt.”
- [Financial Times Visual Vocabulary](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary) provides an established newsroom chart-selection framework. We favor distributions, comparisons, trajectories, and small multiples according to the question.
- Seaborn's official [aesthetics](https://seaborn.pydata.org/tutorial/aesthetics.html) and [color](https://seaborn.pydata.org/tutorial/color_palettes.html) guides distinguish theme/context from data encoding. Use explicit sizing and consistent categorical colors; ordered quantities need ordered palettes.

## Workbench-specific scientific checks

1. Read the actual data and evaluation design. Choose one main question per figure.
2. Use concise titles, sample/split context, units, readable typography, and minimal decoration.
3. Keep plotted values, annotations, and ledger metrics consistent. Do not invert an error metric but label it with its original value.
4. Use separate panels or a table for unlike metrics. Mark optimization direction. Keep bar baselines at zero; disclose other axis restrictions or transforms.
5. Show computed uncertainty with its method and sampling unit. Do not fabricate intervals or interpret an association as causal.
6. Export SVG/PNG, inspect the static result at card size and enlarged, and correct clipping, contrast, crowding, and misleading labels.
7. Record exact metrics as structured JSON and keep scientific interpretation tied to run IDs. No invented examples in blank projects.

These are a synthesis of established design guidance and this application's scientific reporting needs, not a popularity ranking or a copied third-party system prompt.
