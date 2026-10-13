import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { OverviewEntry } from '../stats';
import { isLlmEnabled, requestLlmAnalysis } from '../llm';

interface Props {
  entry: OverviewEntry;
  onBack: () => void;
}

export default function DetailView({ entry, onBack }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [llmResult, setLlmResult] = useState('');
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmError, setLlmError] = useState('');

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    const option = buildChartOption(entry);
    if (option) chart.setOption(option);
    return () => chart.dispose();
  }, [entry]);

  const chartOption = buildChartOption(entry);

  const runLlm = async () => {
    setLlmBusy(true);
    setLlmError('');
    setLlmResult('');
    try {
      const resp = await requestLlmAnalysis({
        variableLabel: entry.label || entry.name,
        stats: entry.stats as unknown as Record<string, unknown>,
      });
      setLlmResult(resp.analysis);
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : String(e));
    } finally {
      setLlmBusy(false);
    }
  };

  return (
    <div className="detail">
      <button className="btn back" onClick={onBack}>← Zurück</button>
      <h2>{entry.label || entry.name}</h2>
      <p className="small full-name">{entry.full_name}</p>
      <p className="small">Typ: {entry.type} · Gruppe: {entry.group}</p>
      {chartOption && <div ref={chartRef} className="chart" />}
      <StatsTable stats={entry.stats} />
      {isLlmEnabled() && (
        <div className="llm-box">
          <h3>KI-Auswertung (optional)</h3>
          <p className="small">
            Sendet ausschließlich die aggregierten Kennzahlen an den
            Fraunhofer-Proxy. Keine Rohdaten, keine Unternehmensnamen.
          </p>
          <button onClick={runLlm} disabled={llmBusy}>
            {llmBusy ? 'Analysiere…' : 'Kennzahlen interpretieren lassen'}
          </button>
          {llmError && <p className="error">{llmError}</p>}
          {llmResult && <p className="llm-result">{llmResult}</p>}
        </div>
      )}
    </div>
  );
}

function buildChartOption(entry: OverviewEntry): echarts.EChartsOption | null {
  const s = entry.stats;
  if (s.kind === 'ordinal' || s.kind === 'nominal') {
    const cats = s.stats.categories;
    return {
      tooltip: {},
      xAxis: {
        type: 'category',
        data: cats.map((c) => c.value),
        axisLabel: { rotate: 30, fontSize: 10 },
      },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: cats.map((c) => c.count) }],
      grid: { left: 48, right: 16, bottom: 90, top: 20 },
    };
  }
  if (s.kind === 'metrisch') {
    return {
      tooltip: {},
      xAxis: { type: 'category', data: ['min', 'q25', 'Median', 'q75', 'max'] },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: [s.stats.min, s.stats.q25, s.stats.median, s.stats.q75, s.stats.max],
        },
      ],
      grid: { left: 48, right: 16, bottom: 40, top: 20 },
    };
  }
  return null;
}

function StatsTable({ stats }: { stats: OverviewEntry['stats'] }) {
  const rows: [string, string][] = [];
  const s = stats;
  switch (s.kind) {
    case 'metrisch':
      rows.push(
        ['n', String(s.stats.n)],
        ['Fehlend', String(s.stats.missing)],
        ['Mittelwert', String(s.stats.mean)],
        ['Median', String(s.stats.median)],
        ['Std.-Abw.', String(s.stats.std)],
        ['Min', String(s.stats.min)],
        ['Max', String(s.stats.max)],
        ['Q25', String(s.stats.q25)],
        ['Q75', String(s.stats.q75)]
      );
      break;
    case 'ordinal':
    case 'nominal':
      rows.push(['n', String(s.stats.n)], ['Fehlend', String(s.stats.missing)]);
      if (s.kind === 'ordinal' && s.stats.mean !== null) {
        rows.push(['Mittelwert (Skala)', String(s.stats.mean)]);
        rows.push(['Std.-Abw. (Skala)', String(s.stats.std)]);
      }
      s.stats.categories.forEach((c) =>
        rows.push([c.value, `${c.count} (${c.percent}%)`])
      );
      break;
    case 'text':
      rows.push(
        ['n', String(s.stats.n)],
        ['Gefüllt', String(s.stats.filled)],
        ['Fehlend', String(s.stats.missing)],
        ['Eindeutig', String(s.stats.n_unique)],
        ['Ø Länge', String(s.stats.avg_length)]
      );
      break;
    case 'datum':
      rows.push(
        ['n', String(s.stats.n)],
        ['Gültig', String(s.stats.valid)],
        ['Fehlend', String(s.stats.missing)],
        ['Von', s.stats.min],
        ['Bis', s.stats.max]
      );
      break;
    case 'id':
      rows.push(
        ['n', String(s.stats.n)],
        ['Eindeutig', String(s.stats.n_unique)],
        ['Fehlend', String(s.stats.missing)]
      );
      break;
    case 'error':
      rows.push(['Fehler', s.stats.error]);
      break;
  }
  return (
    <table className="stats-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
