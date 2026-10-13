// LLM-Integration: striktes Opt-in, standardmäßig deaktiviert.
// Der Partner-Proxy läuft auf Fraunhofer-Infrastruktur; nur dessen URL ist
// im Bundle konfigurierbar (via Vite-Env zur Build-Zeit). Der Fraunhofer-
// Token liegt NUR im Proxy, nie im Frontend.
//
// Datenschutz-Modell:
// - Ohne explizite Freischaltung werden KEINE Daten an den Proxy gesendet.
// - Bei aktivierter Auswertung gehen ausschließlich die aggregierten
//   Kennzahlen (n, mean, Kategorien) an den Proxy — nie Rohdaten-Zeilen
//   oder Unternehmensnamen.

export interface LlmConfig {
  proxyUrl: string;
  model: string;
}

export const LLM_DEFAULTS: LlmConfig = {
  // Zur Build-Zeit konfigurierbar; leer = Feature deaktiviert
  proxyUrl: import.meta.env.VITE_LLM_PROXY_URL ?? '',
  model: import.meta.env.VITE_LLM_MODEL ?? 'default',
};

export interface LlmAnalysisRequest {
  variableLabel: string;
  stats: Record<string, unknown>;
}

export interface LlmAnalysisResponse {
  analysis: string;
}

export function isLlmEnabled(): boolean {
  return LLM_DEFAULTS.proxyUrl !== '';
}

/** Sendet NUR aggregierte Kennzahlen an den Proxy. */
export async function requestLlmAnalysis(
  req: LlmAnalysisRequest
): Promise<LlmAnalysisResponse> {
  if (!isLlmEnabled()) {
    throw new Error('LLM-Auswertung ist nicht aktiviert.');
  }
  if (!LLM_DEFAULTS.proxyUrl) {
    throw new Error('Keine Proxy-URL konfiguriert.');
  }
  const resp = await fetch(`${LLM_DEFAULTS.proxyUrl}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLM_DEFAULTS.model,
      variable: req.variableLabel,
      stats: req.stats,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Proxy-Fehler ${resp.status}`);
  }
  return (await resp.json()) as LlmAnalysisResponse;
}
