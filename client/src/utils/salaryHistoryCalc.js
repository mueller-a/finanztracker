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

// Liefert eine reine Funktion (gross_p_a [, year]) → netto_p_m.
// Wir tauschen `ghBrutto` im baseParams aus, da der existierende Rechner
// eine Monats-Brutto erwartet. Optional kann ein `year`-Override mitgegeben
// werden — calcGehaltResult lädt dann via getTaxConfig(year, …) die jahres-
// spezifischen Tarifeckwerte, BBGen und SV-Sätze. Stellschrauben (Steuer-
// klasse, Bundesland, Vorsorge, Kirchensteuer, …) bleiben über die Jahre
// konstant — pragmatische Schätzung für Real-Kaufkraft-Vergleiche.
export function buildEstimateNet(baseParams, calcGehaltResult) {
  if (!baseParams || typeof calcGehaltResult !== 'function') {
    return () => null;
  }
  return function estimateNet(annualGross, year) {
    if (!annualGross || annualGross <= 0) return null;
    try {
      const monthlyGross = annualGross / 12;
      const params = {
        ...baseParams,
        ghBrutto: monthlyGross,
        ...(year != null ? { ghYear: Number(year) } : {}),
      };
      const r = calcGehaltResult(params, params.ghPkvBeitrag || 0, 0);
      return r?.netto ?? null;
    } catch {
      return null;
    }
  };
}

// Reichert die Tabellen-Zeilen um Netto-Steigerungen + Kaufkraft-Veränderung an:
//   nettoMonthlyComputed — pro Jahr neu berechnetes Netto (mit jahresspezifischer
//                          getTaxConfig: Tarif, BBGen, Soli, Soli-Freigrenze, SV-Sätze).
//   nettoSteigerungPct  — Δ Netto nominal vs. Vorjahr (%)
//   realNettoSteigerungPct — Δ Real-Netto = ((Netto[t]/Netto[t-1])/(1+infl[t]))-1
//   kalteProgressionPp  — kalte-Progression-Effekt = Δ Brutto% − Δ Netto%
//
// `estimateNet` muss eine Funktion (annualGross, year) → monthlyNetto sein,
// idealerweise via `buildEstimateNet`. Existiert bereits ein manuell
// gepflegtes net_monthly in der Zeile, wird das dem Schätzwert vorgezogen.
export function enrichWithNetto(rows, estimateNet) {
  if (!Array.isArray(rows) || rows.length === 0 || typeof estimateNet !== 'function') {
    return rows;
  }
  const sorted = [...rows].sort((a, b) => a.year - b.year);
  return sorted.map((r, i) => {
    // Netto-Monatswert pro Jahr: bevorzugt manuell gepflegt, sonst per estimate
    // mit jahresspezifischer Config.
    const computed = estimateNet(Number(r.annual_gross), r.year);
    const nettoMonthly = (r.net_monthly != null ? Number(r.net_monthly) : null) ?? computed;

    // Vorjahres-Netto (gleiche Logik)
    const prev = i > 0 ? sorted[i - 1] : null;
    const prevComputed = prev ? estimateNet(Number(prev.annual_gross), prev.year) : null;
    const prevNetto = prev
      ? (prev.net_monthly != null ? Number(prev.net_monthly) : null) ?? prevComputed
      : null;

    // Δ Netto nominal
    const nettoSteigerungPct = (prevNetto != null && prevNetto > 0 && nettoMonthly != null)
      ? ((nettoMonthly - prevNetto) / prevNetto) * 100
      : null;

    // Δ Real Netto (Kaufkraft) ggü. Vorjahr
    const inflFactor = r.inflationPct != null ? 1 + r.inflationPct / 100 : null;
    const realNettoSteigerungPct = (nettoSteigerungPct != null && inflFactor != null && inflFactor > 0)
      ? ((1 + nettoSteigerungPct / 100) / inflFactor - 1) * 100
      : null;

    // Kalte Progression in Prozentpunkten = Δ Brutto% − Δ Netto%
    const kalteProgressionPp = (r.steigerungPct != null && nettoSteigerungPct != null)
      ? r.steigerungPct - nettoSteigerungPct
      : null;

    return {
      ...r,
      nettoMonthlyComputed: computed,
      nettoMonthlyEffective: nettoMonthly,
      nettoSteigerungPct,
      realNettoSteigerungPct,
      kalteProgressionPp,
    };
  });
}
