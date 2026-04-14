// ─────────────────────────────────────────────────────────
//  Gehaltsrechner — Reine Berechnungsfunktionen
//  Zentrale Datei für alle Steuer-/SV-Konstanten und -Formeln.
//  Wird von SalaryPage.js UND PkvCalculatorPage.js importiert.
//
//  Basiert auf SKILL.md: "Gehaltsrechner & Lohnsteuer-Logik (Deutschland 2026)"
// ─────────────────────────────────────────────────────────

// ── Sozialversicherungs-Konstanten (2026 gemäß SKILL.md) ──

export const MAX_AG_ZUSCHUSS_KV = 508.59;  // § 257 SGB V
export const MAX_AG_ZUSCHUSS_PV = 104.63;
export const MAX_AG_ZUSCHUSS    = MAX_AG_ZUSCHUSS_KV + MAX_AG_ZUSCHUSS_PV; // 613,22 €

export const GKV_BBG_KV     = 5812.50;   // BBG KV/PV monatlich
export const GKV_BBG_RV     = 8450.00;   // BBG RV/AV (West) monatlich — SKILL.md 2026
export const GKV_BASIS_RATE  = 0.073;     // 14,6% / 2 = AN-Anteil
export const GKV_PV_RATE     = 0.017;     // 3,4% / 2 = AN-Anteil (SKILL.md 2026)
export const GKV_PV_ZUSCHLAG = 0.006;     // kinderlos-Zuschlag (+0,6%)
export const GKV_RV_RATE     = 0.093;     // 18,6% / 2 = AN-Anteil
export const GKV_AV_RATE     = 0.013;     // 2,6% / 2 = AN-Anteil

// ── Referenz-Daten ────────────────────────────────────────

export const STEUERKLASSEN = [
  { value: 1, label: 'I — Alleinstehend' },
  { value: 2, label: 'II — Alleinerziehend' },
  { value: 3, label: 'III — Verheiratet (höheres Eink.)' },
  { value: 4, label: 'IV — Verheiratet (gleiches Eink.)' },
  { value: 5, label: 'V — Verheiratet (niedrigeres Eink.)' },
  { value: 6, label: 'VI — Zweiter Job' },
];

export const BUNDESLAENDER = [
  { value: 9,  label: 'Bayern (KiSt 8%)' },
  { value: 8,  label: 'Baden-Württemberg (KiSt 8%)' },
  { value: 1,  label: 'Schleswig-Holstein (KiSt 9%)' },
  { value: 2,  label: 'Hamburg (KiSt 9%)' },
  { value: 3,  label: 'Niedersachsen (KiSt 9%)' },
  { value: 4,  label: 'Bremen (KiSt 9%)' },
  { value: 5,  label: 'NRW (KiSt 9%)' },
  { value: 6,  label: 'Hessen (KiSt 9%)' },
  { value: 7,  label: 'Rheinland-Pfalz (KiSt 9%)' },
  { value: 10, label: 'Saarland (KiSt 9%)' },
  { value: 11, label: 'Berlin (KiSt 9%)' },
  { value: 12, label: 'Brandenburg (KiSt 9%)' },
  { value: 13, label: 'Mecklenburg-Vorp. (KiSt 9%)' },
  { value: 14, label: 'Sachsen (KiSt 9%)' },
  { value: 15, label: 'Sachsen-Anhalt (KiSt 9%)' },
  { value: 16, label: 'Thüringen (KiSt 9%)' },
];

export const DEFAULT_GEHALT = {
  ghBrutto:       7000,
  ghStkl:         1,
  ghBundesland:   9,
  ghKist:         false,
  ghKinder:       0,
  ghKinderFB:     0,
  ghRv:           true,
  ghAv:           true,
  ghKvType:       'gkv',
  ghGkvZusatz:    2.50,   // Ø-Zusatzbeitrag 2026 lt. SKILL.md
  ghPkvBeitrag:   0,
  ghPkvBasis:     0,
  ghPkvAgZuschuss: 0,
  ghPkvPvBetrag:  0,
  ghPkvSynced:    false,
  ghView:         'monat',
};

// ── Pflegeversicherung nach Kinderzahl (SKILL.md) ─────────
// Basissatz 3,4% (AN: 1,7%). Kinderlos +0,6%. Ab 2. Kind -0,25%/Kind.

export function pvSatzByKinder(kinder) {
  var k = Math.max(0, Math.min(5, kinder));
  var zuschlag = k === 0 ? 0.006 : 0;                   // kinderlos +0,6%
  var abschlag = k >= 2 ? Math.min((k - 1) * 0.0025, 0.01) : 0; // ab 2. Kind -0,25%
  return GKV_PV_RATE + zuschlag - abschlag;
}

