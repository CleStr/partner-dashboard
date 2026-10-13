# LLM-Proxy – Fraunhofer-API

Minimaler Node-Proxy (keine Abhängigkeiten) zwischen Partner-Dashboard und
Fraunhofer-LLM-API. Der API-Key verlässt den Proxy nie, Partner-Authentifizierung
ist nicht erforderlich, und es werden ausschließlich aggregierte Kennzahlen
(keine Rohdaten) weitergeleitet.

## Sicherheitsmerkmale

- **Key-Broker:** `FHG_API_KEY` liegt nur auf dem Proxy; das Frontend erhält ihn nie.
- **Egress-Whitelist:** Ausgehende Verbindungen nur zu `FHG_BASE_URL`.
- **CORS:** nur `ALLOWED_ORIGIN` (die Dashboard-URL).
- **Rate-Limit:** 30 Anfragen/min/IP (In-Memory-Sliding-Window).
- **Body-Limit:** 64 KB.
- **Kein Content-Logging:** Anfrageinhalte werden nicht protokolliert.
- **Nur `/analyze`:** ein einziger Endpunkt, JSON-in/JSON-out.

## Betrieb

```bash
FHG_API_KEY=<key> PORT=8787 ALLOWED_ORIGIN=https://<dashboard-host> node server.mjs
```

| Variable | Pflicht | Default | Bedeutung |
|---|---|---|---|
| `FHG_API_KEY` | ja | – | Fraunhofer-API-Key (ohne: Start bricht ab) |
| `PORT` | nein | `8787` | Listen-Port |
| `FHG_BASE_URL` | nein | `https://api.fhgenie.fraunhofer.de/v1` | Upstream-Basis-URL |
| `ALLOWED_ORIGIN` | nein | – | Erlaubte Dashboard-Origins (Komma-getrennt) |

Start-Check: `node --check server.mjs` (Syntax) — Runtime-Test mit Dummy-Key
liefert erwartungsgemäß 502 vom Upstream, wenn die Konnektivität steht.

## Endpunkt

```
POST /analyze
Content-Type: application/json

{ "variable": "<Variablenname>", "stats": { ... aggregierte Kennzahlen ... } }
```

Antwort: `{ "summary": "<LLM-Text>" }` (Streaming vom Upstream wird gebündelt).

## Frontend-Anbindung

Im Dashboard-Build setzen (sonst ist die KI-Auswertung deaktiviert):

```
VITE_LLM_PROXY_URL=https://<proxy-host>/analyze
VITE_LLM_MODEL=<FhG-Modellname>
```

## Deployment-Hinweise (FhG-Infra)

- Node.js ≥ 20, kein Build-Schritt, keine npm-Abhängigkeiten.
- Als Dienst betreiben, z. B. systemd:

```ini
[Unit]
Description=TOP100 LLM-Proxy
After=network.target

[Service]
Environment=FHG_API_KEY=<key>
Environment=PORT=8787
Environment=ALLOWED_ORIGIN=https://<dashboard-host>
ExecStart=/usr/bin/node /opt/top100-llm-proxy/server.mjs
Restart=on-failure
User=www-data
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

- Der Proxy muss vom Dashboard-Host aus erreichbar sein (HTTPS, feste URL).
- `FHG_API_KEY` nicht in Dateien committen, sondern über Secret-Management der
  Infrastruktur setzen.
