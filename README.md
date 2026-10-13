# TOP 100 – Partner-Auswertung

Browser-basierte Auswertung des TOP100-LimeSurvey-Datensatzes für
Compamedia-Partner. Alle Berechnungen laufen **100 % lokal im Browser**
(DuckDB-WASM, RAM-only) — es werden keine Unternehmensdaten gespeichert
oder an Dritte übertragen.

## Datenschutz-Modell

| Eigenschaft | Umsetzung |
|---|---|
| Keine Datenspeicherung | DuckDB läuft ohne Persistenz-Handle rein im RAM; „Daten löschen" gibt alles frei |
| Keine Datenübertragung | CSV wird nur lokal gelesen (File-API), Auswertung per WASM im Browser |
| Zugangscode-Schutz | Spalten-Mapping (Compamedia-IP) liegt AES-GCM-256-verschlüsselt vor; Schlüssel wird per PBKDF2 (600 000 Iterationen) aus dem Zugangscode abgeleitet |
| Kein Code im Bundle | Der Zugangscode steht in keinem Quelltext, Build-Skript oder Bundle |
| KI-Auswertung (optional) | Nur aktiv, wenn `VITE_LLM_PROXY_URL` gesetzt ist; sendet ausschließlich aggregierte Kennzahlen an den Fraunhofer-Proxy |

Ohne Datensatz **und** Zugangscode ist die Plattform nicht nutzbar.

## Bedienung (Partner)

1. **Zugangscode eingeben** — entschlüsselt das Spalten-Mapping lokal im Browser.
2. **CSV-Datei hochladen** — LimeSurvey-Export (Komma- oder Semikolon-getrennt).
   Die Datei wird ausschließlich im Browser-RAM verarbeitet.
3. Auswertungen nutzen:
   - **Übersicht** — alle Variablen mit Kennzahlen; Klick öffnet die Detailansicht
   - **Kreuztabelle** — zwei Variablen kreuzen
   - **Zeitreihe** — Antworten über die Zeit
4. **„Daten löschen"** — entfernt alle Daten aus dem RAM und kehrt zum Upload zurück.

Hinweis: Der Betreiber kann die Nutzung der Plattform protokollieren
(Zugriffszeiten, IP-Adresse) — nicht jedoch die hochgeladenen Daten.

## Betrieb (Compamedia)

### Voraussetzungen

- Node.js ≥ 20, npm
- Quelldaten: `uploads/variable_mapping.json` und `uploads/type_overrides.json`
  (liegen **außerhalb** dieses Projekts, werden nie committet)

### Neuen Zugangscode erzeugen und bauen

```powershell
# Zugangscode erzeugen (44 Zeichen, kryptografischer Zufall)
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 44 | % {[char]$_})

# Bündel mit diesem Code verschlüsseln + Build
node scripts/encrypt-mapping.mjs <CODE>   # verschlüsselt nach public/encrypted/
# oder als Einzeiler-Build mit Umgebungsvariable:
$env:ACCESS_CODE = '<CODE>'; npm run build
```

`build:bundle` nimmt den Code als Argument oder aus der Umgebungsvariablen
`ACCESS_CODE`. **Pro Partner ein eigenen Code ausgeben** und das Bündel mit
diesem Code deployen — so lässt sich einzelner Zugriff entziehen, ohne andere
zu betreffen.

### Deployment (GitHub Pages)

```powershell
npm run deploy    # build + gh-pages -d dist
```

Voraussetzungen: GitHub-Repo, in `vite.config.ts` gesetzte `base`,
Repository-Schreibrechte. Das Bündel darf öffentlich liegen — der Schutz ist
die AES-GCM-Verschlüsselung, nicht die Geheimhaltung der Dateien.

### Projektstruktur

```
src/
  duckdb.ts          DuckDB-WASM (RAM-only, Bundle-Imports ohne CDN)
  crypto.ts          AES-GCM/PBKDF2 (identisch zum Build-Skript)
  mapping.ts         MappingStore, Spalten-Zuordnung
  ingest.ts          CSV-Import (Papaparse → DuckDB)
  stats.ts           alle Kennzahlen als DuckDB-SQL
  llm.ts             optionale KI-Auswertung (opt-in pro Variable)
  components/        UI: Übersicht, Detail, Kreuztabelle, Zeitreihe
scripts/
  encrypt-mapping.mjs  Build-time-Verschlüsselung
llm-proxy/
  server.mjs         Fraunhofer-API-Proxy (separate Doku)
public/encrypted/   verschlüsseltes Mapping (wird mit deployt)
```

### KI-Auswertung aktivieren

Nur relevant, wenn der LLM-Proxy (siehe [llm-proxy/README.md](llm-proxy/README.md))
betrieben wird. Beim Build setzen:

```
VITE_LLM_PROXY_URL=https://<proxy-host>/analyze
VITE_LLM_MODEL=<FhG-Modellname>
```

Ohne beide Variablen ist das Feature vollständig deaktiviert und es fließen
keinerlei Anfragen an den Proxy.
