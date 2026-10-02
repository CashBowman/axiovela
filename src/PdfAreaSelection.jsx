import React, {useRef, useState} from "react";
import {normalizedPdfRects} from "../shared/pdf-annotations.mjs";

// Mounted only in explicit area mode. Pointer capture supports mouse, pen and touch.
export default function PdfAreaSelection({root, textRef, page, fingerprint, scale = 1, onCapture}) {
  const start = useRef(null), [box, setBox] = useState(null);
  function point(e) {
    const r = root.current.getBoundingClientRect();
    return {x:Math.max(0,Math.min(r.width,e.clientX-r.left)), y:Math.max(0,Math.min(r.height,e.clientY-r.top))};
  }
  function rectangle(e) {
    const p=point(e), a=start.current;
    return {left:Math.min(p.x,a.x),top:Math.min(p.y,a.y),width:Math.abs(p.x-a.x),height:Math.abs(p.y-a.y)};
  }
  function cancel() { start.current=null; setBox(null); }
  return <div className="pdfAreaSelection" data-annotation-ui="true" tabIndex={0}
    aria-label="Select PDF area; drag around an equation or figure; Escape cancels"
    onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();cancel();}}}
    onMouseUp={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);start.current=point(e);setBox(null);}}
    onPointerMove={e=>{if(start.current)setBox(rectangle(e));}}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onPointerUp={e=>{
      if(!start.current)return;
      e.preventDefault();e.stopPropagation();
      const selected=rectangle(e), base=root.current.getBoundingClientRect();
      cancel();
      if(selected.width<5 || selected.height<5)return;
      const pdfRects=normalizedPdfRects([selected],base.width,base.height);
      const texts=[...textRef.current.querySelectorAll('.textLayer span')].filter(el=>{
        const r=el.getBoundingClientRect(),x=(r.left+r.right)/2-base.left,y=(r.top+r.bottom)/2-base.top;
        return x>=selected.left && x<=selected.left+selected.width && y>=selected.top && y<=selected.top+selected.height;
      }).map(el=>el.textContent).filter(Boolean);
      const quote=(texts.length ? 'PDF area (approximate extracted text): '+texts.join(' ') : 'PDF area on page '+page+' (no extractable text)').slice(0,8000);
      onCapture?.({kind:'pdf-region',page,pdfRects,pdfFingerprint:fingerprint,start:0,end:quote.length,quote,
        x:pdfRects[0][0]*base.width/scale,y:pdfRects[0][1]*base.height/scale},
        {left:base.left+selected.left,top:base.top+selected.top+selected.height,width:selected.width,height:0});
    }}>
    {box && <span className="pdfAreaBox" style={box}/>}
  </div>;
}
