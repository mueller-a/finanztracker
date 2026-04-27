// ─────────────────────────────────────────────────────────
//  FORMATIERUNGS-HELPER  (keine DOM-Abhängigkeiten)
// ─────────────────────────────────────────────────────────

export function euro(n) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n || 0);
}

export function num(n, d) {
  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: d == null ? 1 : d
  }).format(n || 0);
}

export function fmtShort(n) {
  var a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2) + ' Mio';
  if (a >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return Math.round(n).toString();
}

// ─────────────────────────────────────────────────────────
//  CORE ENGINE — Kostenmodell Alpha / Beta / Gamma / Kappa / TER
// ─────────────────────────────────────────────────────────
//
//  Parameter-Objekt p:
//    sparrate         — monatliche Sparrate (EUR)
//    rendite          — ETF-Rendite p.a. (%)
//    inflation        — Inflation p.a. (%)
//    steuer           — Persönlicher Steuersatz im Alter (%) — NUR für Auszahlungs-
//                       Besteuerung (Halbeinkünfte/Ertragsanteil), NICHT für Sparphase.
//                       Private Rentenversicherungen haben KEINE Abgeltungsteuer in
//                       der Ansparphase (siehe Skill "domain-versicherungen").
//    vbJahr/vbMonat   — Versicherungsbeginn
//    rentenJahr/rentenMonat — Rentenbeginn
//    leben            — Rentenphase in Jahren
//    dynAktiv         — Beitragsdynamik aktiv (bool)
//    dynProzent       — jährl. Steigerung (%)
//    alphaPct         — Abschlusskosten (% der Beitragssumme)
//    betaPct          — laufende Kosten (% des Monatsbeitrags)
//    gammaPct         — Verwaltungskosten p.a. (% des Kapitals)
//    kappaEur         — Stückkosten p.a. (EUR)
//    terPct           — Fondskosten TER p.a. (%)
//
//  Formeln:
//  α  BBS = Σ geplante Monatsbeiträge
//     alphaGesamt = BBS × (alphaPct/100)
//     amortisiert über min(60, sparMonate) Monate
//
//  β  netBeitrag = aktSparrate × (1 − betaPct/100)
//  γ  monatl. Abzug = kapital × (gammaPct/100) / 12
//  κ  monatl. Abzug = kappaEur / 12
//
//  TER  rM_eff = (rendite/100)/12 − (terPct/100)/12
//       rM_net = rM_eff        ← KEIN Steuerabzug in der Sparphase!
//
export function calcPolicy(p) {
  var sparrate    = p.sparrate;
  var renditeJahr = p.rendite / 100;
  var inflationJ  = p.inflation / 100;
  var rentenJahr  = p.rentenJahr,  rentenMonat = p.rentenMonat;
  var vbJahr      = p.vbJahr,      vbMonat     = p.vbMonat;
  var leben       = p.leben;
  // Persönlicher Steuersatz im Alter — NICHT in der Sparphase angewendet.
  // Wird unten im Return-Objekt als `personalTaxRate` durchgereicht, damit UI
  // und Ruhestandsplanung ihn für Halbeinkünfte/Ertragsanteil nutzen können.
  var personalTaxRate = p.steuer || 25;
  var dynAktiv    = p.dynAktiv || false;
  var dynProzent  = (p.dynProzent || 0) / 100;

  // ── Hybrid Tracking: Snapshot als Startpunkt überschreibt Vertragsbeginn ──
  // p.snapshotStart = neuester Snapshot (für Prognose-Start)
  // p.snapshotHistory = Array aller Snapshots (für Chart-Historie)
  var snapshot = p.snapshotStart || null;
  var snapshotHistory = Array.isArray(p.snapshotHistory) ? p.snapshotHistory : [];
  var origVbJahr  = vbJahr;
  var origVbMonat = vbMonat;
  if (snapshot && snapshot.contract_value > 0) {
    var snapDate = new Date(snapshot.snapshot_date);
    vbJahr  = snapDate.getFullYear();
    vbMonat = snapDate.getMonth() + 1;
  }

  // Kosten-Modus
  var costMode          = p.costMode || 'expert';
  var effektivkostenPct = (p.effektivkosten != null ? p.effektivkosten : 1.05) / 100;

  var alphaPct = (p.alphaPct || 0) / 100;
  var betaPct  = (p.betaPct  || 0) / 100;
  var gammaPct = (p.gammaPct || 0) / 100;
  var kappaEur = p.kappaEur  || 0;
  var terPct   = (p.terPct   || 0) / 100;

  var sparMonate  = (rentenJahr - vbJahr) * 12 + (rentenMonat - vbMonat);
  if (sparMonate < 1) sparMonate = 1;
  var sparjahre   = sparMonate / 12;
  var rentenjahre = Math.max(1, leben);
  var renteMonate = rentenjahre * 12;

  var rM = renditeJahr / 12;
  var rMNet;

  if (costMode === 'simple') {
    // Simple Mode: eine Effektivkostenquote ersetzt alle α/β/γ/κ/TER
    alphaPct = 0; betaPct = 0; gammaPct = 0; kappaEur = 0; terPct = 0;
    rMNet = rM - effektivkostenPct / 12;
  } else {
    var terM = terPct / 12;
    rMNet = rM - terM;
  }

  // Für RiY: Kapital ohne jegliche Kosten, parallel tracken
  var rMNoCost = rM;

  // Alpha-Tranchen-Queue: [{monthly, remaining}]
  var alphaTranches = [];
  function addAlphaTranche(rate, restMonate) {
    if (alphaPct <= 0 || rate <= 0 || restMonate <= 0) return;
    var bbs    = rate * restMonate;
    var total  = bbs * alphaPct;
    var amortM = Math.min(60, restMonate);
    alphaTranches.push({ monthly: total / amortM, remaining: amortM });
  }
  // Initiale Tranche auf Basis der Anfangssparrate
  addAlphaTranche(sparrate, sparMonate);

  var labels = [], nomArr = [], realArr = [], einzArr = [];
  var kapital         = snapshot && snapshot.contract_value > 0 ? Number(snapshot.contract_value) : 0;
  var kapNoCost       = kapital;  // Parallelkapital ohne jegliche Kosten (für RiY)
  var totalEingezahlt = snapshot && snapshot.total_contributions_paid > 0 ? Number(snapshot.total_contributions_paid) : 0;
  var totAlpha = 0, totBeta = 0, totGamma = 0, totKappa = 0;
  if (snapshot && snapshot.total_costs_paid > 0) totAlpha = Number(snapshot.total_costs_paid);
  var inflFak     = 1;
  var aktSparrate = sparrate;

  // Anchor: alle historischen Snapshots als Datapoints in den Chart einfügen.
  // Sortiert nach Datum aufsteigend, sodass der Chart die echte Historie zeigt
  // bevor die Prognose ab dem letzten Snapshot startet.
  if (snapshotHistory.length > 0) {
    var sortedHistory = [...snapshotHistory].sort(function(a, b) {
      return new Date(a.snapshot_date) - new Date(b.snapshot_date);
    });
    sortedHistory.forEach(function(s) {
      var sDate = new Date(s.snapshot_date);
      labels.push(String(sDate.getFullYear()));
      nomArr.push(Number(s.contract_value) || 0);
      realArr.push(Number(s.contract_value) || 0);
      einzArr.push(Number(s.total_contributions_paid) || 0);
    });
  } else if (snapshot && snapshot.contract_value > 0) {
    // Fallback: nur der eine Snapshot-Anker
    labels.push(String(vbJahr));
    nomArr.push(kapital);
    realArr.push(kapital);
    einzArr.push(totalEingezahlt);
  }

  // ── SPARPHASE ──────────────────────────────────────────
  for (var m = 0; m < sparMonate; m++) {
    // Beitragsdynamik: jährliche Erhöhung → neue Alpha-Tranche (Alpha-Falle!)
    if (dynAktiv && m > 0 && m % 12 === 0) {
      var delta = aktSparrate * dynProzent;
      aktSparrate += delta;
      addAlphaTranche(delta, sparMonate - m);
    }

    // α – alle aktiven Tranchen summieren und dekrementieren
    var alphaMonat = 0;
    for (var t = 0; t < alphaTranches.length; t++) {
      if (alphaTranches[t].remaining > 0) {
        alphaMonat += alphaTranches[t].monthly;
        alphaTranches[t].remaining--;
      }
    }

    // β – Abzug vor Anlage
    var betaCost   = aktSparrate * betaPct;
    var netBeitrag = aktSparrate - betaCost;

    // γ – Verwaltungskosten auf aktuelles Kapital
    var gammaCost = kapital * gammaPct / 12;

    // κ – fixe Stückkosten
    var kappaCost = kappaEur / 12;

    kapital   = kapital   * (1 + rMNet)    + netBeitrag - alphaMonat - gammaCost - kappaCost;
    kapNoCost = kapNoCost * (1 + rMNoCost) + aktSparrate;

    totalEingezahlt += aktSparrate;
    totAlpha += alphaMonat;
    totBeta  += betaCost;
    totGamma += gammaCost;
    totKappa += kappaCost;
    inflFak  *= (1 + inflationJ / 12);

    if ((m + 1) % 12 === 0 || m === sparMonate - 1) {
      var labelJahr = vbJahr + Math.floor((vbMonat - 1 + m + 1) / 12);
      labels.push(String(labelJahr));
      nomArr.push(Math.max(0, kapital));
      realArr.push(Math.max(0, kapital / inflFak));
      einzArr.push(totalEingezahlt);
    }
  }

  var sparrateEnd     = aktSparrate;
  var kapBeiRente     = Math.max(0, kapital);
  var kapBeiRenteReal = Math.max(0, kapital / inflFak);

  // ── RiY (Reduction in Yield / Effektivkostenquote) ────────
  // Bisect: finde monatliche Rate r so dass sparrate × FV_annuität(r, n) = Zielkapital
  function bisectFV(target) {
    if (target <= 0 || sparrate <= 0 || sparMonate <= 1) return 0;
    var lo = -0.0005, hi = rM * 1.5;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      var fv  = Math.abs(mid) < 1e-9
        ? sparrate * sparMonate
        : sparrate * (Math.pow(1 + mid, sparMonate) - 1) / mid;
      if (fv < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  var rNet_mit  = bisectFV(kapBeiRente);
  var rNet_ohne = bisectFV(Math.max(kapBeiRente + 1, kapNoCost));
  var riyPct    = Math.max(0, (rNet_ohne - rNet_mit) * 12 * 100);

  // ── Auszahlungslogik: abhängig von payout_strategy ──────
  var payoutStrategy = p.payoutStrategy || 'annuity';
  var policyRentenfaktor = p.rentenfaktor || 0;

  var possibleRente = 0;
  var renteViaFaktor = 0;
  var lumpSum = kapBeiRente;

  if (payoutStrategy === 'lump_sum') {
    // Einmalzahlung — keine Rentenphase
    possibleRente = 0;
    lumpSum = kapBeiRente;
  } else if (payoutStrategy === 'annuity' && policyRentenfaktor > 0) {
    // Lebenslange Rente via Rentenfaktor
    renteViaFaktor = kapBeiRente * policyRentenfaktor / 10000;
    possibleRente  = renteViaFaktor;
  } else {
    // Fallback: Annuitätenformel (Kapitalverzehr über leben Jahre)
    if (kapBeiRente > 0) {
      if (rMNet > 0.00001) {
        possibleRente = kapBeiRente * rMNet / (1 - Math.pow(1 + rMNet, -renteMonate));
      } else {
        possibleRente = kapBeiRente / renteMonate;
      }
    }
  }

  // Break-Even: Ab wann übersteigt kumulierte Rente die Einmalzahlung?
  var breakEvenAge = null;
  if (payoutStrategy === 'annuity' && possibleRente > 0 && kapBeiRente > 0) {
    var cumRente = 0;
    for (var be = 0; be < 600; be++) { // max 50 Jahre
      cumRente += possibleRente;
      if (cumRente >= kapBeiRente) {
        breakEvenAge = Math.floor((p.rentenMonat - 1 + be) / 12);
        break;
      }
    }
  }

  // ── RENTENPHASE — γ- und κ-Kosten laufen weiter ──────
  var kapR = kapBeiRente, depletionYear = null;
  if (payoutStrategy !== 'lump_sum') {
    // Entnahme aus Rentenfaktor oder Annuität (Kapitalverzehr über `leben` Jahre).
    // Kein Wunschrente-Fallback mehr — reine Ist-Prognose.
    var renteEntnahme = payoutStrategy === 'annuity' && policyRentenfaktor > 0
      ? renteViaFaktor : possibleRente;
    for (var n = 0; n < renteMonate; n++) {
      var gammaCostR = kapR * gammaPct / 12;
      var kappaCostR = kappaEur / 12;
      kapR = kapR * (1 + rMNet) - renteEntnahme - gammaCostR - kappaCostR;
      if (kapR < 0) {
        kapR = 0;
        if (depletionYear === null) depletionYear = rentenJahr + Math.floor(n / 12);
      }
      inflFak *= (1 + inflationJ / 12);
      if ((n + 1) % 12 === 0 || n === renteMonate - 1) {
        labels.push(String(rentenJahr + Math.floor((n + 1) / 12)));
        nomArr.push(kapR);
        realArr.push(Math.max(0, kapR / inflFak));
        einzArr.push(totalEingezahlt);
      }
    }
  }

  var MONATE_KURZ  = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  var vbString     = MONATE_KURZ[vbMonat - 1]     + ' ' + vbJahr;
  var rentenString = MONATE_KURZ[rentenMonat - 1] + ' ' + rentenJahr;
  var gesamtkosten = totAlpha + totBeta + totGamma + totKappa;

  return {
    kapBeiRente, kapBeiRenteReal, possibleRente, totalEingezahlt, depletionYear,
    gewinn:   kapBeiRente - totalEingezahlt,
    faktor:   totalEingezahlt > 0 ? kapBeiRente / totalEingezahlt : 0,
    gesamtkosten,
    sparjahre:   Math.round(sparjahre * 10) / 10,
    rentenjahre,
    kapFinal:    kapR,
    labels, nomArr, realArr, einzArr,
    rentenJahr, leben,
    sparrate, sparrateEnd,
    dynAktiv, dynProzent: p.dynProzent || 0,
    vbString, rentenString,
    totAlpha, totBeta, totGamma, totKappa,
    alphaPct: p.alphaPct || 0,
    betaPct:  p.betaPct  || 0,
    gammaPct: p.gammaPct || 0,
    kappaEur: p.kappaEur || 0,
    terPct:   p.terPct   || 0,
    costMode,
    riyPct,
    effektivkosten: p.effektivkosten != null ? p.effektivkosten : 1.05,
    usingSnapshot:  !!snapshot,
    snapshotDate:   snapshot ? snapshot.snapshot_date : null,
    payoutStrategy,
    rentenfaktor: policyRentenfaktor,
    renteViaFaktor,
    lumpSum,
    breakEvenAge,
    breakEvenAlter: breakEvenAge != null ? (p.rentenJahr - p.vbJahr + breakEvenAge) : null,
    // Persönlicher Steuersatz im Alter — für Halbeinkünfte / Ertragsanteil Simulator.
    personalTaxRate,
  };
}

// ─────────────────────────────────────────────────────────
//  AVD ENGINE — Altersvorsorgedepot (pAV-Reform ab 2027)
//
//  Phase 1 (2027–2028):
//    Stufe 1: erste  360 € × 50%  → max. 180 €
//    Stufe 2: 360–1.800 € × 25%   → max. 360 €
//    Grundzulage max. 540 €/Jahr
//
//  Phase 2 (ab 2029):
//    Stufe 1: erste 1.200 € × 35% → max. 420 €
//    Stufe 2: 1.200–1.800 € × 25% → max. 150 €
//    Grundzulage max. 570 €/Jahr
//
//  Beide Phasen:
//    Über 1.800 € bis 6.840 €: keine weitere Zulage,
//    aber Abgeltungsteuerfreiheit des Depotwachstums.
//    Kinderzulage: 300 €/Kind/Jahr (voll ab 300 €/Jahr Eigenbeitrag,
//    sonst anteilig). Wirksam für erste kinderBis Sparjahre.
//
//  Steuer (nachgelagert):
//    Wachstum steuerfrei — Entnahmen: × (1 − steuerSatz)
//
//  Entnahmeplan:
//    Annuität über (leben − rentenAlter) Jahre
// ─────────────────────────────────────────────────────────

/**
 * Berechnet Grundzulage + Kinderzulage für ein konkretes Beitragsjahr.
 * Berücksichtigt automatisch Phase 1 (2027–2028) vs. Phase 2 (ab 2029).
 *
 * @param {number} eigenJahr    — jährlicher Eigenbeitrag in €
 * @param {number} kinder       — Anzahl anspruchsberechtigte Kinder
 * @param {number} beitragsjahr — Kalenderjahr der Einzahlung
 * @returns {{ grundzulage, kinderzulage, gesamt, phase, ueberFoerdergrenze }}
 */
export function calcAVDFoerderung(eigenJahr, kinder, beitragsjahr) {
  var jahr = beitragsjahr || 2027;
  var grundzulage, stufe1, stufe2;

  if (jahr >= 2029) {
    // ── Phase 2 (ab 2029) ──────────────────────────────
    stufe1 = Math.min(eigenJahr, 1200) * 0.35;                     // max 420 €
    stufe2 = Math.max(0, Math.min(eigenJahr, 1800) - 1200) * 0.25; // max 150 €
    grundzulage = stufe1 + stufe2;                                  // max 570 €
  } else {
    // ── Phase 1 (2027–2028) ────────────────────────────
    stufe1 = Math.min(eigenJahr, 360) * 0.50;                      // max 180 €
    stufe2 = Math.max(0, Math.min(eigenJahr, 1800) - 360) * 0.25;  // max 360 €
    grundzulage = stufe1 + stufe2;                                  // max 540 €
  }

  // Kinderzulage: voll ab 300 €/Jahr, sonst anteilig
  var kinderzulage = 0;
  if (kinder > 0) {
    kinderzulage = eigenJahr >= 300
      ? kinder * 300
      : kinder * 300 * (eigenJahr / 300);
  }

  return {
    grundzulage:        Math.round(grundzulage  * 100) / 100,
    kinderzulage:       Math.round(kinderzulage * 100) / 100,
    gesamt:             Math.round((grundzulage + kinderzulage) * 100) / 100,
    phase:              jahr >= 2029 ? 2 : 1,
    ueberFoerdergrenze: eigenJahr > 1800
  };
}

export function calcAVD(p) {
  var sparrate    = p.sparrate    || 0;
  var renditeJahr = (p.rendite    || 7)   / 100;
  var terJahr     = (p.ter        || 0.5) / 100;
  var inflationJ  = (p.inflation  || 2)   / 100;
  var nettoR      = Math.max(0, renditeJahr - terJahr);
  var rM          = nettoR / 12;
  var inflationM  = inflationJ / 12;

  var vbJahr      = p.vbJahr      || 2027;
  var vbMonat     = p.vbMonat     || 1;
  var rentenJahr  = p.rentenJahr  || 2055;
  var rentenMonat = p.rentenMonat || 1;
  var kinder      = Math.max(0, Math.round(p.kinder   || 0));
  var kinderBis   = p.kinderBis   || 18;
  var steuerSatz  = (p.steuerSatz || 20) / 100;
  var lebenAlter  = p.leben       || 90;
  var rentenAlter = p.rentenAlter || 67;

  var sparMonate        = Math.max(1, (rentenJahr - vbJahr) * 12 + (rentenMonat - vbMonat));
  var sparjahre         = sparMonate / 12;
  var rentenPhaseMonate = Math.max(12, (lebenAlter - rentenAlter) * 12);
  var eigenJahr         = sparrate * 12;

  // Jahres-Förderung für Ergebnisfeld (repräsentativ: erstes Jahr)
  var foerderungStart = calcAVDFoerderung(eigenJahr, kinder, vbJahr);
  var grundzulageJahr  = foerderungStart.grundzulage;
  var kinderzulageJahr = foerderungStart.kinderzulage;

  var kapital = 0, totalEigenzahlt = 0, totalStaatlich = 0;
  var totalPhase1 = 0, totalPhase2 = 0;
  var inflFak = 1;
  var labels = [], nomArr = [], realArr = [], einzArr = [];

  for (var m = 0; m < sparMonate; m++) {
    var jahrImSpar  = Math.floor(m / 12);
    var kalJahr     = vbJahr + jahrImSpar;
    // Kinderzulage nur für erste kinderBis Sparjahre
    var kindAktiv   = kinder > 0 && jahrImSpar < kinderBis;
    var foerderung  = calcAVDFoerderung(eigenJahr, kindAktiv ? kinder : 0, kalJahr);
    var staatM      = foerderung.gesamt / 12;

    kapital = kapital * (1 + rM) + sparrate + staatM;
    totalEigenzahlt += sparrate;
    totalStaatlich  += staatM;
    if (foerderung.phase === 1) totalPhase1 += staatM;
    else                        totalPhase2 += staatM;
    inflFak *= (1 + inflationM);

    if ((m + 1) % 12 === 0 || m === sparMonate - 1) {
      var labelJahr = vbJahr + Math.floor((vbMonat - 1 + m + 1) / 12);
      labels.push(String(labelJahr));
      nomArr.push(Math.max(0, kapital));
      realArr.push(Math.max(0, kapital / inflFak));
      einzArr.push(totalEigenzahlt + totalStaatlich);
    }
  }

  var kapBeiRente     = Math.max(0, kapital);
  var kapBeiRenteReal = Math.max(0, kapital / inflFak);
  var totalEinzahl    = totalEigenzahlt + totalStaatlich;
  var foerderquote    = totalEinzahl > 0 ? Math.round(totalStaatlich / totalEinzahl * 100) : 0;

  // Annuität (Brutto), dann Netto nach nachgelagerter Steuer
  var possibleRenteBrutto = 0;
  if (kapBeiRente > 0) {
    possibleRenteBrutto = rM > 0.00001
      ? kapBeiRente * rM / (1 - Math.pow(1 + rM, -rentenPhaseMonate))
      : kapBeiRente / rentenPhaseMonate;
  }
  var possibleRente = possibleRenteBrutto * (1 - steuerSatz);

  // Rentenphase für Chart
  var kapR = kapBeiRente, depletionYear = null;
  for (var n = 0; n < rentenPhaseMonate; n++) {
    kapR = kapR * (1 + rM) - possibleRenteBrutto;
    if (kapR < 0) {
      kapR = 0;
      if (depletionYear === null) depletionYear = rentenJahr + Math.floor(n / 12);
    }
    inflFak *= (1 + inflationM);
    if ((n + 1) % 12 === 0 || n === rentenPhaseMonate - 1) {
      labels.push(String(rentenJahr + Math.floor((n + 1) / 12)));
      nomArr.push(kapR);
      realArr.push(Math.max(0, kapR / inflFak));
      einzArr.push(totalEinzahl);
    }
  }

  var MONATE_KURZ  = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  var vbString     = MONATE_KURZ[vbMonat  - 1] + ' ' + vbJahr;
  var rentenString = MONATE_KURZ[rentenMonat - 1] + ' ' + rentenJahr;

  return {
    kapBeiRente, kapBeiRenteReal, possibleRente,
    totalEingezahlt: totalEinzahl,
    depletionYear,
    gewinn:      kapBeiRente - totalEinzahl,
    faktor:      totalEinzahl > 0 ? kapBeiRente / totalEinzahl : 0,
    gesamtkosten: 0,
    sparjahre:   Math.round(sparjahre * 10) / 10,
    rentenjahre: Math.round(rentenPhaseMonate / 12 * 10) / 10,
    kapFinal: kapR,
    labels, nomArr, realArr, einzArr,
    rentenJahr, leben: lebenAlter,
    sparrate, sparrateEnd: sparrate,
    dynAktiv: false, dynProzent: 0,
    vbString, rentenString,
    totAlpha: 0, totBeta: 0, totGamma: 0, totKappa: 0,
    alphaPct: 0, betaPct: 0, gammaPct: 0, kappaEur: 0, terPct: p.ter || 0.5,
    // AVD-spezifisch
    totalEigenzahlt, totalStaatlich,
    grundzulageJahr, kinderzulageJahr, foerderquote,
    possibleRenteBrutto,
    steuerSatz: p.steuerSatz || 20,
    kinder, kinderBis,
    // Phase-Tracking
    totalPhase1, totalPhase2,
    phaseWechsel: vbJahr < 2029 && rentenJahr > 2028,
    startPhase: vbJahr >= 2029 ? 2 : 1,
    ueberFoerdergrenze: eigenJahr > 1800,
    payoutStrategy: 'withdrawal_plan',
    foerderHinweis: eigenJahr > 1800
      ? 'Beitraege ueber 1.800 EUR/Jahr erhalten keine weitere Grundzulage.'
        + ' Das Depotwachstum bleibt aber abgeltungsteuerfrei (bis 6.840 EUR/Jahr).'
      : ''
  };
}

// ─────────────────────────────────────────────────────────
//  DRV ENGINE — Gesetzliche Rente (Deutsche Rentenversicherung)
//
//  Keine Kapitalakkumulation — stattdessen Ertragsprognose
//  auf Basis des letzten Rentenbescheids.
//
//  Parameter p:
//    anwartschaft      — bereits erarbeitete Rente (€/Mon, Info-only)
//    hochgerechnete    — DRV-Hochrechnung bei Rentenbeginn (€/Mon, nominal)
//    entgeltpunkte     — EP aus aktuellem Bescheid
//    rentenJahr        — Rentenbeginn-Jahr
//    rentenAnpassung   — jährl. Rentenerhöhung (%) 0–3
//    inflation         — Inflation p.a. (%) für Kaufkraft-Vergleich
//    steuerSatz        — geschätzter Einkommensteuer-Satz im Alter (%)
//    pkvNettobeitrag   — monatl. PKV-Kosten nach Rentenzuschuss (aus PKV-Modul)
// ─────────────────────────────────────────────────────────
export function calcDRV(p) {
  var anwartschaft     = Number(p.anwartschaft     || 0);
  var hochgerechnete   = Number(p.hochgerechnete   || 0);
  var entgeltpunkte    = Number(p.entgeltpunkte    || 0);
  var rentenJahr       = p.rentenJahr  || (new Date().getFullYear() + 20);
  var rentenAnpassung  = (p.rentenAnpassung  || 2)    / 100;
  var inflation        = (p.inflation        || 2)    / 100;
  var steuerSatz       = (p.steuerSatz       || 20)   / 100;
  var pkvNettobeitrag  = Number(p.pkvNettobeitrag || 0);

  var currentYear     = new Date().getFullYear();
  var yearsToRente    = Math.max(0, rentenJahr - currentYear);

  // Hochgerechnete Rente mit jährlicher Anpassung bis Rentenbeginn
  var bruttoRente      = hochgerechnete * Math.pow(1 + rentenAnpassung, yearsToRente);
  var steuerBetrag     = bruttoRente * steuerSatz;
  var nettoRente       = bruttoRente * (1 - steuerSatz) - pkvNettobeitrag;

  // Chart: Jahr für Jahr von heute bis Rentenbeginn
  var labels = [], nomArr = [], realArr = [], einzArr = [];
  for (var y = 0; y <= yearsToRente; y++) {
    var renteWithAnpassung = hochgerechnete * Math.pow(1 + rentenAnpassung, y);
    var renteForInflation  = hochgerechnete * Math.pow(1 + inflation, y);
    labels.push(String(currentYear + y));
    nomArr.push(Math.round(renteWithAnpassung  * 100) / 100);
    realArr.push(Math.round(renteForInflation  * 100) / 100);
    einzArr.push(anwartschaft);   // flat: already-earned entitlement
  }

  var MONATE_KURZ  = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  var rentenMonat  = p.rentenMonat || 1;
  var rentenString = MONATE_KURZ[rentenMonat - 1] + ' ' + rentenJahr;

  return {
    // Common fields (overview compatibility — DRV has no capital pool)
    kapBeiRente:     0,
    kapBeiRenteReal: 0,
    possibleRente:   Math.max(0, nettoRente),
    totalEingezahlt: 0,
    depletionYear:   null,
    gewinn:          0,
    faktor:          0,
    gesamtkosten:    0,
    sparjahre:       yearsToRente,
    rentenjahre:     0,
    kapFinal:        0,
    labels, nomArr, realArr, einzArr,
    rentenJahr, leben: 0,
    sparrate:        0, sparrateEnd: 0,
    dynAktiv: false, dynProzent: 0,
    vbString:        String(currentYear),
    rentenString,
    totAlpha: 0, totBeta: 0, totGamma: 0, totKappa: 0,
    alphaPct: 0, betaPct: 0, gammaPct: 0, kappaEur: 0, terPct: 0,
    // DRV-specific fields
    anwartschaft,
    hochgerechnete,
    entgeltpunkte,
    bruttoRente,
    steuerBetrag,
    pkvNettobeitrag,
    nettoRente:       Math.max(0, nettoRente),
    steuerSatz:       p.steuerSatz || 20,
    rentenAnpassung:  p.rentenAnpassung || 2,
    yearsToRente,
    currentYear,
    payoutStrategy: 'annuity', // DRV ist immer lebenslange Rente
  };
}

// ─────────────────────────────────────────────────────────
//  bAV ENGINE — Betriebliche Altersvorsorge (Typ D)
//
//  Entgeltumwandlung: Brutto-Umwandlungsbetrag + AG-Zuschuss
//  Steuervorteil: Grenzsteuersatz + SV-Ersparnis (auf eigenen Anteil)
//  Rendite: Fondsentwicklung minus Effektivkosten p.a.
//  Auszahlung: Kapital × Rentenfaktor / 10.000 = Bruttorente
//              → Nettorente nach pers. Steuersatz im Alter
// ─────────────────────────────────────────────────────────
export function calcBAV(p) {
  var sparrate      = p.sparrate   || 200;
  var agZuschussEur = p.agZuschussTyp === 'pct'
    ? sparrate * (p.agZuschuss || 0) / 100
    : (p.agZuschuss || 0);
  var totalMonthly  = sparrate + agZuschussEur;

  // Beitragsfrei-Stellung: ab "heute" werden keine neuen Beiträge mehr geleistet.
  // Vergangene Zahlungen (elapsed) bleiben im Modell erhalten; Kapital verzinst
  // sich weiter (rM bleibt aktiv). Flag steuert ausschließlich den Future-Loop.
  var isPassive           = !!p.is_passive;
  var futureMonthlyContrib = isPassive ? 0 : totalMonthly;
  var futureEigenContrib   = isPassive ? 0 : sparrate;
  var futureAgContrib      = isPassive ? 0 : agZuschussEur;

  var grenzsteuersatz = (p.grenzsteuersatz || 42) / 100;
  var nettoVerzicht   = sparrate * (1 - grenzsteuersatz);

  var renditeJahr    = (p.rendite || 7) / 100;
  var effektivKosten = (p.effektivkosten || 1.2) / 100;
  var netRendite     = Math.max(0, renditeJahr - effektivKosten);
  var rM             = netRendite / 12;
  var inflationJ     = (p.inflation || 2) / 100;
  var inflationM     = inflationJ / 12;

  var vbJahr      = p.vbJahr      || 2021;
  var vbMonat     = p.vbMonat     || 2;
  var rentenJahr  = p.rentenJahr  || 2055;
  var rentenMonat = p.rentenMonat || 1;

  var nowDate   = new Date();
  var nowYear   = nowDate.getFullYear();
  var nowMonth  = nowDate.getMonth() + 1;

  var totalMonths   = Math.max(1, (rentenJahr - vbJahr) * 12 + (rentenMonat - vbMonat));
  var elapsedMonths = Math.max(0, Math.min(totalMonths, (nowYear - vbJahr) * 12 + (nowMonth - vbMonat)));
  var futureMonths  = totalMonths - elapsedMonths;

  var deckungskapital = Number(p.deckungskapital || 0);

  // Start capital: use guarantee value if given, else simulate elapsed period
  var startKapital = deckungskapital;
  if (startKapital <= 0 && elapsedMonths > 0) {
    var simK = 0;
    for (var i = 0; i < elapsedMonths; i++) {
      simK = simK * (1 + rM) + totalMonthly;
    }
    startKapital = simK;
  }

  var kapital         = startKapital;
  var totalEingezahlt = elapsedMonths * totalMonthly;
  var totalEigenzahlt = elapsedMonths * sparrate;
  var inflFak         = 1;

  var labels = [], nomArr = [], realArr = [], einzArr = [];

  // Anchor data point at today if contract started in the past
  if (elapsedMonths > 0) {
    labels.push(String(nowYear));
    nomArr.push(Math.max(0, startKapital));
    realArr.push(Math.max(0, startKapital));
    einzArr.push(totalEingezahlt);
  }

  // Simulate future months — bei Passiv-Vertrag: Kapital verzinst sich weiter,
  // aber keine neuen Einzahlungen (futureMonthlyContrib = 0).
  for (var m = 0; m < futureMonths; m++) {
    kapital         = kapital * (1 + rM) + futureMonthlyContrib;
    totalEingezahlt += futureMonthlyContrib;
    totalEigenzahlt += futureEigenContrib;
    inflFak         *= (1 + inflationM);

    if ((m + 1) % 12 === 0 || m === futureMonths - 1) {
      var labelJahr = nowYear + Math.floor((m + 1) / 12);
      labels.push(String(labelJahr));
      nomArr.push(Math.max(0, kapital));
      realArr.push(Math.max(0, kapital / inflFak));
      einzArr.push(totalEingezahlt);
    }
  }

  var kapBeiRente     = Math.max(0, kapital);
  var kapBeiRenteReal = Math.max(0, kapital / inflFak);

  var payoutStrategy = p.payoutStrategy || 'annuity';
  var rentenfaktor   = p.rentenfaktor  || 28;
  var steuerImAlter  = (p.steuerImAlter || 27) / 100;
  var bruttorente    = payoutStrategy === 'lump_sum' ? 0 : kapBeiRente * rentenfaktor / 10000;
  var nettorente     = bruttorente * (1 - steuerImAlter);
  var lumpSum        = kapBeiRente;

  // Break-Even: Ab wann übersteigt kumulierte Rente die Einmalzahlung?
  var breakEvenMonths = null;
  if (payoutStrategy === 'annuity' && nettorente > 0 && kapBeiRente > 0) {
    breakEvenMonths = Math.ceil(kapBeiRente / nettorente);
  }

  // Summen — bei Passiv-Vertrag werden nur die bisherigen Einzahlungen (elapsed)
  // sowie AG-Zuschüsse bis heute gerechnet. Zukunft trägt 0 bei.
  var contribMonths       = isPassive ? elapsedMonths : totalMonths;
  var nettoVerzichtGesamt = contribMonths * nettoVerzicht;
  var bruttoEinsatzGesamt = contribMonths * sparrate;
  var agZuschussGesamt    = contribMonths * agZuschussEur;
  var steuervorteilGesamt = bruttoEinsatzGesamt - nettoVerzichtGesamt;
  var sparjahre = Math.round(totalMonths / 12 * 10) / 10;

  // Annual steuervorteil data for chart — ab Passiv-Markierung 0.
  var nJahre = Math.ceil(totalMonths / 12);
  var steuerVorteilData = [];
  for (var y = 0; y < nJahre; y++) {
    var mInYear = Math.min(12, totalMonths - y * 12);
    var yearLabel = vbJahr + y;
    // Sobald Passiv-Vertrag UND Jahr liegt vollständig in der Zukunft (ab Heute) → 0
    var isFutureYear = isPassive && yearLabel > nowYear;
    steuerVorteilData.push({
      year:   String(yearLabel),
      brutto: isFutureYear ? 0 : Math.round(sparrate * mInYear),
      netto:  isFutureYear ? 0 : Math.round(nettoVerzicht * mInYear),
    });
  }

  var MONATE_KURZ  = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  var vbString     = MONATE_KURZ[vbMonat  - 1] + ' ' + vbJahr;
  var rentenString = MONATE_KURZ[rentenMonat - 1] + ' ' + rentenJahr;

  return {
    // Common result fields (for overview compatibility)
    kapBeiRente, kapBeiRenteReal,
    possibleRente: payoutStrategy === 'lump_sum' ? 0 : nettorente,
    totalEingezahlt,
    depletionYear: null,
    gewinn:   kapBeiRente - totalEingezahlt,
    faktor:   totalEingezahlt > 0 ? kapBeiRente / totalEingezahlt : 0,
    gesamtkosten: 0,
    sparjahre,
    rentenjahre: 0,
    kapFinal:    kapBeiRente,
    labels, nomArr, realArr, einzArr,
    rentenJahr, leben: 0,
    sparrate, sparrateEnd: sparrate,
    dynAktiv: false, dynProzent: 0,
    vbString, rentenString,
    totAlpha: 0, totBeta: 0, totGamma: 0, totKappa: 0,
    alphaPct: 0, betaPct: 0, gammaPct: 0, kappaEur: 0, terPct: 0,
    // bAV-specific fields
    agZuschussEur, agZuschussGesamt,
    totalMonthly,
    nettoVerzicht,
    nettoVerzichtGesamt,
    bruttoEinsatzGesamt,
    steuervorteilGesamt,
    bruttorente, nettorente,
    rentenfaktor,
    payoutStrategy,
    lumpSum,
    breakEvenMonths,
    breakEvenAlter: breakEvenMonths != null ? Math.floor(breakEvenMonths / 12) : null,
    steuerImAlter:   p.steuerImAlter   || 27,
    grenzsteuersatz: p.grenzsteuersatz || 42,
    steuerVorteilData,
    elapsedMonths, futureMonths,
    deckungskapital,
    totalEigenzahlt,
  };
}

// ─────────────────────────────────────────────────────────
//  DEPOT ENGINE — Freies ETF-Depot (Typ C)
//
//  Steuer: Abgeltungssteuer 26,375% mit 30% Teilfreistellung
//    → Steuerpflichtig: Gewinn × 70%
//    → Steuer = Gewinn × 0,70 × 0,26375
//  Kosten: nur TER + optionale fixe Depotgebühr
//  Keine Alpha/Beta/Gamma-Kosten.
// ─────────────────────────────────────────────────────────
export function calcDepot(p) {
  var sparrate     = p.sparrate      || 0;
  var renditeJahr  = (p.rendite      || 7)      / 100;
  var terJahr      = (p.ter          || 0.2)    / 100;
  var depotgebuehr = p.depotgebuehr  || 0;          // EUR/Jahr fix
  var inflationJ   = (p.inflation    || 2)      / 100;
  var steuerSatz   = (p.steuer       || 26.375) / 100;
  var teilfrei     = 0.30;                           // 30 % Teilfreistellung Aktien-ETF

  var vbJahr      = p.vbJahr      || 2025;
  var vbMonat     = p.vbMonat     || 1;
  var rentenJahr  = p.rentenJahr  || 2055;
  var rentenMonat = p.rentenMonat || 1;
  var leben       = p.leben       || 22;

  // ── Hybrid Tracking: neuester Snapshot überschreibt Startwerte ─────────
  // Snapshot-Schema (policy_snapshots):
  //   contract_value           = aktueller Marktwert (=> Startkapital)
  //   total_contributions_paid = Summe bisheriger Einzahlungen (=> totalEingezahlt)
  var snapshot = p.snapshotStart || null;
  var startKapital         = 0;
  var startTotalEingezahlt = 0;
  if (snapshot && Number(snapshot.contract_value) > 0) {
    startKapital         = Number(snapshot.contract_value) || 0;
    startTotalEingezahlt = Number(snapshot.total_contributions_paid) || 0;
    var snapDate = new Date(snapshot.snapshot_date);
    vbJahr  = snapDate.getFullYear();
    vbMonat = snapDate.getMonth() + 1;
  }

  var sparMonate        = Math.max(1, (rentenJahr - vbJahr) * 12 + (rentenMonat - vbMonat));
  var sparjahre         = sparMonate / 12;
  var rentenPhaseMonate = Math.max(12, leben * 12);

  var rM            = (renditeJahr - terJahr) / 12;   // monatl. Nettorate nach TER
  var inflationM    = inflationJ / 12;
  var depotgebuehrM = depotgebuehr / 12;

  var kapital = startKapital, totalEingezahlt = startTotalEingezahlt, gesamtkosten = 0;
  var inflFak = 1;
  var labels = [], nomArr = [], realArr = [], einzArr = [];

  for (var m = 0; m < sparMonate; m++) {
    kapital = kapital * (1 + rM) + sparrate - depotgebuehrM;
    totalEingezahlt += sparrate;
    gesamtkosten    += depotgebuehrM;
    inflFak         *= (1 + inflationM);

    if ((m + 1) % 12 === 0 || m === sparMonate - 1) {
      var labelJahr = vbJahr + Math.floor((vbMonat - 1 + m + 1) / 12);
      labels.push(String(labelJahr));
      nomArr.push(Math.max(0, kapital));
      realArr.push(Math.max(0, kapital / inflFak));
      einzArr.push(totalEingezahlt);
    }
  }

  var kapBeiRente     = Math.max(0, kapital);
  var kapBeiRenteReal = Math.max(0, kapital / inflFak);

  // Steuer am Ende (Abgeltungssteuer mit Teilfreistellung)
  var gewinnBrutto  = Math.max(0, kapBeiRente - totalEingezahlt);
  var steuerpflicht = gewinnBrutto * (1 - teilfrei);   // 70 % des Gewinns
  var steuerlast    = steuerpflicht * steuerSatz;
  var kapNetto      = kapBeiRente - steuerlast;

  // Mögliche Monatsrente (Annuität auf Basis Nettokapital)
  var possibleRente = 0;
  if (kapNetto > 0) {
    possibleRente = rM > 0.00001
      ? kapNetto * rM / (1 - Math.pow(1 + rM, -rentenPhaseMonate))
      : kapNetto / rentenPhaseMonate;
  }

  // Rentenphase für Chart (startet ab Nettokapital)
  var kapR = kapNetto, depletionYear = null;
  for (var n = 0; n < rentenPhaseMonate; n++) {
    kapR = kapR * (1 + rM) - possibleRente - depotgebuehrM;
    if (kapR < 0) {
      kapR = 0;
      if (depletionYear === null) depletionYear = rentenJahr + Math.floor(n / 12);
    }
    inflFak *= (1 + inflationM);
    if ((n + 1) % 12 === 0 || n === rentenPhaseMonate - 1) {
      labels.push(String(rentenJahr + Math.floor((n + 1) / 12)));
      nomArr.push(kapR);
      realArr.push(Math.max(0, kapR / inflFak));
      einzArr.push(totalEingezahlt);
    }
  }

  var MONATE_KURZ  = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  var vbString     = MONATE_KURZ[vbMonat - 1] + ' ' + vbJahr;
  var rentenString = MONATE_KURZ[rentenMonat - 1] + ' ' + rentenJahr;

  return {
    kapBeiRente, kapBeiRenteReal, kapNetto,
    possibleRente,
    totalEingezahlt,
    depletionYear,
    gewinnBrutto, steuerlast, steuerpflicht,
    gewinn:         kapNetto - totalEingezahlt,
    faktor:         totalEingezahlt > 0 ? kapNetto / totalEingezahlt : 0,
    gesamtkosten,
    sparjahre:      Math.round(sparjahre * 10) / 10,
    rentenjahre:    Math.round(rentenPhaseMonate / 12 * 10) / 10,
    kapFinal:       kapR,
    labels, nomArr, realArr, einzArr,
    rentenJahr, leben, sparrate,
    vbString, rentenString,
    steuerSatz:     p.steuer || 26.375,
    teilfreiPct:    teilfrei * 100,
    ter:            p.ter || 0.2,
    depotgebuehr:   p.depotgebuehr || 0,
    payoutStrategy: 'withdrawal_plan',
  };
}
