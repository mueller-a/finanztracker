// Pure Utilities für die Gehaltshistorie & Prognose.
//
// `enrichWithSteigerung(rows)` reichert eine sortierte Liste um die
// prozentuale Steigerung gegenüber dem Vorjahres-Brutto an
// (Formel: ((current / previous) - 1) * 100).
//
// `buildEstimateNet(baseParams, calcGehaltResult)` liefert eine Funktion
// brutto → netto, die die bestehende Gehaltsrechner-Logik mit fixen
// Default-Parametern (Steuerklasse, Bundesland, Kinderfreibetrag, …)
// nutzt, aber das Brutto austauscht. Für die Historie reicht eine grobe
// Schätzung; manuelle Werte überschreiben den Schätzwert.

export function enrichWithSteigerung(rows) {
  const sorted = [...rows].sort((a, b) => a.year - b.year);
  return sorted.map((r, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const steigerungPct = prev && Number(prev.annual_gross) > 0
      ? ((Number(r.annual_gross) - Number(prev.annual_gross)) / Number(prev.annual_gross)) * 100
      : null;
    return {
      ...r,
      grossMonthly: Number(r.annual_gross) / 12,
      steigerungPct,
    };
  });
}

// Reichert die Tabellen-Zeilen um Inflations-Daten an:
//   - inflationPct  = jährliche Inflation gegenüber Vorjahres-VPI
//   - realGross     = nominales Brutto bereinigt auf Basisjahr (= ältestes Jahr in `rows`)
//                     Formel: realGross = nominalGross * (VPI[base] / VPI[year])
//   - realPctVsBase = Kaufkraft-Veränderung ggü. Basisjahr in %
//
// `vpi`             — Map { year: vpi } (z.B. aus useInflationData)
// `futureInflPct`   — User-Erwartung für Jahre ohne VPI-Wert
export function enrichWithInflation(rows, vpi, futureInflPct = 2) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const sorted = [...rows].sort((a, b) => a.year - b.year);
  const baseYear = sorted[0].year;

  // Lokale VPI-Map, die fehlende Jahre via Inflations-Erwartung extrapoliert.
  // Iteration aufsteigend: für jedes Jahr ohne VPI nehmen wir letzten bekannten × (1 + i/100).
  const factor = 1 + (Number(futureInflPct) || 0) / 100;
  const localVpi = { ...vpi };
  let lastKnownYear = baseYear in localVpi ? baseYear : null;
  for (const r of sorted) {
    if (r.year in localVpi) {
      lastKnownYear = r.year;
      continue;
    }
    // Brücke: vom letzten bekannten Jahr bis r.year linear hoch
    if (lastKnownYear == null) continue;
    let cursor = localVpi[lastKnownYear];
    for (let y = lastKnownYear + 1; y <= r.year; y++) {
      cursor *= factor;
      localVpi[y] = Math.round(cursor * 10) / 10;
    }
    lastKnownYear = r.year;
  }

  const baseVpi = localVpi[baseYear];

  return sorted.map((r, i) => {
    const yearVpi = localVpi[r.year];
    const prevYearVpi = i > 0 ? localVpi[sorted[i - 1].year] : null;
    const inflationPct = (yearVpi != null && prevYearVpi != null && prevYearVpi > 0)
      ? ((yearVpi / prevYearVpi) - 1) * 100
      : null;
    const realGross = (yearVpi != null && baseVpi != null && baseVpi > 0)
      ? Number(r.annual_gross) * (baseVpi / yearVpi)
      : null;
    const realPctVsBase = (realGross != null && Number(sorted[0].annual_gross) > 0)
      ? ((realGross / Number(sorted[0].annual_gross)) - 1) * 100
      : null;
    return {
      ...r,
      vpi: yearVpi ?? null,
      inflationPct,
      realGross,
      realPctVsBase,
      baseYear,
    };
  });
}

// Liefert eine reine Funktion (gross_p_a → netto_p_m).
// Wir tauschen `ghBrutto` im baseParams aus, da der existierende Rechner
// eine Monats-Brutto erwartet. Annahme: Stellschrauben (Steuerklasse,
// Bundesland, Vorsorge, Kirchensteuer, …) bleiben über die Jahre konstant
// — eine gröbere, aber pragmatisch nützliche Schätzung.
export function buildEstimateNet(baseParams, calcGehaltResult) {
  if (!baseParams || typeof calcGehaltResult !== 'function') {
    return () => null;
  }
  return function estimateNet(annualGross) {
    if (!annualGross || annualGross <= 0) return null;
    try {
      const monthlyGross = annualGross / 12;
      const params = { ...baseParams, ghBrutto: monthlyGross };
      const r = calcGehaltResult(params, params.ghPkvBeitrag || 0, 0);
      return r?.netto ?? null;
    } catch {
      return null;
    }
  };
}
