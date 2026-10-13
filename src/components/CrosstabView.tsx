import { useState } from 'react';
import { crosstab } from '../stats';
import type { MappingStore } from '../mapping';

interface Props {
  columns: string[];
  store: MappingStore;
}

export default function CrosstabView({ columns, store }: Props) {
  const [rowVar, setRowVar] = useState('');
  const [colVar, setColVar] = useState('');
  const [result, setResult] = useState<{
    rows: string[];
    cols: string[];
    matrix: number[][];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = columns.map((c) => {
    const e = store.resolve(c);
    return { value: c, label: e ? `${e.new_name} – ${e.label}` : c };
  });

  const run = async () => {
    if (!rowVar || !colVar) return;
    setBusy(true);
    setError('');
    try {
      setResult(await crosstab(rowVar, colVar));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="crosstab">
      <div className="filters">
        <select value={rowVar} onChange={(e) => setRowVar(e.target.value)}>
          <option value="">Zeilenvariable…</option>
          {options.map((o) => (
            <option key={`r-${o.value}`} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={colVar} onChange={(e) => setColVar(e.target.value)}>
          <option value="">Spaltenvariable…</option>
          {options.map((o) => (
            <option key={`c-${o.value}`} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button onClick={run} disabled={!rowVar || !colVar || busy}>
          {busy ? 'Berechne…' : 'Kreuztabelle erstellen'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <table className="matrix-table">
          <thead>
            <tr>
              <th></th>
              {result.cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => (
              <tr key={r}>
                <th>{r}</th>
                {result.cols.map((c, j) => (
                  <td key={c}>{result.matrix[i][j]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
