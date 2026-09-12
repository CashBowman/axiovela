import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft, ChevronRight, Download, Expand, FileText, X, ZoomIn, ZoomOut} from 'lucide-react';
import RichText from './ResearchText.jsx';
import {figureTitle} from './research-model.mjs';
import {organizeFigures} from './figure-organization.mjs';

export function FigureViewer({figures, initialIndex, url, close}) {
  const dialog = useRef(null);
  const stage = useRef(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState([1, 1]);
  const [bounds, setBounds] = useState([800, 600]);
  const [error, setError] = useState('');
  const figure = figures[index] || figures[0];
  const figureUrl = url(figure);
  const change = offset => setIndex(current => (current + offset + figures.length) % figures.length);
  useEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current;
    node.showModal();
    const observer = new ResizeObserver(([entry]) => setBounds([entry.contentRect.width - 32, entry.contentRect.height - 32]));
    observer.observe(stage.current);
    return () => { observer.disconnect(); node.close(); previous?.focus(); };
  }, []);
  useEffect(() => { setZoom(1); setError(''); stage.current?.scrollTo(0, 0); }, [figure.path]);
  useEffect(() => { setError(''); }, [figureUrl]);
  const fit = Math.min(bounds[0] / natural[0], bounds[1] / natural[1]);
  const keyDown = event => {
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); change(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); change(-1); }
    if (event.key === '+' || event.key === '=') setZoom(z => Math.min(4, z + .25));
    if (event.key === '-') setZoom(z => Math.max(.5, z - .25));
  };
  return createPortal(<dialog ref={dialog} className="figureViewer" aria-labelledby="figure-viewer-title" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={keyDown}>
    <header><div><small>FIGURE {index + 1} OF {figures.length}</small><h2 id="figure-viewer-title"><RichText inline text={figureTitle(figure)}/></h2></div><button onClick={close} aria-label="Close figure viewer"><X/></button></header>
    <div className="viewerTools"><button onClick={() => change(-1)} disabled={figures.length < 2} aria-label="Previous figure"><ChevronLeft/></button><button onClick={() => change(1)} disabled={figures.length < 2} aria-label="Next figure"><ChevronRight/></button><span className="viewerDivider"/><button onClick={() => setZoom(z => Math.max(.5, z - .25))} disabled={zoom <= .5} aria-label="Zoom out"><ZoomOut/></button><button onClick={() => setZoom(1)}>Fit</button><button onClick={() => setZoom(z => Math.min(4, z + .25))} disabled={zoom >= 4} aria-label="Zoom in"><ZoomIn/></button><output>{Math.round(zoom * 100)}%</output><a href={url(figure)} download={figure.name} aria-label="Download original figure"><Download size={18}/> Original</a></div>
    <div className="viewerStage" ref={stage} tabIndex={0} aria-label="Figure canvas, scroll to pan when zoomed"><div className="viewerCanvas">{error ? <p role="alert">{error}</p> : <img key={figure.path} src={figureUrl} alt={figure.caption || figureTitle(figure)} style={{width: Math.max(1, natural[0] * fit * zoom), height: Math.max(1, natural[1] * fit * zoom)}} onLoad={event => setNatural([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} onError={() => setError('This figure could not be loaded. It may have moved; refresh the project and try again.')}/>}</div></div>
    <footer><RichText text={figure.caption || 'No caption recorded.'}/>{figure.interpretation && <div><b>Interpretation: </b><RichText text={figure.interpretation}/></div>}<small>← → browse · + / − zoom · scroll to pan · Esc close</small></footer>
    <div className="viewerFilmstrip" aria-label="Browse figures">{figures.map((item, i) => <button key={item.path} onClick={() => setIndex(i)} aria-label={`View ${figureTitle(item)}`} aria-current={i === index ? 'true' : undefined}><img src={url(item)} alt=""/><span><RichText inline text={figureTitle(item)}/></span></button>)}</div>
  </dialog>, document.body);
}

export default function FigureGallery({artifacts = [], runs = [], apiBase = '', projectRoot = '', insertArtifact}) {
  const [viewer, setViewer] = useState(null);
  const [selection, setSelection] = useState('');
  const {options, unlinked, active, sections} = organizeFigures(artifacts, runs, selection);
  const figures = sections.flatMap(section => section.entries.map(entry => entry.artifact)).filter(item => item.type !== 'pdf');
  const url = item => `${apiBase}/api/artifacts/file?path=${encodeURIComponent(item.path)}&workspace=${encodeURIComponent(projectRoot)}&v=${encodeURIComponent(item.modifiedAt || '')}`;
  // Keep the viewer's navigation order while refreshing its file revisions and
  // metadata. An edited file may move to the top of the live gallery.
  const currentArtifacts = new Map(artifacts.map(item => [item.path, item]));
  const viewerFigures = viewer?.figures.map(item => currentArtifacts.get(item.path) || item);
  if (!artifacts.length && !runs.length) return <div className="emptyResearch"><FileText size={18}/><p>No figures yet.</p></div>;
  return <div className="figureGalleryPanel"><div className="galleryTools">
    <label className="figureFilter">Figures from<select aria-label="Figures from" value={active} onChange={event => { setSelection(event.target.value); setViewer(null); }}>
      <option value="">All experiments</option>
      {options.map(group => group.runs.length > 1 ? <optgroup key={group.id} label={group.label}><option value={group.id}>All · {group.label}</option>{group.runs.map(run => <option key={run.id} value={run.id}>{run.label}</option>)}</optgroup> : <option key={group.id} value={group.id}>{group.label}</option>)}
      {unlinked && <option value="unlinked">No run linked</option>}
    </select></label><span aria-live="polite">{figures.length} figure{figures.length === 1 ? '' : 's'}</span>
    </div>{!sections.length && <div className="emptyResearch"><p>No figures yet for {options.find(group => group.id === active)?.label || (active ? 'this trial' : 'these experiments')}. Names are available while work is running; figures appear when saved.</p></div>}<div className="figureSections">{sections.map(section => <section className="figureTopic" key={section.title}>
      <h3>{section.title}</h3><div className="figureGrid">{section.entries.map(({artifact, runLabel, ids}) => artifact.type === 'pdf' ? <a className="documentCard" key={artifact.path} href={url(artifact)} target="_blank" rel="noreferrer"><FileText/><div><b><RichText inline text={figureTitle(artifact)}/></b><small className="figureRunLabel" title={ids.join(', ')}>{runLabel}</small></div><span>Open PDF</span></a> : <figure key={artifact.path} draggable onDragStart={event => { event.dataTransfer.setData('application/x-workbench-artifact', JSON.stringify(artifact)); event.dataTransfer.setData('text/plain', artifact.path); }}>
        <button className="figureImage" onClick={() => setViewer({figures, index: figures.findIndex(item => item.path === artifact.path)})} aria-label={`Enlarge ${figureTitle(artifact)}`}><img loading="lazy" src={url(artifact)} alt={figureTitle(artifact)}/><span><Expand size={14}/> Enlarge</span></button><figcaption><b><RichText inline text={figureTitle(artifact)}/></b><small className="figureRunLabel" title={ids.join(', ')}>{runLabel}</small>{artifact.caption && <RichText text={artifact.caption}/>}{insertArtifact && <button className="textButton" onClick={() => insertArtifact(artifact)}>Insert into write-up</button>}</figcaption>
      </figure>)}</div>
    </section>)}</div>{viewer && <FigureViewer figures={viewerFigures} initialIndex={viewer.index} url={url} close={() => setViewer(null)}/>}</div>;
}
