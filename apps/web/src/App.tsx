import { useState } from 'react';
import { DocumentsView } from './views/DocumentsView.js';

const NAV = [
  { id: 'documents', label: 'Documents', ready: true },
  { id: 'chat', label: "Let's Chat", ready: false },
  { id: 'connectors', label: 'Connectors', ready: false },
  { id: 'jobs', label: 'Scheduler', ready: false },
];

export function App() {
  const [view, setView] = useState('documents');
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span className="logo">Madav</span></div>
        <div className="tagline">Next · built on the new engine</div>
        <nav>{NAV.map((n) => <button key={n.id} className={'nav' + (view === n.id ? ' on' : '')} disabled={!n.ready} onClick={() => n.ready && setView(n.id)}>{n.label}{!n.ready && <span className="soon">soon</span>}</button>)}</nav>
        <div className="foot">Phases 0–2 · deterministic engine + cloud spine</div>
      </aside>
      <main className="main">{view === 'documents' ? <DocumentsView /> : <div className="todo">This view migrates from the legacy app next. Nothing is removed until its replacement is proven.</div>}</main>
    </div>
  );
}
