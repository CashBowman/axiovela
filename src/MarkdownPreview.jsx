import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {normalizeMath} from './markdown-format.mjs';
import CodeBlock from './CodeBlock.jsx';

function decodeAssetPath(value) {
  try { return decodeURI(value); } catch { return value; }
}

export default function MarkdownPreview({source, assetUrl = src => src, copyCode = false, inline = false, onSourceLine,onLink}) {
  const Tag = inline ? 'span' : 'div';
  return <Tag className="markdownPreview"><Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, {throwOnError: false, trust: false}]]} components={{...(onSourceLine ? Object.fromEntries(["p","h1","h2","h3","li","pre","blockquote"].map(Tag=>[Tag,({node,...props})=><Tag {...props} data-source-line={node?.position?.start?.line} onDoubleClick={()=>onSourceLine(node?.position?.start?.line||1)}/>])) : {}),...(inline ? {p: ({children}) => <span>{children}</span>} : {}),...(copyCode ? {pre: CodeBlock} : {}), a: ({node, ...props}) => inline ? <span>{props.children}</span> : <a {...props} onClick={e=>{if(onLink?.(props.href))e.preventDefault();}} href={/^(?:\.\.?\/)?(?:artifacts\/figures|exports)\//.test(props.href || '') ? assetUrl(decodeAssetPath(props.href)) : props.href} target="_blank" rel="noopener noreferrer"/>, img: ({node, ...props}) => { const src = assetUrl(decodeAssetPath(props.src || '')); return src ? <img {...props} src={src}/> : <span>[Image: {props.alt || 'external image omitted'}]</span>; }}}>{normalizeMath(source)}</Markdown></Tag>;
}
