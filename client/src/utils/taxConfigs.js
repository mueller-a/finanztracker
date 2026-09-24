// ─────────────────────────────────────────────────────────
//  Steuer- und SV-Konfigurationen pro Gültigkeitszeitraum
//
//  Jede Config gilt ab `validFrom` (inkl.) und bis zur nächsten Config.
//  Damit sind auch unterjährige Änderungen sauber abbildbar
//  (z.B. PV-Satz-Anhebung zum 01.07.2023).
//
//  Werte stammen aus dem offiziellen BMF-PAP
//  (bmf-steuerrechner.de/javax.faces.resource/daten/xmls/Lohnsteuer{Jahr}.xml.xhtml).
// ─────────────────────────────────────────────────────────

export const TAX_CONFIGS = [
  // ────── Steuerrecht 2025 ──────────────────────────────
  {
    validFrom:       '2025-01-01',
    year:            2025,
    label:           '2025',
    // Tarif §32a EStG (aus UPTAB25)
    gfb:             12096,
    zone2End:        17443,     // Zone 2 inklusive
    zone3End:        68480,     // Zone 3 inklusive
    zone4End:        277825,
    tarifZ2a:        932.30,
    tarifZ2b:        1400,
    tarifZ3a:        176.64,
    tarifZ3b:        2397,
    tarifZ3c:        1015.13,
    tarifZ4Satz:     0.42,
    tarifZ4Abzug:    10911.92,
    tarifZ5Satz:     0.45,
    tarifZ5Abzug:    19246.67,
    // Pauschbeträge
    anp:             1230,
    sap:             36,
    kfbProKindStkl4: 4800,
    kfbProKindSonst: 9600,
    // SV-AN-Anteile
    rvANRate:        0.093,
    avANRate:        0.013,
    pvANRate:        0.018,     // ab 2025 (3,6 %)
    pvKinderlosZuschlag: 0.006,
    kvANRateAllgemein: 0.073,   // 14,6 % / 2 — für SV-Abzug
    kvANRateErmaessigt: 0.07,   // 14,0 % / 2 — für VSP nach §39b
    kvZusatzDurchschnitt: 2.5,  // Prozent (Default, überschreibbar)
    // Beitragsbemessungsgrenzen (Jahreswerte)
    bbgKvPvJahr:     66150,
    bbgRvAlvJahr:    96600,
    // Soli (§ 3 SolzG)
    soliSatz:        0.055,
    soliFreigrenze:  19950,
    // BMF-PAP-Endpoint
    bmfUrl:          'https://www.bmf-steuerrechner.de/interface/2025Version1.xhtml',
    bmfCodeStd:      'LSt2025std',
    bmfCodeExt:      'LSt2025ext',
  },

  // ────── Steuerrecht 2026 ──────────────────────────────
  {
    validFrom:       '2026-01-01',
    year:            2026,
    label:           '2026',
    // Tarif §32a EStG (aus UPTAB26)
    gfb:             12348,
    zone2End:        17799,
    zone3End:        69878,
    zone4End:        277825,
    tarifZ2a:        914.51,
    tarifZ2b:        1400,
    tarifZ3a:        173.10,
    tarifZ3b:        2397,
    tarifZ3c:        1034.87,
    tarifZ4Satz:     0.42,
    tarifZ4Abzug:    11135.63,
    tarifZ5Satz:     0.45,
    tarifZ5Abzug:    19470.38,
    // Pauschbeträge
    anp:             1230,
    sap:             36,
    kfbProKindStkl4: 4878,
    kfbProKindSonst: 9756,
    // SV-AN-Anteile
    rvANRate:        0.093,
    avANRate:        0.013,
    pvANRate:        0.018,
    pvKinderlosZuschlag: 0.006,
    kvANRateAllgemein: 0.073,
    kvANRateErmaessigt: 0.07,
    kvZusatzDurchschnitt: 2.5,
    // Beitragsbemessungsgrenzen
    bbgKvPvJahr:     69750,
    bbgRvAlvJahr:    101400,
    // Soli
    soliSatz:        0.055,
    soliFreigrenze:  20350,
    // BMF-PAP-Endpoint
    bmfUrl:          'https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml',
    bmfCodeStd:      'LSt2026std',
    bmfCodeExt:      'LSt2026ext',
  },

  // ────── Steuerrecht 2027 (GEPLANT — Regierungsentwurf) ─
  // Quelle: Regierungsentwurf „Einkommensteuerreformgesetz 2027“, Stufe 1.
  // Wesentliche Änderungen ggü. 2026:
  //   • Grundfreibetrag 12.348 → 12.564 €
  //   • Spitzensteuersatz (42 %) ab 70.600 € (vorher 69.878 €)
  //   • 45 % bereits ab 250.000 € (vorher 277.826 €)
  //   • NEU: 47 %-Stufe ab 280.000 € (Zone 6)
  //   • Arbeitnehmer-Pauschbetrag 1.230 → 1.430 €
  //   • Kinderfreibetrag gesamt 9.756 → 10.056 € pro Kind
  // Polynomkoeffizienten Zone 2/3 nach BMF-Konvention hergeleitet
  // (Stetigkeit, Grenzsteuersatz 23,97 % am Zone-2-Ende, 42 % am Zone-3-Ende);
  // reproduziert UPTAB26 auf wenige Cent. Ersetzen, sobald UPTAB27 erscheint.
  // Zone-2-Ende, Soli-Freigrenze und BBG vorerst auf 2026-Niveau (Platzhalter —
  // der Entwurf enthält dazu keine Angaben).
  {
    validFrom:       '2027-01-01',
    year:            2027,
    label:           '2027 (geplant)',
    // Tarif §32a EStG (Projektion 2027)
    gfb:             12564,
    zone2End:        17799,
    zone3End:        70600,
    zone4End:        250000,
    zone5End:        280000,
    tarifZ2a:        952.24,
    tarifZ2b:        1400,
    tarifZ3a:        170.74,
    tarifZ3b:        2397,
    tarifZ3c:        993.86,
    tarifZ4Satz:     0.42,
    tarifZ4Abzug:    11241.60,
    tarifZ5Satz:     0.45,
    tarifZ5Abzug:    18741.60,
    tarifZ6Satz:     0.47,
    tarifZ6Abzug:    24341.60,
    // Pauschbeträge
    anp:             1430,
    sap:             36,
    kfbProKindStkl4: 5028,
    kfbProKindSonst: 10056,
    // SV-AN-Anteile (unverändert)
    rvANRate:        0.093,
    avANRate:        0.013,
    pvANRate:        0.018,
    pvKinderlosZuschlag: 0.006,
    kvANRateAllgemein: 0.073,
    kvANRateErmaessigt: 0.07,
    kvZusatzDurchschnitt: 2.5,
    // Beitragsbemessungsgrenzen (Platzhalter 2026-Niveau)
    bbgKvPvJahr:     69750,
    bbgRvAlvJahr:    101400,
    // Soli (Platzhalter 2026-Niveau)
    soliSatz:        0.055,
    soliFreigrenze:  20350,
    // BMF-PAP-Endpoint (Schema 2027; offizielle URL existiert noch nicht)
    bmfUrl:          'https://www.bmf-steuerrechner.de/interface/2027Version1.xhtml',
    bmfCodeStd:      'LSt2027std',
    bmfCodeExt:      'LSt2027ext',
  },

  // ────── Steuerrecht 2028 (GEPLANT — Regierungsentwurf) ─
  // Stufe 2 des Einkommensteuerreformgesetzes 2027:
  //   • Grundfreibetrag 12.564 → 12.900 €
  //   • Kinderfreibetrag gesamt 10.056 → 10.236 € pro Kind
  // Tarifgrenzen (70.600 / 250.000 / 280.000 €) und alle übrigen Werte wie 2027
  // — der Entwurf nennt für 2028 keine weitere Verschiebung.
  {
    validFrom:       '2028-01-01',
    year:            2028,
    label:           '2028 (geplant)',
    // Tarif §32a EStG (Projektion 2028)
    gfb:             12900,
    zone2End:        17799,
    zone3End:        70600,
    zone4End:        250000,
    zone5End:        280000,
    tarifZ2a:        1017.55,
    tarifZ2b:        1400,
    tarifZ3a:        170.74,
    tarifZ3b:        2397,
    tarifZ3c:        930.07,
    tarifZ4Satz:     0.42,
    tarifZ4Abzug:    11305.39,
    tarifZ5Satz:     0.45,
    tarifZ5Abzug:    18805.39,
    tarifZ6Satz:     0.47,
    tarifZ6Abzug:    24405.39,
    // Pauschbeträge
    anp:             1430,
    sap:             36,
    kfbProKindStkl4: 5118,
    kfbProKindSonst: 10236,
    // SV-AN-Anteile (unverändert)
    rvANRate:        0.093,
    avANRate:        0.013,
    pvANRate:        0.018,
    pvKinderlosZuschlag: 0.006,
    kvANRateAllgemein: 0.073,
    kvANRateErmaessigt: 0.07,
    kvZusatzDurchschnitt: 2.5,
    // Beitragsbemessungsgrenzen (Platzhalter 2026-Niveau)
    bbgKvPvJahr:     69750,
    bbgRvAlvJahr:    101400,
    // Soli (Platzhalter 2026-Niveau)
    soliSatz:        0.055,
    soliFreigrenze:  20350,
    // BMF-PAP-Endpoint (Schema 2028; offizielle URL existiert noch nicht)
    bmfUrl:          'https://www.bmf-steuerrechner.de/interface/2028Version1.xhtml',
    bmfCodeStd:      'LSt2028std',
    bmfCodeExt:      'LSt2028ext',
  },
];

