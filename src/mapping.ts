// Spalten-Mapping: LimeSurvey-Fragetext -> { new_name, label, group, type, index }
// Portiert aus app.py (resolve_column / get_column_types) mit Normalisierung,
// da die Original-Keys teils Zero-Width-Characters und Trailing-Whitespace haben.

export interface MappingEntry {
  new_name: string;
  label: string;
  group: string;
  type: VarType;
  index: number;
}

export type VarType =
  | 'metrisch'
  | 'ordinal'
  | 'nominal'
  | 'text'
  | 'datum'
  | 'id';

export type VariableMapping = Record<string, MappingEntry>;

// Zero-Width- und BOM-Characters entfernen, Whitespace kollabieren, trimmen.
// Ohne diese Normalisierung matchen 27 von 261 Spalten nicht (verifiziert).
export function normalizeKey(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class MappingStore {
  private entries = new Map<string, MappingEntry>();
  private normalizedIndex = new Map<string, string>();
  private overrides = new Map<string, VarType>();

  load(mapping: VariableMapping, overrides: Record<string, string> = {}) {
    for (const [key, entry] of Object.entries(mapping)) {
      this.entries.set(key, entry);
      this.normalizedIndex.set(normalizeKey(key), key);
    }
    for (const [origName, type] of Object.entries(overrides)) {
      this.overrides.set(normalizeKey(origName), type as VarType);
    }
  }

  /** Löst einen (ggf. normalisierten) Spaltennamen auf. Gibt null zurück, wenn unbekannt. */
  resolve(column: string): MappingEntry | null {
    const original = this.normalizedIndex.get(normalizeKey(column));
    if (original === undefined) return null;
    return this.entries.get(original) ?? null;
  }

  /** Original-Mapping-Key für einen Spaltennamen (für Overrides). */
  originalKey(column: string): string | null {
    return this.normalizedIndex.get(normalizeKey(column)) ?? null;
  }

  /** Typ-Priorität wie app.py get_column_types:
   *  1. type_overrides.json (Key = Original-Spaltenname)
   *  2. Mapping-Typ
   *  3. Auto-Erkennung */
  typeOf(column: string, autoDetected: VarType): VarType {
    const origKey = this.originalKey(column);
    if (origKey !== null) {
      const override = this.overrides.get(normalizeKey(origKey));
      if (override) return override;
    }
    const entry = this.resolve(column);
    if (entry) return entry.type;
    return autoDetected;
  }

  allEntries(): MappingEntry[] {
    return [...this.entries.values()].sort((a, b) => a.index - b.index);
  }
}

// Likert- und Skalen-Codierung, portiert aus app.py describe_ordinal.
export const ORDER_MAP: Record<string, number> = {
  'trifft voll zu': 1,
  'trifft eher zu': 2,
  'trifft teils zu': 3,
  'trifft eher weniger zu': 4,
  'trifft gar nicht zu': 5,
  'trifft nicht zu': 5,
  'ist nicht relevant': 6,
  'sehr stark': 1,
  stark: 2,
  mittel: 3,
  schwach: 4,
  'sehr schwach': 5,
  'sehr hoch': 1,
  hoch: 2,
  niedrig: 4,
  'sehr niedrig': 5,
  'sehr wichtig': 1,
  wichtig: 2,
  'weniger wichtig': 3,
  unwichtig: 4,
  'sehr unwichtig': 5,
  // Wirkung der Innovation (5-stufig)
  'erste wirkung in einem engen oder internen rahmen erkennbar': 1,
  'erkennbare wirkung in einem einzelnen, klar abgegrenzten einsatzbereich': 2,
  'klare wirkung in einem relevanten geschäfts- oder organisationsbereich': 3,
  'starke wirkung über mehrere bereiche, kundengruppen oder prozesse hinweg': 4,
  'sehr starke wirkung mit unternehmensweit oder strategisch hoher bedeutung': 5,
};

export function likertCode(value: string): number | undefined {
  return ORDER_MAP[value.trim().toLowerCase()];
}
