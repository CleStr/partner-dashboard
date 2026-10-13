import { useMemo, useState } from 'react';
import type { OverviewEntry } from '../stats';

interface Props {
  entries: OverviewEntry[];
  onSelect: (entry: OverviewEntry) => void;
}

export default function OverviewTable({ entries, onSelect }: Props) {
  const [filter, setFilter] = useState('');
  const [group, setGroup] = useState('alle');

  const groups = useMemo(
    () => ['alle', ...new Set(entries.map((e) => e.group))],
    [entries]
  );

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return entries.filter(
      (e) =>
        (group === 'alle' || e.group === group) &&
        (f === '' ||
          e.name.toLowerCase().includes(f) ||
          e.label.toLowerCase().includes(f) ||
          e.full_name.toLowerCase().includes(f))
    );
  }, [entries, filter, group]);

  return (
    <div className="overview">
      <div className="filters">
        <input
          type="search"
          placeholder="Variable suchen (Name, Label, Fragetext)…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Label</th>
            <th>Gruppe</th>
            <th>Typ</th>
            <th>Kennzahlen</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr key={e.full_name} onClick={() => onSelect(e)}>
              <td className="mono">{e.name}</td>
              <td>{e.label}</td>
              <td>{e.group}</td>
              <td>{e.type}</td>
              <td className="stats-cell">{summarize(e.stats)}</td>
              <td>
                <button>Details</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        {filtered.length} von {entries.length} Variablen
      </p>
    </div>
  );
}

function summarize(stats: OverviewEntry['stats']): string {
  switch (stats.kind) {
    case 'metrisch':
      return `n=${stats.stats.n} · Ø=${stats.stats.mean} · Median=${stats.stats.median}`;
    case 'ordinal':
      return stats.stats.mean !== null
        ? `n=${stats.stats.n} · Ø=${stats.stats.mean} (Skala 1–6)`
        : `n=${stats.stats.n} · keine Skalen-Codierung`;
    case 'nominal':
      return `n=${stats.stats.n} · ${stats.stats.n_unique} Ausprägungen`;
    case 'text':
      return `n=${stats.stats.n} · ${stats.stats.filled} gefüllt`;
    case 'datum':
      return `n=${stats.stats.n} · ${stats.stats.valid} gültig`;
    case 'id':
      return `n=${stats.stats.n} · ${stats.stats.n_unique} eindeutig`;
    case 'error':
      return stats.stats.error;
  }
}
