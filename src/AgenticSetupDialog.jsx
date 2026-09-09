import React, {useEffect, useRef} from 'react';
import {X, Network} from 'lucide-react';
import ConnectionSetup from './ConnectionSetup.jsx';

export default function AgenticSetupDialog({problem, busy, retry, close, onUseApi}) {
  const dialog = useRef(null);
  const state = problem.agentic || {};
  useEffect(() => { const previous = document.activeElement; const node = dialog.current; node.showModal(); return () => { node.close(); previous?.focus(); }; }, []);
  return <dialog className="agenticSetupDialog" ref={dialog} aria-labelledby="agentic-setup-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header><div className="setupHeading"><Network size={23}/><div><small>PI + HERDR</small><h2 id="agentic-setup-title">Get Agentic mode ready</h2></div></div><button className="textButton" aria-label="Close Agentic setup" disabled={busy} onClick={close}><X/></button></header>
    <p role="alert" className="setupProblem">{problem.message}</p>
    <div className="setupStates"><span className={state.piAvailable ? 'ready' : ''}>Pi · {state.piAvailable ? 'Ready' : state.piInstalled ? 'Sign-in needed' : 'Setup needed'}</span><span className={state.herdrReady ? 'ready' : ''}>Herdr · {state.herdrReady ? 'Ready' : state.herdrAvailable ? 'Needs attention' : 'Not found'}</span></div>
    <p>Pi runs the AI agents. Herdr coordinates their work. Install these once; Axiovela starts Herdr when you enable Agentic mode.</p>
    <ConnectionSetup id="pi" includeHerdr onUseApi={busy ? undefined : onUseApi}/>
    <footer><span role="status">{busy ? 'Checking tools and starting Herdr…' : 'Retry checks setup and enables Full access.'}</span><button className="newBtn" disabled={busy} onClick={retry}>{busy ? 'Getting ready…' : 'Retry and enable'}</button></footer>
  </dialog>;
}