// ── AG-Zuschuss (§ 257 SGB V) ────────────────────────────
// 50% des PKV-Beitrags, max. GKV-Höchstbeitrag, max. 613,22€

export function calcAgZuschuss(pkvBrutto, brutto, zusatzPct) {
  var base     = Math.min(brutto, GKV_BBG_KV);
  var gkvAgMax = base * (GKV_BASIS_RATE + zusatzPct / 200 + GKV_PV_RATE + GKV_PV_ZUSCHLAG);
  return Math.min(pkvBrutto * 0.5, gkvAgMax, MAX_AG_ZUSCHUSS);
}

// ── Lohnsteuer 2026 (§ 32a EStG — Tarifzonen gemäß SKILL.md) ──

export function calcLohnsteuer2025(brutto, stkl, kinderFB, sonderausgaben) {
  sonderausgaben = sonderausgaben || 0;
  var JB   = brutto * 12;
  var ANP  = 1230;                                // Arbeitnehmer-Pauschbetrag
  var SAP  = 36;                                  // Sonderausgaben-Pauschbetrag (SKILL.md)
  // Der Grundfreibetrag ist bereits in den Tarifformeln (Zone 1: 0–12.348 → 0%)
  // eingebaut und darf NICHT separat abgezogen werden.
  // ZVE = Jahresbrutto − ANP − SAP − Vorsorgepauschale
  var ZRE4 = Math.max(0, JB - ANP - SAP - sonderausgaben);
  var ZVE  = Math.floor(ZRE4);
  if (stkl === 5 || stkl === 6) ZVE = Math.max(0, JB - SAP - sonderausgaben);
  // Splitting Stkl. III: ZVE halbieren → Formel → verdoppeln (passiert in ST-Berechnung)

  // GFB für lstDetail-Rückgabe (nur zur Anzeige im Tooltip)
  var GFB  = { 1: 12348, 2: 12348, 3: 24696, 4: 12348, 5: 0, 6: 0 };

  // Tarifzonen 2026 (SKILL.md):
  // Zone 1: 0–12.348 → 0%
  // Zone 2: 12.349–17.799 → 14%–23,97%
  // Zone 3: 17.800–69.878 → 23,97%–42%
  // Zone 4: 69.879–277.825 → 42%
  // Zone 5: ab 277.826 → 45%
  function lstFormula(zve) {
    if (zve <= 0)      return 0;
    if (zve <= 17799)  { var y = (zve - 12348) / 10000; return (979.18 * y + 1400) * y; }
    if (zve <= 69878)  { var z = (zve - 17799) / 10000; return (192.59 * z + 2397) * z + 1025.38; }
    if (zve <= 277825) return 0.42 * zve - 10602.13;
    return 0.45 * zve - 19470.38;
  }

  // Splitting (Stkl. III): ZVE halbieren → Formel → verdoppeln
  var ST;
  if (stkl === 3) {
    ST = Math.max(0, Math.floor(lstFormula(Math.floor(ZVE / 2)))) * 2;
  } else {
    ST = Math.max(0, Math.floor(lstFormula(ZVE)));
  }

  // Kinderfreibetrag: 3.414 € pro Elternteil = 6.828 € gesamt (SKILL.md)
  var KFB_GESAMT = 6828;
  var ZVE_KIST = Math.max(0, ZVE - Math.floor(kinderFB * KFB_GESAMT));
  var ST_KIST;
  if (stkl === 3) {
    ST_KIST = Math.max(0, Math.floor(lstFormula(Math.floor(ZVE_KIST / 2)))) * 2;
  } else {
    ST_KIST = Math.max(0, Math.floor(lstFormula(ZVE_KIST)));
  }

  // Solidaritätszuschlag 2026 (SKILL.md):
  //   Freigrenze: 20.350 € Jahressteuer (Stkl I, II, IV) / 40.700 € (Stkl III)
  //   Unter der Freigrenze: 0 €
  //   Über der Freigrenze: 5,5% der Einkommensteuer (ohne Milderungszone)
  var SOLI_FREIGRENZE = (stkl === 3) ? 40700 : 20350;
  var SOLI = ST_KIST > SOLI_FREIGRENZE ? Math.floor(ST_KIST * 0.055) : 0;

  return {
    lstJahr: ST, soliJahr: SOLI, stKistBase: ST_KIST,
    JB: JB, ANP: ANP, SAP: SAP,
    sonderausgaben: sonderausgaben, ZRE4: ZRE4, GFB: GFB[stkl] || 0, ZVE: ZVE,
    ZVE_KIST: ZVE_KIST, splittingActive: stkl === 3,
  };
}

// ── Gehaltsrechner Hauptfunktion ──────────────────────────