// ─────────────────────────────────────────────────────────
//  Lookup: gültige Config für Jahr + Monat
// ─────────────────────────────────────────────────────────

/**
 * Liefert die zum Datum (year, month) passende Steuerkonfiguration.
 * Fallback auf die jüngste Config, wenn Datum vor allen validFrom.
 * @param {number} year  z.B. 2026
 * @param {number} month 1–12
 */
export function getTaxConfig(year, month) {
  const dateStr = `${year}-${String(month || 1).padStart(2, '0')}-01`;
  const sorted = [...TAX_CONFIGS].sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  return sorted.find((c) => c.validFrom <= dateStr) ?? TAX_CONFIGS[TAX_CONFIGS.length - 1];
}

/** Aktuellste verfügbare Config (letztes Array-Element). */
export const LATEST_TAX_CONFIG = TAX_CONFIGS[TAX_CONFIGS.length - 1];

/** Verfügbare Jahre für den UI-Dropdown (aufsteigend). */
export const AVAILABLE_YEARS = [...new Set(TAX_CONFIGS.map((c) => c.year))].sort();

/** Monats-Labels für UI-Dropdown. */
export const MONATE = [
  { value: 1,  label: 'Januar' },
  { value: 2,  label: 'Februar' },
  { value: 3,  label: 'März' },
  { value: 4,  label: 'April' },
  { value: 5,  label: 'Mai' },
  { value: 6,  label: 'Juni' },
  { value: 7,  label: 'Juli' },
  { value: 8,  label: 'August' },
  { value: 9,  label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Dezember' },
];
