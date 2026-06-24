import { useState } from 'react';
import { ingestWorkbook, ingestCsv, buildWorkbook, runPlan, type Table } from '@madav/documents';

const TC: Record<string, string> = { number: '#2dd4bf', string: '#93c5fd', boolean: '#fbbf24', empty: '#64748b', mixed: '#f472b6' };

export function DocumentsView() {
  const [tables, setTables] = useState<Table[]>([]);
  const [issues, setIssues] = useState<{ level: string; code: string; message: string }[]>([]);
  const [fname, setFname] = useState('');
  const [sheet, setSheet] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [fn, setFn] = useState('sum');
  const [meas, setMeas] = useState('');
  const [result, setResult] = useState<Table | null>(null);

  async function onFile(file: File) {
    try {
      let t: Table[] = [], iss: any[] = [];
      if (file.name.toLowerCase().endsWith('.csv')) { const r = ingestCsv(file.name.replace(/\.csv$/i, ''), await file.text()); t = [r.table]; iss = r.issues; }
      else { const r = ingestWorkbook(new Uint8Array(await file.arrayBuffer())); t = r.tables; iss = r.issues; }
      setTables(t); setIssues(iss); setFname(file.name); setResult(null);
      if (t[0]) { setSheet(t[0].name); setGroupBy(t[0].columns[0]?.name || ''); setMeas((t[0].columns.find((c) => c.type === 'number') || t[0].columns[0])?.name || ''); }
    } catch (e) { setIssues([{ level: 'error', code: 'READ', message: (e as Error).message }]); }
  }
  function run() {
    const t = tables.find((x) => x.name === sheet); if (!t) return;
    setResult(runPlan(t, { ops: [{ op: 'aggregate', groupBy: [groupBy], measures: [{ column: meas, fn, as: `${fn}_${meas}` }] }] }).table);
  }
  function download(t: Table, name: string) {
    const r = buildWorkbook({ name, sheets: [{ name: t.name.slice(0, 28) || 'Sheet', rows: [t.columns.map((c) => c.name), ...t.rows] }] });
    if (!r.ok) return;
    const url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const cur = tables.find((x) => x.name === sheet);
  const cols = cur?.columns.map((c) => c.name) || [];

  const tbl = (t: Table, limit = 12) => (
    <div className="tw"><table><thead><tr>{t.columns.map((c, i) => <th key={i}>{c.name}<span className="ty" style={{ color: TC[c.type] }}>{c.type}</span></th>)}</tr></thead>
      <tbody>{t.rows.slice(0, limit).map((r, ri) => <tr key={ri}>{t.columns.map((_, ci) => <td key={ci}>{String(r[ci] ?? '')}</td>)}</tr>)}</tbody></table></div>);

  return (
    <div>
      <h1>Documents</h1>
      <p className="lede">Read, process and author spreadsheets <b>deterministically — no AI model</b>. Works on any model, even the weakest.</p>
      <label className="drop">
        <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => e.target.files && e.target.files[0] && onFile(e.target.files[0])} />
        <div className="big">Choose an .xlsx or .csv</div><div className="sub">{fname || 'your file never leaves this page'}</div>
      </label>
      {issues.map((i, k) => <div key={k} className={'issue ' + i.level}><b>{i.code}</b> {i.message}</div>)}
      {tables.map((t) => <div key={t.name} className="card"><div className="card-h"><b>{t.name}</b><span className="pill">{t.columns.length} cols · {t.rowCount.toLocaleString()} rows</span>{t.truncated && <span className="pill warn">read {t.rows.length.toLocaleString()} of {t.rowCount.toLocaleString()} (cap)</span>}</div>{tbl(t)}</div>)}
      {tables.length > 0 && <div className="panel"><div className="ph">Process — no model, deterministic</div>
        <div className="row"><span>Sheet</span><select value={sheet} onChange={(e) => setSheet(e.target.value)}>{tables.map((t) => <option key={t.name}>{t.name}</option>)}</select>
          <span>Group by</span><select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>{cols.map((c) => <option key={c}>{c}</option>)}</select>
          <span>then</span><select value={fn} onChange={(e) => setFn(e.target.value)}>{['sum', 'avg', 'count', 'min', 'max'].map((f) => <option key={f}>{f}</option>)}</select>
          <span>of</span><select value={meas} onChange={(e) => setMeas(e.target.value)}>{cols.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="cy" onClick={run}>Run</button></div>
        {result && <div className="resu"><div className="card-h"><b>Result</b><span className="pill">{result.rows.length} group(s)</span><button className="cy" onClick={() => download(result, `${sheet}-${fn}-by-${groupBy}.xlsx`)}>Download .xlsx ↓</button></div>{tbl(result, 50)}</div>}
      </div>}
    </div>
  );
}