export function calcGehaltResult(gh, pkvMonthly, pkvSteuerMonthly) {
  var brutto        = gh.ghBrutto;
  var stkl          = gh.ghStkl;
  var kinder        = gh.ghKinder;
  var kinderFB      = gh.ghKinderFB;
  var kistAktiv     = gh.ghKist;
  var bl            = gh.ghBundesland;
  var ghKvType      = gh.ghKvType;
  var gkvZusatz     = gh.ghGkvZusatz;
  var pkvBrutto     = gh.ghPkvBeitrag;
  var pkvBasis      = gh.ghPkvBasis || 0;
  var pkvAgZuschuss = gh.ghPkvAgZuschuss || 0;
  var rvAktiv       = gh.ghRv;
  var avAktiv       = gh.ghAv;

  var kistSatz = (bl === 8 || bl === 9) ? 0.08 : 0.09;
  var svBase   = Math.min(brutto, GKV_BBG_KV);
  var rvBase   = Math.min(brutto, GKV_BBG_RV);
  var pvRate   = pvSatzByKinder(kinder);

  var rv = rvAktiv ? rvBase * GKV_RV_RATE : 0;
  var av = avAktiv ? rvBase * GKV_AV_RATE : 0;

  var kvAN = 0, pvAN = 0;
  var agZuschuss = 0;

  if (ghKvType === 'gkv') {
    kvAN = svBase * (GKV_BASIS_RATE + gkvZusatz / 200);
    pvAN = svBase * pvRate;
  } else {
    var effectivePkvBrutto = pkvMonthly > 0 ? pkvMonthly : (pkvBrutto || 0);
    agZuschuss = pkvAgZuschuss > 0 ? pkvAgZuschuss : calcAgZuschuss(effectivePkvBrutto, brutto, gkvZusatz);
    kvAN = Math.max(0, effectivePkvBrutto - agZuschuss);
    pvAN = 0; // PV ist im PKV-Beitrag enthalten
  }

  // ── Vorsorgepauschale §39b EStG ─────────────────────────
  //
  // Die Vorsorgepauschale besteht aus drei Teilbeträgen:
  //   1. Altersvorsorge (RV-AN): 9,3% bis BBG RV, 100% absetzbar
  //   2. KV/PV (mit Günstigerprüfung):
  //      - GKV: AN-Beiträge KV + PV direkt
  //      - PKV: Basisanteil − steuerfreier AG-Zuschuss
  //      Günstigerprüfung: max(Ist-Beiträge, Mindest-VSP)
  //      Mindest-VSP = 12% Brutto, max 1.900€ (Stkl I,II,IV) / 3.000€ (Stkl III)
  //   3. Arbeitslosenversicherung (§ 10 Abs. 1 Nr. 3a EStG): AV-AN, 100% absetzbar

  var JB_VSP   = brutto * 12;
  var base_RVj = Math.min(JB_VSP, GKV_BBG_RV * 12);

  // 1. RV-Anteil (100% absetzbar, kein Deckel)
  var VSP_RV = rvAktiv ? base_RVj * GKV_RV_RATE : 0;

  // 2. KV/PV-Anteil
  var VSP_KV_PV_ist = 0;
  if (ghKvType === 'gkv') {
    // GKV: AN-Beiträge KV + PV
    VSP_KV_PV_ist = (kvAN + pvAN) * 12;
  } else {
    // PKV: (Basisanteil - AG-Zuschuss) — nur steuerlich absetzbar
    var effectiveBasis = pkvBasis > 0 ? pkvBasis : (pkvMonthly > 0 ? pkvMonthly : (pkvBrutto || 0));
    var agZVsp = pkvAgZuschuss > 0 ? pkvAgZuschuss : calcAgZuschuss(effectiveBasis, brutto, gkvZusatz);
    VSP_KV_PV_ist = Math.max(0, effectiveBasis - agZVsp) * 12;
  }

  // Günstigerprüfung: max(Ist, Mindest-VSP)
  var kapStkl    = (stkl === 3) ? 3000 : 1900;
  var mindestVSP = Math.min(JB_VSP * 0.12, kapStkl);
  var VSP_KV_PV  = Math.max(VSP_KV_PV_ist, mindestVSP);

  // 3. AV-Anteil (absetzbar als sonstige Vorsorgeaufwendung § 10 Abs. 1 Nr. 3a EStG)
  var VSP_AV = avAktiv ? base_RVj * GKV_AV_RATE : 0;

  var sonderausgabenJahr = Math.ceil(VSP_RV + VSP_KV_PV + VSP_AV);
  var lstDetail = calcLohnsteuer2025(brutto, stkl, kinderFB, sonderausgabenJahr);
  var lstMo  = lstDetail.lstJahr  / 12;
  var soliMo = lstDetail.soliJahr / 12;
  var kistMo = kistAktiv ? (lstDetail.stKistBase / 12) * kistSatz : 0;

  var gesamtAbzug = lstMo + soliMo + kistMo + kvAN + pvAN + rv + av;
  var netto = brutto - gesamtAbzug;

  return {
    brutto: brutto, lstMo: lstMo, soliMo: soliMo, kistMo: kistMo,
    kvAN: kvAN, pvAN: pvAN, rv: rv, av: av,
    gesamtAbzug: gesamtAbzug, netto: netto,
    lstJahr: lstDetail.lstJahr, soliJahr: lstDetail.soliJahr, pvRate: pvRate,
    agZuschuss: agZuschuss, sonderausgabenJahr: sonderausgabenJahr, lstDetail: lstDetail,
    kistSatz: kistSatz, kistAktiv: kistAktiv, ghKvType: ghKvType, gkvZusatz: gkvZusatz,
    pkvBasis: pkvBasis, pkvAgZuschuss: agZuschuss,
    // Vorsorgepauschale §39b Detail
    vspRV:        Math.round(VSP_RV * 100) / 100,
    vspKVPVist:   Math.round(VSP_KV_PV_ist * 100) / 100,
    vspMindest:   Math.round(mindestVSP * 100) / 100,
    vspKVPV:      Math.round(VSP_KV_PV * 100) / 100,
    vspAV:        Math.round(VSP_AV * 100) / 100,
    vspDeckel:    kapStkl,
    vspGuenstiger: VSP_KV_PV_ist < mindestVSP ? 'mindest' : 'ist',
  };
}

