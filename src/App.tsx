import { useState, useCallback, useRef } from 'react';
import { decryptJson } from './crypto';
import { MappingStore, type VariableMapping } from './mapping';
import { ingestCsv, type IngestResult } from './ingest';
import { buildOverview, type OverviewEntry } from './stats';
import { purge } from './duckdb';
import { isLlmEnabled } from './llm';
import OverviewTable from './components/OverviewTable';
import DetailView from './components/DetailView';
import CrosstabView from './components/CrosstabView';
import TimeseriesView from './components/TimeseriesView';

type Phase = 'login' | 'upload' | 'app';

export default function App() {
  const [phase, setPhase] = useState<Phase>('login');
  const [store] = useState(() => new MappingStore());
  const [ingestInfo, setIngestInfo] = useState<IngestResult | null>(null);
  const [overview, setOverview] = useState<OverviewEntry[] | null>(null);
  const [selected, setSelected] = useState<OverviewEntry | null>(null);
  const [view, setView] = useState<'overview' | 'crosstab' | 'timeseries'>('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = useCallback(async (code: string) => {
    setBusy(true);
    setError('');
    try {
      const [mapping, overrides] = await Promise.all([
        fetch('encrypted/mapping.bin').then((r) => r.arrayBuffer()),
        fetch('encrypted/overrides.bin').then((r) => r.arrayBuffer()),
      ]);
      const map = await decryptJson<VariableMapping>(mapping, code);
      const ovr = await decryptJson<Record<string, string>>(overrides, code);
      store.load(map, ovr);
      setPhase('upload');
    } catch {
      setError('Zugangscode falsch.');
    } finally {
      setBusy(false);
    }
  }, [store]);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const info = await ingestCsv(file, store);
      setIngestInfo(info);
      const ov = await buildOverview(info.columns, store);
      setOverview(ov);
      setPhase('app');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [store]);

  const handlePurge = useCallback(async () => {
    await purge();
    setOverview(null);
    setIngestInfo(null);
    setSelected(null);
    setPhase('upload');
  }, []);

  const handleSelect = useCallback(async (entry: OverviewEntry) => {
    setSelected(entry);
  }, []);

  const handleBack = useCallback(() => setSelected(null), []);

  if (phase === 'login') {
    return (
      <LoginScreen onSubmit={handleLogin} busy={busy} error={error} />
    );
  }

  if (phase === 'upload') {
    return (
      <UploadScreen onFile={handleFile} busy={busy} error={error} />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>TOP 100 – Partner-Auswertung</h1>
        <div className="topbar-actions">
          <span className="badge ram">RAM-only</span>
          {isLlmEnabled() && <span className="badge llm">KI-Auswertung verfügbar</span>}
          <button className="btn danger" onClick={handlePurge}>
            Daten löschen
          </button>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {ingestInfo && (
        <div className="ingest-info">
          {ingestInfo.rows} Antworten · {ingestInfo.columns.length} Spalten ·{' '}
          {ingestInfo.matched} zugeordnet
          {ingestInfo.unmatchedColumns.length > 0 && (
            <span title={ingestInfo.unmatchedColumns.join('\n')}>
              {' '}· {ingestInfo.unmatchedColumns.length} nicht zugeordnet
            </span>
          )}
        </div>
      )}
      <nav className="tabs">
        <button className={view === 'overview' ? 'tab active' : 'tab'} onClick={() => { setView('overview'); setSelected(null); }}>Übersicht</button>
        <button className={view === 'crosstab' ? 'tab active' : 'tab'} onClick={() => { setView('crosstab'); setSelected(null); }}>Kreuztabelle</button>
        <button className={view === 'timeseries' ? 'tab active' : 'tab'} onClick={() => { setView('timeseries'); setSelected(null); }}>Zeitreihe</button>
      </nav>
      {view === 'overview' && !selected && overview && (
        <OverviewTable entries={overview} onSelect={handleSelect} />
      )}
      {view === 'overview' && selected && (
        <DetailView entry={selected} onBack={handleBack} />
      )}
      {view === 'crosstab' && <CrosstabView columns={ingestInfo?.columns ?? []} store={store} />}
      {view === 'timeseries' && <TimeseriesView columns={ingestInfo?.columns ?? []} store={store} />}
    </div>
  );
}

function LoginScreen({ onSubmit, busy, error }: {
  onSubmit: (code: string) => void;
  busy: boolean;
  error: string;
}) {
  const [code, setCode] = useState('');
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>TOP 100 – Partner-Auswertung</h1>
        <p className="notice">
          Diese Auswertungsplattform speichert keine Unternehmensdaten.
          Alle Berechnungen laufen ausschließlich lokal in Ihrem Browser
          (RAM-only). Laden Sie den LimeSurvey-Datensatz selbst hoch —
          ohne Datensatz und Zugangscode ist die Plattform nicht nutzbar.
        </p>
        <p className="notice small">
          Hinweis: Die Nutzung der Plattform kann durch den Betreiber
          protokolliert werden (Zugriffszeiten, IP-Adresse).
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(code);
          }}
        >
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Zugangscode"
            autoFocus
            autoComplete="off"
          />
          <button type="submit" disabled={busy || code.length === 0}>
            {busy ? 'Prüfen…' : 'Entsperren'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function UploadScreen({ onFile, busy, error }: {
  onFile: (f: File) => void;
  busy: boolean;
  error: string;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="upload-wrap">
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <p>LimeSurvey-Datensatz hier ablegen</p>
        <p className="small">CSV-Datei (Komma- oder Semikolon-getrennt)</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </div>
      {busy && <p className="busy">Wird geladen…</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
