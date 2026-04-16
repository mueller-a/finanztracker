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
export const GKV_PV_RATE     = 0.018;     // 3,6% / 2 = AN-Anteil (BMF-PAP 2026, PVSATZAN)
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

// ── Lohnsteuer 2026 (§ 32a EStG — Tarifzonen lt. amtlichem BMF-PAP 2026) ──
//
// Quelle: BMF-PAP "Lohnsteuer 2026" — METHOD UPTAB26
// (https://www.bmf-steuerrechner.de/javax.faces.resource/daten/xmls/Lohnsteuer2026.xml.xhtml)

export function calcLohnsteuer2025(brutto, stkl, kinderFB, sonderausgaben) {
  sonderausgaben = sonderausgaben || 0;
  var JB   = brutto * 12;
  // Tabellenfreibeträge (BMF MZTABFB): ANP=1230 + SAP=36 für Stkl 1–5; Stkl 6 = 0
  var ANP  = stkl === 6 ? 0 : 1230;
  var SAP  = stkl === 6 ? 0 : 36;
  var ZTABFB = ANP + SAP;
  // ZVE = Jahresbrutto − Tabellenfreibeträge − Vorsorgepauschale
  var ZRE4 = Math.max(0, JB - ZTABFB - sonderausgaben);
  var ZVE  = Math.floor(ZRE4);
  // Splitting Stkl. III: ZVE halbieren → Formel → verdoppeln (passiert in ST-Berechnung)

  // GFB für lstDetail-Rückgabe (nur zur Anzeige im Tooltip)
  var GFB  = { 1: 12348, 2: 12348, 3: 24696, 4: 12348, 5: 0, 6: 0 };

  // Tarifzonen 2026 (BMF-PAP UPTAB26):
  // Zone 1: 0–12.348 → 0%
  // Zone 2: 12.349–17.799 → (914,51·y + 1400)·y
  // Zone 3: 17.800–69.878 → (173,10·z + 2397)·z + 1034,87
  // Zone 4: 69.879–277.825 → 0,42·X − 11.135,63
  // Zone 5: ab 277.826 → 0,45·X − 19.470,38
  function lstFormula(zve) {
    if (zve <= 12348)  return 0;
    if (zve <= 17799)  { var y = (zve - 12348) / 10000; return (914.51 * y + 1400) * y; }
    if (zve <= 69878)  { var z = (zve - 17799) / 10000; return (173.10 * z + 2397) * z + 1034.87; }
    if (zve <= 277825) return 0.42 * zve - 11135.63;
    return 0.45 * zve - 19470.38;
  }

  // Splitting (Stkl. III): ZVE halbieren → Formel → verdoppeln
  var ST;
  if (stkl === 3) {
    ST = Math.max(0, Math.floor(lstFormula(Math.floor(ZVE / 2)))) * 2;
  } else {
    ST = Math.max(0, Math.floor(lstFormula(ZVE)));
  }

  // Kinderfreibetrag VOLL inkl. BEA-Freibetrag = 9.756 € pro Kind (BMF-PAP MZTABFB
  // Stkl 1/2/3: KFB = ZKF × 9756; Stkl 4: ZKF × 4878 = halber Anteil pro Elternteil)
  var KFB_PRO_KIND = stkl === 4 ? 4878 : 9756;
  var ZVE_KIST = Math.max(0, ZVE - Math.floor(kinderFB * KFB_PRO_KIND));
  var ST_KIST;
  if (stkl === 3) {
    ST_KIST = Math.max(0, Math.floor(lstFormula(Math.floor(ZVE_KIST / 2)))) * 2;
  } else {
    ST_KIST = Math.max(0, Math.floor(lstFormula(ZVE_KIST)));
  }

  // Solidaritätszuschlag 2026 (BMF SOLZFREI = 20.350; Stkl III × 2 = 40.700):
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

  // ── Vorsorgepauschale § 39b Abs. 2 Satz 5 EStG ──────────
  //
  // Algorithmus 1:1 nach amtlichem BMF-PAP "Lohnsteuer 2026"
  // (Methoden UPEVP, MVSPKVPV, MVSPHB):
  //
  //   VSPR    = min(JB, BBG_RV)  · 9,3 %                          (rounded DOWN, 2 Dez.)
  //   VSPKVPV = (GKV) min(JB, BBG_KV) · (KV_ermäßigt + PV_satz)   (rounded DOWN, 2 Dez.)
  //           = (PKV) (PKPV − PKPV_AG) · 12                       (rounded DOWN, 2 Dez.)
  //   VSP     = ROUND_UP(VSPR + VSPKVPV)
  //
  //   Wenn ALV ≠ 1 und Stkl ≠ 6:
  //     VSPALV = min(JB, BBG_RV) · 1,3 %                          (rounded DOWN, 2 Dez.)
  //     VSPHB  = min(VSPALV + VSPKVPV, 1.900)                     (Höchstbetrag § 10 Abs. 4 EStG)
  //     VSPN   = ROUND_UP(VSPR + VSPHB)
  //     VSP    = max(VSP, VSPN)

  var JB_VSP   = brutto * 12;
  var base_RVj = Math.min(JB_VSP, GKV_BBG_RV * 12);
  var base_KVj = Math.min(JB_VSP, GKV_BBG_KV * 12);

  // VSPR — Altersvorsorge-Teilbetrag
  var VSP_RV = rvAktiv ? Math.floor(base_RVj * GKV_RV_RATE * 100) / 100 : 0;

  // VSPKVPV — KV/PV-Teilbetrag
  var VSP_KVPV = 0;
  if (ghKvType === 'gkv') {
    // BMF-PAP nutzt für die VSP den ERMÄSSIGTEN KV-Satz (§ 243 SGB V = 7,0 %)
    // + halben Zusatzbeitrag + PV-Satz nach Familienstand
    var kvSatzVsp = 0.07 + (gkvZusatz / 200);
    VSP_KVPV = Math.floor(base_KVj * (kvSatzVsp + pvRate) * 100) / 100;
  } else {
    var effectiveBasis = pkvBasis > 0 ? pkvBasis : (pkvMonthly > 0 ? pkvMonthly : (pkvBrutto || 0));
    var agZVsp = pkvAgZuschuss > 0 ? pkvAgZuschuss : calcAgZuschuss(effectiveBasis, brutto, gkvZusatz);
    VSP_KVPV = Math.max(0, Math.floor((effectiveBasis - agZVsp) * 12 * 100) / 100);
  }

  var VSP_simple = Math.ceil(VSP_RV + VSP_KVPV);

  // MVSPHB — Höchstbetragsberechnung für Sonstige (AV)
  // Wird übersprungen für Stkl 6 (kein 2. Job-Freibetrag) oder wenn AV-frei
  var VSP_AV  = avAktiv ? Math.floor(base_RVj * GKV_AV_RATE * 100) / 100 : 0;
  var VSPHB   = Math.min(VSP_AV + VSP_KVPV, 1900);                // Cap § 10 Abs. 4 EStG
  var VSPN    = Math.ceil(VSP_RV + VSPHB);
  var sonderausgabenJahr = (avAktiv && stkl !== 6)
    ? Math.max(VSP_simple, VSPN)
    : VSP_simple;
  // Für Detail-Anzeige: effektiv berücksichtigte AV-Pauschale (kann durch 1.900 €-Cap < Ist sein)
  var VSP_AV_effektiv = Math.max(0, sonderausgabenJahr - VSP_simple);
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
    // Vorsorgepauschale §39b Detail (BMF-PAP)
    vspRV:        Math.round(VSP_RV * 100) / 100,
    vspKVPVist:   Math.round(VSP_KVPV * 100) / 100,
    vspKVPV:      Math.round(VSP_KVPV * 100) / 100,
    vspAV:        Math.round(VSP_AV * 100) / 100,
    vspAVeffektiv: Math.round(VSP_AV_effektiv * 100) / 100,
    vspHB:        Math.round(VSPHB * 100) / 100,
    vspSimple:    VSP_simple,
    vspN:         VSPN,
    vspMindest:   Math.round(VSPN * 100) / 100,    // alias für UI-Backward-Compat
    vspDeckel:    1900,
    vspGuenstiger: VSPN > VSP_simple ? 'mindest' : 'ist',
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

  // Vorsorgepauschale nach BMF-PAP MVSPHB-Algorithmus
  var JB        = brutto * 12;
  var base_RVj  = Math.min(JB, GKV_BBG_RV * 12);
  var base_KVj  = Math.min(JB, GKV_BBG_KV * 12);
  var vsp_RV    = rvAktiv ? Math.floor(base_RVj * GKV_RV_RATE * 100) / 100 : 0;
  var vsp_AV    = avAktiv ? Math.floor(base_RVj * GKV_AV_RATE * 100) / 100 : 0;
  // GKV: ermäßigter KV-Satz § 243 SGB V (7,0 %) + halber Zusatz + PV-Satz
  var vspKV_GKV = Math.floor(base_KVj * (0.07 + zusatz / 200 + pvRate) * 100) / 100;

  function vspFinal(vspKV) {
    var simple = Math.ceil(vsp_RV + vspKV);
    if (!avAktiv || stkl === 6) return simple;
    var hb = Math.min(vsp_AV + vspKV, 1900);
    return Math.max(simple, Math.ceil(vsp_RV + hb));
  }

  var vspGkv   = vspFinal(vspKV_GKV);
  var lstG     = calcLohnsteuer2025(brutto, stkl, kinderFB, vspGkv);
  var rvG      = rvAktiv ? rvBase * GKV_RV_RATE : 0;
  var avG      = avAktiv ? rvBase * GKV_AV_RATE : 0;
  var nettoGkv = brutto - lstG.lstJahr / 12 - lstG.soliJahr / 12 - kvGkv - pvGkv - rvG - avG;

  // PKV Vorsorgepauschale (Basisanteil − AG-Zuschuss)
  var pkvMonthly = pkvMonthlyFromModule || (gh.ghPkvBeitrag || 0);
  var pkvBasis   = gh.ghPkvBasis || pkvMonthly;
  var agZ        = calcAgZuschuss(pkvMonthly, brutto, zusatz);
  var kvPkv      = pkvMonthly - agZ;
  var vspKV_PKV  = Math.max(0, Math.floor((pkvBasis - agZ) * 12 * 100) / 100);
  var vspPkv     = vspFinal(vspKV_PKV);

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
