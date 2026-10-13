import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { timeseries } from '../stats';
import type { MappingStore } from '../mapping';

interface Props {
  columns: string[];
  store: MappingStore;
}

export default function TimeseriesView({ columns, store }: Props) {
  const [dateVar, setDateVar] = useState('');
  const [granularity, setGranularity] = useState<'day' | 'month'>('day');
  const [error, setError] = useState('');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [data, setData] = useState<{ bucket: string; n: number }[]>([]);

  // Datumsvariablen vorschlagen (Typ "datum" aus Mapping)
  const dateCandidates = columns.filter((c) => {
    const e = store.resolve(c);
    return e?.type === 'datum';
  });

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    chartInstance.current.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: data.map((d) => d.bucket) },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: data.map((d) => d.n), smooth: true }],
      grid: { left: 48, right: 16, bottom: 40, top: 20 },
    });
  }, [data]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  const run = async () => {
    if (!dateVar) return;
    setError('');
    try {
      setData(await timeseries(dateVar, granularity));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="timeseries">
      <div className="filters">
        <select value={dateVar} onChange={(e) => setDateVar(e.target.value)}>
          <option value="">Datumsvariable…</option>
          {dateCandidates.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as 'day' | 'month')}
        >
          <option value="day">Täglich</option>
          <option value="month">Monatlich</option>
        </select>
        <button onClick={run} disabled={!dateVar}>
          Zeitreihe erstellen
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {data.length > 0 && <div ref={chartRef} className="chart" />}
    </div>
  );
}
