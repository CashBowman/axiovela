import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {metricLabel} from '../src/metric-tables.mjs';
import {researchInstructions} from '../server/research-context.mjs';

const server = await createServer({server: {middlewareMode: true}, appType: 'custom'});
try {
  const {default: MarkdownPreview} = await server.ssrLoadModule('/src/MarkdownPreview.jsx');
  const render = props => renderToStaticMarkup(React.createElement(MarkdownPreview, props));
  const block = render({source: '**Finding**: $R^2$\n\n| Model | Score |\n| --- | --- |\n| Baseline | 0.8 |\n\n\\[x^2 + y^2\\]'});
  assert.match(block, /<strong>Finding<\/strong>/);
  assert.match(block, /<table>/);
  assert.match(block, /katex-display/);
  const instructions = researchInstructions([]);
  assert.ok(instructions.includes('$R^2$'));
  assert.ok(instructions.includes('$n_{\\mathrm{test}}$'), 'TeX backslash survives the prompt template');
  assert.match(instructions, /Keep metric JSON keys and numeric values machine-readable/);
  const savedBrief = JSON.parse(JSON.stringify({summary: 'Held-out R-squared: $R^2 = 0.8$; $n_{\\mathrm{test}} = 100$. The `log1p(fare)` function transforms the response.'}));
  const brief = render({source: savedBrief.summary});
  assert.equal((brief.match(/class="katex"/g) || []).length, 2);
  assert.match(brief, /<msup>/, 'R-squared renders as a mathematical superscript');
  assert.match(brief, /<msub>/, 'sample-size label renders as a mathematical subscript');
  assert.match(brief, /<code>log1p\(fare\)<\/code>/);
  assert.doesNotMatch(brief, /katex-error/);
  assert.match(render({source: 'R^2 = 0.8'}), /R\^2 = 0.8/, 'do not guess math in legacy prose or rewrite stored evidence');
  const inline = render({source: '**Logistic** $\\beta_1$', inline: true});
  assert.match(inline, /^<span/);
  assert.match(inline, /<strong>Logistic<\/strong>/);
  assert.match(inline, /class="katex"/);
  assert.doesNotMatch(inline, /<p[ >]/);
  assert.equal(metricLabel('$\\beta_1$'), '$\\beta_1$');
  assert.equal(metricLabel('**logistic_regression**'), '**logistic_regression**');
  assert.equal(metricLabel('roc_auc'), 'ROC AUC');
  assert.equal(metricLabel('n_train_total'), 'N train total');
  const unsafe = render({source: '<script>alert(1)</script>\n\n[bad](javascript:alert(1))'});
  assert.doesNotMatch(unsafe, /<script>|href="javascript:/);
  console.log('Markdown smoke passed: emphasis, tables, inline/display math, and safe HTML handling.');
} finally {
  await server.close();
}
