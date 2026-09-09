import React, {lazy, Suspense} from 'react';

const MarkdownPreview = lazy(() => import('./MarkdownPreview.jsx'));

// Keep model-authored prose formatted consistently without flashing raw syntax
// while the Markdown/math renderer loads. Operational logs stay literal.
export default function ResearchText({text, inline = false}) {
  const Tag = inline ? 'span' : 'div';
  return <Tag className="researchText"><Suspense fallback={<span aria-busy="true" aria-label="Loading formatted text">…</span>}><MarkdownPreview source={String(text ?? '')} inline={inline} assetUrl={() => ''}/></Suspense></Tag>;
}
