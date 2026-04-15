// Verbraucherpreisindex (VPI) für Deutschland.
// Quelle: Destatis, Tabelle 61111-0001, Basisjahr 2020 = 100.
//
// Diese Werte dienen als Default/Fallback, falls die Live-Edge-Function
// `destatis-vpi` nicht erreichbar ist (z. B. fehlende API-Credentials).
// Sie werden vom `useInflationData`-Hook genutzt und alle 24h aus der
// optionalen Edge Function aktualisiert (siehe supabase/functions/destatis-vpi/).

export const VPI_FALLBACK = {
  2015: 95.5,
  2016: 95.7,
  2017: 97.1,
  2018: 98.5,
  2019: 99.9,
  2020: 100.0, // Basisjahr
  2021: 103.2,
  2022: 110.0, // Energiepreiskrise
  2023: 117.0,
  2024: 119.5,
  2025: 122.0,
};

// Standardannahme für künftige Jahre, wenn der User keine eigene Inflations-
// Erwartung eingibt. EZB-Ziel ≈ 2 %.
export const DEFAULT_FUTURE_INFLATION_PCT = 2;

// Erweitert eine VPI-Map um künftige Jahre via Inflations-Prozentwert.
// Liefert ein neues Objekt; Original bleibt unverändert.
export function extendVpiWithProjection(vpiMap, untilYear, futureInflationPct) {
  const out = { ...vpiMap };
  const years = Object.keys(out).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return out;
  const lastKnown = years[years.length - 1];
  const factor = 1 + (Number(futureInflationPct) || 0) / 100;
  let cursor = out[lastKnown];
  for (let y = lastKnown + 1; y <= untilYear; y++) {
    cursor *= factor;
    out[y] = Math.round(cursor * 10) / 10;
  }
  return out;
}
