// Verbraucherpreisindex (VPI) für Deutschland.
// Quelle: Destatis, Tabelle 61111-0001, Basisjahr 2020 = 100.
//
// Diese Werte dienen als Default/Fallback, falls die Live-Edge-Function
// `destatis-vpi` nicht erreichbar ist (z. B. fehlende API-Credentials).
// Sie werden vom `useInflationData`-Hook genutzt und alle 24h aus der
// optionalen Edge Function aktualisiert (siehe supabase/functions/destatis-vpi/).

// Werte synchronisiert mit Destatis Live-API (Stand: April 2026,
// abgerufen über die Edge-Function `destatis-vpi`).
export const VPI_FALLBACK = {
  1991: 61.9,
  1992: 65.0,
  1993: 67.9,
  1994: 69.7,
  1995: 71.0,
  1996: 72.0,
  1997: 73.4,
  1998: 74.0,
  1999: 74.5,
  2000: 75.5,
  2001: 77.0,
  2002: 78.1,
  2003: 78.9,
  2004: 80.2,
  2005: 81.5,
  2006: 82.8,
  2007: 84.7,
  2008: 86.9,
  2009: 87.2,
  2010: 88.1,
  2011: 90.0,
  2012: 91.7,
  2013: 93.1,
  2014: 94.0,
  2015: 94.5,
  2016: 95.0,
  2017: 96.4,
  2018: 98.1,
  2019: 99.5,
  2020: 100.0, // Basisjahr
  2021: 103.1,
  2022: 110.2, // Energiepreiskrise
  2023: 116.7,
  2024: 119.3,
  2025: 121.9,
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
