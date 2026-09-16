import React, {useContext, useEffect, useState} from 'react';
import {MessageSquarePlus} from 'lucide-react';
import {FeedbackContext} from './WorkspaceFeedback.jsx';

export default function FigureFeedbackButton({figure, revision}) {
  const feedback=useContext(FeedbackContext),[busy,setBusy]=useState(false),[document,setDocument]=useState(null);
  const target={kind:'figure',path:figure.path,role:feedback?.role || 'experiment'};
  const identity=JSON.stringify(target);
  const notes=feedback?.notes.filter(n=>JSON.stringify(n.target)===identity)||[];
  useEffect(()=>{
    setDocument(null);let live=true;
    if(notes.length && feedback?.root)feedback.request('/api/annotations/document',{method:'POST',body:JSON.stringify({target})}).then(async doc=>{
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(doc.source+'\0'+doc.revision)))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(live)setDocument({...doc,hash});
    }).catch(()=>{});
    return()=>{live=false;};
  },[feedback?.root,identity,revision,notes.map(n=>n.id+':'+n.sourceHash).join('|')]);
  if(!feedback?.root)return null;
  const saved=notes.filter(n=>n.sourceHash===document?.hash);
  const pending=feedback.pending?.surface===identity;
  async function annotate(e){
    e.preventDefault();e.stopPropagation();const pin=e.currentTarget.getBoundingClientRect();
    const r=e.currentTarget.parentElement.querySelector('img')?.getBoundingClientRect() || pin;
    const project=feedback.root,scope=feedback.scope;setBusy(true);
    try{
      if(saved.length){feedback.edit(saved.at(-1), pin);return;}
      const doc=await feedback.request('/api/annotations/document',{method:'POST',body:JSON.stringify({target}),headers:{'x-axiovela-project':project}});
      await feedback.capture({target,source:doc.source,revision:doc.revision,surface:identity,expectedRoot:project,expectedScope:scope,position:{left:r.left,top:r.top,width:r.width,height:r.height},anchor:{kind:'figure',start:0,end:doc.source.length,quote:doc.source,focusFeedback:true}});
    }catch(error){feedback.setError(error.message);}finally{setBusy(false);}
  }
  return <button type="button" data-annotation-ui="true" className={'figureFeedbackButton'+(saved.length||pending?' hasFeedback':'')} aria-label={`${saved.length?'Edit feedback on':'Add feedback on'} ${figure.title||figure.name||figure.path}`} title={saved.length?'Edit image feedback':'Add image feedback'} disabled={busy} onMouseUp={e=>e.stopPropagation()} onClick={annotate}><MessageSquarePlus size={16}/>{saved.length>0&&<span>{saved.length}</span>}</button>;
}
