// DuckDB-WASM: 100 % lokal im Browser, RAM-only.
// - Binaries werden aus dem eigenen Bundle geladen (kein CDN, CSP-freundlich)
// - Kein OPFS/IndexedDB-Persistenz-Handle => Daten bleiben nur im RAM
// - close() gibt alles frei; der "Daten löschen"-Button ruft genau das auf.

import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<void> | null = null;

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

async function init(): Promise<void> {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const worker = new Worker(bundle.mainWorker!);
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();
  // Kein persistenter Database-File-Handle => reines In-Memory.
}

export async function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!initPromise) {
    initPromise = init().catch((e) => {
      initPromise = null;
      throw e;
    });
  }
  await initPromise;
  return conn!;
}

export async function query<T = Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  const c = await getConn();
  const result = await c.query(sql);
  return result.toArray().map((row) => row.toJSON() as T);
}

/** Lädt CSV-Text als Tabelle `responses` (RAM-only). */
export async function loadCsv(
  csvText: string,
  delimiter: string
): Promise<number> {
  const c = await getConn();
  // Alte Daten verwerfen (RAM freigeben)
  await c.query('DROP TABLE IF EXISTS responses');
  // Datei im virtuellen FS registrieren (liegt im RAM, nicht auf Disk)
  await db!.registerFileText('upload.csv', csvText);
  await c.query(
    `CREATE TABLE responses AS SELECT * FROM read_csv('upload.csv', header = true, delim = '${delimiter}', quote = '"', escape = '"', all_varchar = true)`
  );
  return rowCount();
}

export async function rowCount(): Promise<number> {
  const rows = await query<{ n: number }>(
    'SELECT COUNT(*)::INT AS n FROM responses'
  );
  return rows[0]?.n ?? 0;
}

/** Gibt alle Daten frei und schließt die Verbindung. "Daten löschen"-Button. */
export async function purge(): Promise<void> {
  if (conn) {
    try {
      await conn.query('DROP TABLE IF EXISTS responses');
    } catch {
      /* Verbindung evtl. schon weg */
    }
    await conn.close();
    conn = null;
  }
  if (db) {
    await db.terminate();
    db = null;
  }
  initPromise = null;
}

/** Spaltennamen der geladenen Tabelle. */
export async function columnNames(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT name FROM pragma_table_info('responses') ORDER BY cid`
  );
  return rows.map((r) => r.name);
}