// ── PKV vs GKV Netto-Vergleich ────────────────────────────

export function calcNettoComparison(gh, pkvMonthlyFromModule) {
  var brutto   = gh.ghBrutto;
  var zusatz   = gh.ghGkvZusatz;
  var kinder   = gh.ghKinder;
  var stkl     = gh.ghStkl;
  var kinderFB = gh.ghKinderFB;
  var avAktiv  = gh.ghAv;
  var rvAktiv  = gh.ghRv !== false;
  var pvRate   = pvSatzByKinder(kinder);
  var svBase   = Math.min(brutto, GKV_BBG_KV);
  var rvBase   = Math.min(brutto, GKV_BBG_RV);
  var kvGkv    = svBase * (GKV_BASIS_RATE + zusatz / 200);
  var pvGkv    = svBase * pvRate;

  // GKV Vorsorgepauschale
  var JB        = brutto * 12;
  var base_RVj  = Math.min(JB, GKV_BBG_RV * 12);
  var vsp_RV    = rvAktiv ? base_RVj * GKV_RV_RATE : 0;
  var vsp_AV    = avAktiv ? base_RVj * GKV_AV_RATE : 0;
  var vspKV_ist = (kvGkv + pvGkv) * 12;
  var kapStkl   = (stkl === 3) ? 3000 : 1900;
  var mindest   = Math.min(JB * 0.12, kapStkl);
  var vspKV     = Math.max(vspKV_ist, mindest);
  var vspGkv    = Math.ceil(vsp_RV + vspKV + vsp_AV);

  var lstG     = calcLohnsteuer2025(brutto, stkl, kinderFB, vspGkv);
  var rvG      = rvAktiv ? rvBase * GKV_RV_RATE : 0;
  var avG      = avAktiv ? rvBase * GKV_AV_RATE : 0;
  var nettoGkv = brutto - lstG.lstJahr / 12 - lstG.soliJahr / 12 - kvGkv - pvGkv - rvG - avG;

  // PKV Vorsorgepauschale
  var pkvMonthly = pkvMonthlyFromModule || (gh.ghPkvBeitrag || 0);
  var pkvBasis   = gh.ghPkvBasis || pkvMonthly;
  var agZ        = calcAgZuschuss(pkvMonthly, brutto, zusatz);
  var kvPkv      = pkvMonthly - agZ;
  var vspPkv_ist = Math.max(0, pkvBasis - agZ) * 12;
  var vspPkv_kv  = Math.max(vspPkv_ist, mindest);
  var vspPkv     = Math.ceil(vsp_RV + vspPkv_kv + vsp_AV);

  var lstP     = calcLohnsteuer2025(brutto, stkl, kinderFB, vspPkv);
  var nettoPkv = brutto - lstP.lstJahr / 12 - lstP.soliJahr / 12 - kvPkv - rvG - avG;

  return {
    nettoGkv: nettoGkv, nettoPkv: nettoPkv, nettoDiff: nettoPkv - nettoGkv,
    kvGkv: kvGkv, pvGkv: pvGkv, kvPkv: kvPkv, agZ: agZ, pkvMonthly: pkvMonthly,
  };
}

// ── Formatter ─────────────────────────────────────────────

export function fmtEuro(v, d) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  d = d == null ? 0 : d;
  return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
}
