import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {normalizeMath} from '../src/markdown-format.mjs';

export function renderMarkdown(source, assetUrl) {
  return renderToStaticMarkup(React.createElement(Markdown, {remarkPlugins: [remarkGfm, remarkMath], rehypePlugins: [[rehypeKatex, {throwOnError: false, trust: false}]], components: {img: ({alt, src}) => assetUrl?.(src) ? React.createElement('img', {alt: alt || '', src: assetUrl(src), style: {maxWidth: '100%'}}) : React.createElement('span', null, `[Image: ${alt || 'see project figure'}]`)}}, normalizeMath(source)));
}
