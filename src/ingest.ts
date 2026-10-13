// CSV-Ingest: Drag & Drop, Delimiter-Erkennung, Auto-Mapping gegen das
// entschlüsselte Variablen-Mapping, DuckDB-Load (RAM-only).

import Papa from 'papaparse';
import { loadCsv, columnNames, rowCount, query } from './duckdb';
import { MappingStore, normalizeKey } from './mapping';

export interface IngestResult {
  rows: number;
  columns: string[];
  matched: number;
  unmatchedColumns: string[];
}

/** Erkennt Komma vs. Semikolon (LimeSurvey-Export kann beides sein). */
function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

/** Liest nur die Header-Zeile per Papa.parse (Header-only). */
function parseHeaders(csvText: string, delimiter: string): string[] {
  const result = Papa.parse<string[]>(csvText, {
    delimiter,
    preview: 1,
    skipEmptyLines: false,
  });
  return (result.data[0] as string[]) ?? [];
}

export async function ingestCsv(
  file: File,
  store: MappingStore
): Promise<IngestResult> {
  const csvText = await file.text();
  const delimiter = detectDelimiter(csvText);
  const headers = parseHeaders(csvText, delimiter);

  // Auto-Mapping: jede CSV-Spalte gegen das Mapping prüfen (normalisiert)
  const unmatchedColumns: string[] = [];
  for (const h of headers) {
    if (store.resolve(h) === null) unmatchedColumns.push(h);
  }

  const rows = await loadCsv(csvText, delimiter);
  const columns = await columnNames();

  return {
    rows,
    columns,
    matched: headers.length - unmatchedColumns.length,
    unmatchedColumns,
  };
}

/** Vorschau der ersten n Zeilen für die UI. */
export async function previewRows(n = 10): Promise<Record<string, string>[]> {
  const cols = await columnNames();
  const quoted = cols.map((c) => `"${c}"`).join(', ');
  return query<Record<string, string>>(
    `SELECT ${quoted} FROM responses LIMIT ${n}`
  );
}

export { rowCount, normalizeKey };
