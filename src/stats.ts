// Statistik-Modul: Portierung der describe_*-Funktionen aus app.py
// auf DuckDB-WASM (client-seitig, RAM-only).

import { query } from './duckdb';
import { MappingStore, likertCode, type VarType } from './mapping';

export interface MetricStats {
  n: number;
  missing: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q25: number;
  q75: number;
}

export interface CategoricalStats {
  n: number;
  missing: number;
  n_unique: number;
  categories: { value: string; count: number; percent: number }[];
}

export interface OrdinalStats extends CategoricalStats {
  mean: number | null;
  std: number | null;
}

export interface TextStats {
  n: number;
  filled: number;
  missing: number;
  n_unique: number;
  avg_length: number;
}

export interface DateStats {
  n: number;
  valid: number;
  missing: number;
  min: string;
  max: string;
}

export interface IdStats {
  n: number;
  n_unique: number;
  missing: number;
}

export type ColumnStats =
  | { kind: 'metrisch'; stats: MetricStats }
  | { kind: 'ordinal'; stats: OrdinalStats }
  | { kind: 'nominal'; stats: CategoricalStats }
  | { kind: 'text'; stats: TextStats }
  | { kind: 'datum'; stats: DateStats }
  | { kind: 'id'; stats: IdStats }
  | { kind: 'error'; stats: { error: string } };

