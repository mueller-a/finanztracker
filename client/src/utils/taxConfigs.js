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

  // ────── Steuerrecht 2027 (ENTWURF, Stand 04.11.2026) ──
  // NICHT beschlossen. Quellen: Einkommensteuerreformgesetz 2027 (Kabinett
  // 02.09.2026, Bundesrat hat am 16.10.2026 Änderungen gefordert, 2./3. Lesung
  // offen), BMF-PAP-Entwurf 2027 (08.10.2026), SV-Rechengrößenverordnung 2027
  // (Kabinett 07.10.2026, Bundesrat offen), Pflegeneuordnungsgesetz (Kabinett
  // 30.09.2026). Der Progressionsbericht kann Grund- und Kinderfreibetrag noch
  // leicht ändern.
  // Wesentliche Änderungen ggü. 2026:
  //   • Grundfreibetrag 12.348 → 12.564 €
  //   • 42 % ab 70.601 € (vorher 69.879 €)
  //   • 45 % ab 250.000 € (vorher 277.826 €)
  //   • NEU: 47 % ab 280.000 € (Zone 6)
  //   • Arbeitnehmer-Pauschbetrag 1.230 → 1.430 €
  //   • Kinderfreibetrag gesamt 9.756 → 10.056 € pro Kind
  //   • PV-Kinderlosenzuschlag 0,6 → 0,9 %
  // Ersetzen, sobald UPTAB27 endgültig vorliegt.
  {
    validFrom:       '2027-01-01',
    year:            2027,
    label:           '2027 – Entwurf',
    entwurf: {
      stand:   '04.11.2026',
      hinweis: 'Das Einkommensteuerreformgesetz 2027 ist noch nicht beschlossen, die SV-Rechengrößen brauchen noch die Zustimmung des Bundesrats. Die Werte können sich ändern. Die Soli-Freigrenze 2027 ist noch nicht bekannt, gerechnet wird vorläufig mit dem Wert von 2026.',
      offeneParameter: ['soliFreigrenze'],
    },
    // Tarif §32a EStG (Entwurf)
    gfb:             12564,
    zone2End:        17799,
    zone3End:        70600,
    zone4End:        249999,    // 45 % gilt ab 250.000 € inklusive
    zone5End:        279999,    // 47 % gilt ab 280.000 € inklusive
    tarifZ2a:        952.24,
    tarifZ2b:        1400,
    tarifZ3a:        170.74,
    tarifZ3b:        2397,
    tarifZ3c:        993.86,
    tarifZ4Satz:     0.42,
    tarifZ4Abzug:    11241.73,
    tarifZ5Satz:     0.45,
    tarifZ5Abzug:    18741.70,
    tarifZ6Satz:     0.47,
    tarifZ6Abzug:    24341.68,
    // Pauschbeträge
    anp:             1430,
    sap:             36,
    kfbProKindStkl4: 5028,
    kfbProKindSonst: 10056,
    // SV-AN-Anteile (Ø-Zusatzbeitrag 2,9 %, PV-Kinderlosenzuschlag 0,9 %)
    rvANRate:        0.093,
    avANRate:        0.013,
    pvANRate:        0.018,
    pvKinderlosZuschlag: 0.009,
    kvANRateAllgemein: 0.073,
    kvANRateErmaessigt: 0.07,
    kvZusatzDurchschnitt: 2.9,  // Ø-Zusatzbeitrag 2027 lt. BMG
    // Beitragsbemessungsgrenzen (Kabinettsfassung SV-Rechengrößen 2027)
    bbgKvPvJahr:     76500,     // 6.375 €/Monat
    bbgRvAlvJahr:    106200,    // 8.850 €/Monat, bundeseinheitlich
    // Soli: Freigrenze 2027 noch offen (siehe entwurf.offeneParameter),
    // Platzhalter auf 2026-Niveau
    soliSatz:        0.055,
    soliFreigrenze:  20350,
    // BMF-PAP-Endpoint (Schema 2027; offizielle URL existiert noch nicht)
    bmfUrl:          'https://www.bmf-steuerrechner.de/interface/2027Version1.xhtml',
    bmfCodeStd:      'LSt2027std',
    bmfCodeExt:      'LSt2027ext',
    // Weitere Rechengrößen. Die Engine nutzt sie noch nicht: Minijob, Midijob,
    // Knappschaft und die Sachsen-PV sind im Rechner nicht abgebildet.
    rechengroessen: {
      bbgKnappschaftJahr:   130800,  // 10.900 €/Monat
      jaegJahr:             84150,   // § 6 Abs. 6 SGB V
      jaegBesondereAbs7Jahr: 72900,  // § 6 Abs. 7 SGB V (Bestandsschutz 2002)
      jaegBesondereAbs8Jahr: 80550,  // § 6 Abs. 8 SGB V (neu ab 2027)
      bezugsgroesseMonat:   4130,
      minijobGrenzeMonat:   633,
      midijobObergrenzeMonat: 2000,  // Übergangsbereich ab 633,01 €
      midijobFaktorF:       0.7683,
      minijobKvPauschaleAG: 0.175,
      mindestlohnStunde:    14.60,
      pvANRateSachsen:      0.023,
      pvAGRateSachsen:      0.013,
      agHoechstzuschussKvMitKrankengeld:  557.81,
      agHoechstzuschussKvOhneKrankengeld: 538.69,
      agHoechstzuschussPpv: 114.75,
      agHoechstzuschussPpvSachsen: 82.88,
      kindergeldMonat:      267,
      entlastungsbetragAlleinerziehende: 4260,
      // Aufteilung des Kinderfreibetrags nicht bestätigt, vermutlich sächlich
      // 7.128 € und BEA 2.928 €. Die Engine braucht nur die Summe.
    },
    // Vom Bundesrat abgelehnt und damit besonders unsicher. Im Rechner nicht
    // abgebildet.
    unsicher: {
      minijobPauschsteuer:  0.05,
      handwerkerSatz:       0.15,
      handwerkerMax:        900,
      sfnGrundlohnGrenzeStunde: 75,  // Sonn-/Feiertag, Nacht bleibt 50 €
    },
  },

  // ────── Steuerrecht 2028 (ENTWURF, Stand 04.11.2026) ──
  // Stufe 2 des Einkommensteuerreformgesetzes 2027:
  //   • Grundfreibetrag 12.564 → 12.900 €
  //   • Kinderfreibetrag gesamt 10.056 → 10.236 € pro Kind
  //   • Rentenversicherung 18,6 % → 19,9 % (AN/AG je 9,95 %)
  // Tarifgrenzen (70.600 / 250.000 / 280.000 €), BBG, PV-Kinderlosenzuschlag
  // und alle übrigen Werte wie 2027 — für 2028 liegen dazu noch keine Angaben
  // vor. Koeffizienten Zone 2/3 und Abzugsbeträge sind aus der Stetigkeit an den
  // Zonengrenzen hergeleitet, nicht amtlich.
  {
    validFrom:       '2028-01-01',
    year:            2028,
    label:           '2028 – Entwurf',
    entwurf: {
      stand:   '04.11.2026',
      hinweis: 'Projektion: Grundfreibetrag und Kinderfreibetrag stammen aus dem Regierungsentwurf, viele andere Werte sind Platzhalter. Die Werte können sich ändern.',
      offeneParameter: ['soliFreigrenze'],
    },
    // Tarif §32a EStG (Projektion 2028)
    gfb:             12900,
    zone2End:        17799,
    zone3End:        70600,
    zone4End:        249999,    // 45 % gilt ab 250.000 € inklusive
    zone5End:        279999,    // 47 % gilt ab 280.000 € inklusive
    tarifZ2a:        1017.55,
    tarifZ2b:        1400,
    tarifZ3a:        170.74,
    tarifZ3b:        2397,
    tarifZ3c:        930.07,
    tarifZ4Satz:     0.42,
    tarifZ4Abzug:    11305.52,
    tarifZ5Satz:     0.45,
    tarifZ5Abzug:    18805.49,
    tarifZ6Satz:     0.47,
    tarifZ6Abzug:    24405.47,
    // Pauschbeträge
    anp:             1430,
    sap:             36,
    kfbProKindStkl4: 5118,
    kfbProKindSonst: 10236,
    // SV-AN-Anteile — RV steigt auf 19,9 % gesamt
    rvANRate:        0.0995,
    avANRate:        0.013,
    pvANRate:        0.018,
    pvKinderlosZuschlag: 0.009,  // Platzhalter 2027-Niveau
    kvANRateAllgemein: 0.073,
    kvANRateErmaessigt: 0.07,
    kvZusatzDurchschnitt: 2.9,  // Platzhalter 2027-Niveau
    // Beitragsbemessungsgrenzen (Platzhalter 2027-Niveau)
    bbgKvPvJahr:     76500,
    bbgRvAlvJahr:    106200,
    // Soli (Platzhalter 2026-Niveau)
    soliSatz:        0.055,
    soliFreigrenze:  20350,
    // BMF-PAP-Endpoint (Schema 2028; offizielle URL existiert noch nicht)
    bmfUrl:          'https://www.bmf-steuerrechner.de/interface/2028Version1.xhtml',
    bmfCodeStd:      'LSt2028std',
    bmfCodeExt:      'LSt2028ext',
    rechengroessen: {
      kindergeldMonat: 272,
      // Platzhalter 2027-Niveau, folgen aus BBG und Ø-Zusatzbeitrag
      agHoechstzuschussKvMitKrankengeld: 557.81,
      agHoechstzuschussPpv: 114.75,
    },
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