// DuckDB-Identifiers escapen (Spaltennamen sind lange Fragetexte)
export function ident(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

export async function describeMetric(col: string): Promise<MetricStats> {
  const c = ident(col);
  const rows = await query<{
    n: number;
    missing: number;
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    q25: number;
    q75: number;
  }>(
    `SELECT
       COUNT(TRY_CAST(${c} AS DOUBLE))::INT AS n,
       COUNT(*) - COUNT(TRY_CAST(${c} AS DOUBLE))::INT AS missing,
       ROUND(AVG(TRY_CAST(${c} AS DOUBLE)), 2) AS mean,
       ROUND(MEDIAN(TRY_CAST(${c} AS DOUBLE)), 2) AS median,
       ROUND(STDDEV_SAMP(TRY_CAST(${c} AS DOUBLE)), 2) AS std,
       ROUND(MIN(TRY_CAST(${c} AS DOUBLE)), 2) AS min,
       ROUND(MAX(TRY_CAST(${c} AS DOUBLE)), 2) AS max,
       ROUND(QUANTILE_CONT(TRY_CAST(${c} AS DOUBLE), 0.25), 2) AS q25,
       ROUND(QUANTILE_CONT(TRY_CAST(${c} AS DOUBLE), 0.75), 2) AS q75
     FROM responses`
  );
  const r = rows[0];
  if (!r || r.n === 0) throw new Error('Keine numerischen Werte vorhanden.');
  return {
    n: Number(r.n),
    missing: Number(r.missing),
    mean: Number(r.mean),
    median: Number(r.median),
    std: r.n > 1 ? Number(r.std) : 0,
    min: Number(r.min),
    max: Number(r.max),
    q25: Number(r.q25),
    q75: Number(r.q75),
  };
}

export async function describeCategorical(
  col: string,
  topN = 30
): Promise<CategoricalStats> {
  const c = ident(col);
  const totals = await query<{ n: number; missing: number; n_unique: number }>(
    `SELECT COUNT(*)::INT AS n,
            COUNT(*) - COUNT(${c})::INT AS missing,
            COUNT(DISTINCT ${c})::INT AS n_unique
     FROM responses`
  );
  const cats = await query<{ value: string; count: number }>(
    `SELECT COALESCE(${c}, '(leer)') AS value, COUNT(*)::INT AS count
     FROM responses
     GROUP BY 1
     ORDER BY count DESC
     LIMIT ${topN}`
  );
  const total = Number(totals[0]?.n ?? 0);
  return {
    n: total,
    missing: Number(totals[0]?.missing ?? 0),
    n_unique: Number(totals[0]?.n_unique ?? 0),
    categories: cats.map((r) => ({
      value: String(r.value),
      count: Number(r.count),
      percent: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
    })),
  };
}

export async function describeOrdinal(col: string): Promise<OrdinalStats> {
  const base = await describeCategorical(col, 1000);
  // Likert-Codierung für mean/std — client-seitig über die Kategorien
  const numeric: number[] = [];
  for (const cat of base.categories) {
    const code = likertCode(cat.value);
    if (code !== undefined) numeric.push(...Array(cat.count).fill(code));
  }
  if (numeric.length === 0) {
    return { ...base, mean: null, std: null };
  }
  const n = numeric.length;
  const mean = numeric.reduce((a, b) => a + b, 0) / n;
  const variance =
    n > 1
      ? numeric.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
      : 0;
  return {
    ...base,
    mean: Math.round(mean * 100) / 100,
    std: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}

export async function describeText(col: string): Promise<TextStats> {
  const c = ident(col);
  const rows = await query<{
    n: number;
    filled: number;
    missing: number;
    n_unique: number;
    avg_length: number | null;
  }>(
    `SELECT
       COUNT(*)::INT AS n,
       COUNT(*) FILTER (WHERE ${c} IS NOT NULL AND TRIM(${c}) <> '')::INT AS filled,
       COUNT(*) - COUNT(${c})::INT AS missing,
       COUNT(DISTINCT ${c}) FILTER (WHERE ${c} IS NOT NULL AND TRIM(${c}) <> '')::INT AS n_unique,
       AVG(LENGTH(COALESCE(${c}, ''))) FILTER (WHERE ${c} IS NOT NULL AND TRIM(${c}) <> '') AS avg_length
     FROM responses`
  );
  const r = rows[0];
  return {
    n: Number(r?.n ?? 0),
    filled: Number(r?.filled ?? 0),
    missing: Number(r?.missing ?? 0),
    n_unique: Number(r?.n_unique ?? 0),
    avg_length:
      r?.avg_length !== null && r?.avg_length !== undefined
        ? Math.round(Number(r.avg_length) * 10) / 10
        : 0,
  };
}

export async function describeDate(col: string): Promise<DateStats> {
  const c = ident(col);
  const rows = await query<{
    n: number;
    valid: number;
    missing: number;
    min: string | null;
    max: string | null;
  }>(
    `SELECT
       COUNT(*)::INT AS n,
       COUNT(TRY_STRPTIME(${c}, '%Y-%m-%d %H:%M:%S'))::INT AS valid,
       COUNT(*) - COUNT(${c})::INT AS missing,
       STRFTIME(MIN(TRY_STRPTIME(${c}, '%Y-%m-%d %H:%M:%S')), '%Y-%m-%d') AS min,
       STRFTIME(MAX(TRY_STRPTIME(${c}, '%Y-%m-%d %H:%M:%S')), '%Y-%m-%d') AS max
     FROM responses`
  );
  const r = rows[0];
  if (!r || Number(r.valid) === 0) {
    throw new Error('Keine gültigen Datumsangaben.');
  }
  return {
    n: Number(r.n),
    valid: Number(r.valid),
    missing: Number(r.missing),
    min: String(r.min),
    max: String(r.max),
  };
}

export async function describeId(col: string): Promise<IdStats> {
  const c = ident(col);
  const rows = await query<{ n: number; n_unique: number; missing: number }>(
    `SELECT COUNT(*)::INT AS n,
            COUNT(DISTINCT ${c})::INT AS n_unique,
            COUNT(*) - COUNT(${c})::INT AS missing
     FROM responses`
  );
  const r = rows[0];
  return {
    n: Number(r?.n ?? 0),
    n_unique: Number(r?.n_unique ?? 0),
    missing: Number(r?.missing ?? 0),
  };
}

export async function describeColumn(
  col: string,
  varType: VarType
): Promise<ColumnStats> {
  try {
    switch (varType) {
      case 'metrisch':
        return { kind: 'metrisch', stats: await describeMetric(col) };
      case 'ordinal':
        return { kind: 'ordinal', stats: await describeOrdinal(col) };
      case 'nominal':
        return { kind: 'nominal', stats: await describeCategorical(col) };
      case 'text':
        return { kind: 'text', stats: await describeText(col) };
      case 'datum':
        return { kind: 'datum', stats: await describeDate(col) };
      case 'id':
        return { kind: 'id', stats: await describeId(col) };
    }
  } catch (e) {
    return {
      kind: 'error',
      stats: { error: e instanceof Error ? e.message : String(e) },
    };
  }
}

/** Overview aller Variablen (Port von /api/analysis/overview). */
export interface OverviewEntry {
  name: string;
  full_name: string;
  label: string;
  group: string;
  type: VarType;
  stats: ColumnStats;
}

export async function buildOverview(
  columns: string[],
  store: MappingStore
): Promise<OverviewEntry[]> {
  const entries: OverviewEntry[] = [];
  for (const col of columns) {
    const entry = store.resolve(col);
    const type = store.typeOf(col, 'text');
    const stats = await describeColumn(col, type);
    entries.push({
      name: entry?.new_name ?? col,
      full_name: col,
      label: entry?.label ?? '',
      group: entry?.group ?? 'unbekannt',
      type,
      stats,
    });
  }
  return entries;
}

/** Kreuztabelle: Häufigkeiten von rowVar (Zeilen) x colVar (Spalten). */
export async function crosstab(
  rowVar: string,
  colVar: string
): Promise<{ rows: string[]; cols: string[]; matrix: number[][] }> {
  const r = ident(rowVar);
  const c = ident(colVar);
  const rows = await query<{ row: string; col: string; n: number }>(
    `SELECT COALESCE(${r}, '(leer)') AS row,
            COALESCE(${c}, '(leer)') AS col,
            COUNT(*)::INT AS n
     FROM responses
     GROUP BY 1, 2
     ORDER BY 1, 2`
  );
  const rowKeys = [...new Set(rows.map((x) => x.row))];
  const colKeys = [...new Set(rows.map((x) => x.col))];
  const matrix = rowKeys.map(() => colKeys.map(() => 0));
  rows.forEach((x) => {
    const i = rowKeys.indexOf(x.row);
    const j = colKeys.indexOf(x.col);
    matrix[i][j] = Number(x.n);
  });
  return { rows: rowKeys, cols: colKeys, matrix };
}

/** Zeitreihe: Anzahl Antworten pro Tag/Monat. */
export async function timeseries(
  dateVar: string,
  granularity: 'day' | 'month' = 'day'
): Promise<{ bucket: string; n: number }[]> {
    const c = ident(dateVar);
    const fmt = granularity === 'day' ? '%Y-%m-%d' : '%Y-%m';
    const rows = await query<{ bucket: string; n: number }>(
      `SELECT STRFTIME(TRY_STRPTIME(${c}, '%Y-%m-%d %H:%M:%S'), '${fmt}') AS bucket,
              COUNT(*)::INT AS n
       FROM responses
       WHERE TRY_STRPTIME(${c}, '%Y-%m-%d %H:%M:%S') IS NOT NULL
       GROUP BY 1
       ORDER BY 1`
    );
    return rows.map((r) => ({ bucket: String(r.bucket), n: Number(r.n) }));
  }
