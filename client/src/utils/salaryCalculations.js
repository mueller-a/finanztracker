// ─────────────────────────────────────────────────────────
//  Gehaltsrechner — Reine Berechnungsfunktionen
//
//  Sämtliche Steuer- und SV-Parameter kommen aus `taxConfigs.js`
//  (time-indexed pro validFrom). Alle Funktionen akzeptieren eine
//  optionale `cfg`-Config; ohne Parameter wird `LATEST_TAX_CONFIG`
//  verwendet (Backward-Compat für bestehende Aufrufer).
// ─────────────────────────────────────────────────────────

import { getTaxConfig, LATEST_TAX_CONFIG } from './taxConfigs.js';

export { getTaxConfig, LATEST_TAX_CONFIG, TAX_CONFIGS, AVAILABLE_YEARS, MONATE } from './taxConfigs.js';

// ── Backward-Compat-Exports (lesen aus aktueller Config) ──
//   PkvCalculatorPage.js und andere Konsumenten importieren diese
//   Konstanten direkt und erwarten Skalare.

export const GKV_BBG_KV      = LATEST_TAX_CONFIG.bbgKvPvJahr / 12;
export const GKV_BBG_RV      = LATEST_TAX_CONFIG.bbgRvAlvJahr / 12;
export const GKV_BASIS_RATE  = LATEST_TAX_CONFIG.kvANRateAllgemein;
export const GKV_PV_RATE     = LATEST_TAX_CONFIG.pvANRate;
export const GKV_PV_ZUSCHLAG = LATEST_TAX_CONFIG.pvKinderlosZuschlag;
export const GKV_RV_RATE     = LATEST_TAX_CONFIG.rvANRate;
export const GKV_AV_RATE     = LATEST_TAX_CONFIG.avANRate;

export const MAX_AG_ZUSCHUSS_KV = Math.round(GKV_BBG_KV * (GKV_BASIS_RATE + LATEST_TAX_CONFIG.kvZusatzDurchschnitt / 200) * 100) / 100;
export const MAX_AG_ZUSCHUSS_PV = Math.round(GKV_BBG_KV * GKV_PV_RATE * 100) / 100;
export const MAX_AG_ZUSCHUSS    = MAX_AG_ZUSCHUSS_KV + MAX_AG_ZUSCHUSS_PV;

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
  ghFreibetragMo: 0,       // monatl. Steuer-Freibetrag (§ 39a EStG), ELStAM
  ghKvType:       'gkv',
  ghGkvZusatz:    2.50,
  ghPkvBeitrag:   0,
  ghPkvBasis:     0,
  ghPkvAgZuschuss: 0,
  ghPkvPvBetrag:  0,
  ghPkvSynced:    false,
  ghView:         'monat',
  // Berechnungszeitraum — default aktuelles Kalenderdatum.
  // Bei erster User-Änderung wird der Wert via saveSettings persistiert.
  ghYear:         new Date().getFullYear(),
  ghMonth:        new Date().getMonth() + 1,
};

// ── Kinderfreibetrag-Zähler (§ 32 Abs. 6 EStG) ───────────
// Bestimmt wie viele ganze KFB der AN auf der Lohnsteuerkarte hat.
// Für KiSt- und Soli-Bemessung wird der ZKF-Zähler × Voll-KFB abgezogen.
//
// Der volle KFB pro Kind wird standardmäßig hälftig auf die Eltern
// aufgeteilt. Ein Elternteil kann via Übertragung den ganzen KFB
// bekommen (z.B. Stkl 3 Einverdiener), aber das ist die Ausnahme.
//
// Default-Aufteilung:
// - Stkl 1 / 2 / 4: 0,5 pro Kind (ELStAM-Standard)
// - Stkl 3: 1,0 pro Kind (einziger Verdiener, Partner gibt Hälfte ab)
// - Stkl 5 / 6: 0 (Partner hat vollen KFB in Stkl 3, bzw. 2. Job)
//
// User kann über ghKinderFB manuell überschreiben, wenn sie den vollen
// KFB auf sich übertragen haben.

export function getKinderFB(kinder, stkl) {
  var k = Math.max(0, Number(kinder) || 0);
  if (k === 0)                  return 0;
  if (stkl === 3)               return k;
  if (stkl === 5 || stkl === 6) return 0;
  return k * 0.5;
}

// ── Pflegeversicherung nach Kinderzahl ────────────────────
// Basissatz aus Config (2025/2026: 1,8% AN). Kinderlos +0,6%. Ab 2. Kind -0,25%/Kind.

export function pvSatzByKinder(kinder, cfg) {
  cfg = cfg || LATEST_TAX_CONFIG;
  var k = Math.max(0, Math.min(5, kinder));
  var zuschlag = k === 0 ? cfg.pvKinderlosZuschlag : 0;
  var abschlag = k >= 2 ? Math.min((k - 1) * 0.0025, 0.01) : 0;
  return cfg.pvANRate + zuschlag - abschlag;
}

// ── AG-Zuschuss (§ 257 SGB V) ────────────────────────────
// 50% des PKV-Beitrags, max. GKV-Höchstbeitrag (KV-allg. + KVZ/2 + PV, ohne Kinderloser-Zuschlag)

export function calcAgZuschuss(pkvBrutto, brutto, zusatzPct, cfg) {
  cfg = cfg || LATEST_TAX_CONFIG;
  var bbgKvMo      = cfg.bbgKvPvJahr / 12;
  var base         = Math.min(brutto, bbgKvMo);
  var gkvAgMax     = base * (cfg.kvANRateAllgemein + zusatzPct / 200 + cfg.pvANRate + cfg.pvKinderlosZuschlag);
  // Absolute Obergrenze § 257 SGB V: BBG_KV × (KV-allg. + Ø-KVZ/2 + PV)
  var absoluteCap  = bbgKvMo * (cfg.kvANRateAllgemein + cfg.kvZusatzDurchschnitt / 200 + cfg.pvANRate);
  return Math.min(pkvBrutto * 0.5, gkvAgMax, absoluteCap);
}

// ── Lohnsteuer (§ 32a EStG — Tarifzonen lt. amtlichem BMF-PAP) ──
//
// Sämtliche Tarif-Konstanten aus `cfg` (taxConfigs.js).
// Quellen: BMF-PAP UPTAB25 / UPTAB26
//   https://www.bmf-steuerrechner.de/javax.faces.resource/daten/xmls/Lohnsteuer{Jahr}.xml.xhtml

export function calcLohnsteuer2025(brutto, stkl, kinderFB, sonderausgaben, jahresfreibetrag, cfg) {
  cfg = cfg || LATEST_TAX_CONFIG;
  sonderausgaben = sonderausgaben || 0;
  jahresfreibetrag = jahresfreibetrag || 0;
  var JB   = brutto * 12;
  var ANP  = stkl === 6 ? 0 : cfg.anp;
  var SAP  = stkl === 6 ? 0 : cfg.sap;
  var ZTABFB = ANP + SAP;
  var ZRE4 = Math.max(0, JB - ZTABFB - sonderausgaben - jahresfreibetrag);
  var ZVE  = Math.floor(ZRE4);

  var GFB  = { 1: cfg.gfb, 2: cfg.gfb, 3: cfg.gfb * 2, 4: cfg.gfb, 5: 0, 6: 0 };

  function lstFormula(zve) {
    if (zve <= cfg.gfb)         return 0;
    if (zve <= cfg.zone2End)    { var y = (zve - cfg.gfb)      / 10000; return (cfg.tarifZ2a * y + cfg.tarifZ2b) * y; }
    if (zve <= cfg.zone3End)    { var z = (zve - cfg.zone2End) / 10000; return (cfg.tarifZ3a * z + cfg.tarifZ3b) * z + cfg.tarifZ3c; }
    if (zve <= cfg.zone4End)    return cfg.tarifZ4Satz * zve - cfg.tarifZ4Abzug;
    return cfg.tarifZ5Satz * zve - cfg.tarifZ5Abzug;
  }

  var ST;
  if (stkl === 3) {
    ST = Math.max(0, Math.floor(lstFormula(Math.floor(ZVE / 2)))) * 2;
  } else {
    ST = Math.max(0, Math.floor(lstFormula(ZVE)));
  }

  // Kinderfreibetrag voll (sächl. + BEA) aus Config; Stkl 4 = halber Anteil
  var KFB_PRO_KIND = stkl === 4 ? cfg.kfbProKindStkl4 : cfg.kfbProKindSonst;
  var ZVE_KIST = Math.max(0, ZVE - Math.floor(kinderFB * KFB_PRO_KIND));
  var ST_KIST;
  if (stkl === 3) {
    ST_KIST = Math.max(0, Math.floor(lstFormula(Math.floor(ZVE_KIST / 2)))) * 2;
  } else {
    ST_KIST = Math.max(0, Math.floor(lstFormula(ZVE_KIST)));
  }

  // Solidaritätszuschlag mit Milderungszone (§ 4 SolzG, BMF MSOLZ):
  //   SOLZ_voll = LSt × cfg.soliSatz
  //   SOLZ_min  = (LSt − Freigrenze) × 11,9 %   (linearer Übergangstarif)
  //   Soli      = min(SOLZ_voll, SOLZ_min)
  var SOLI_FREIGRENZE = (stkl === 3) ? cfg.soliFreigrenze * 2 : cfg.soliFreigrenze;
  var SOLI = 0;
  if (ST_KIST > SOLI_FREIGRENZE) {
    var soliVoll = Math.floor(ST_KIST * cfg.soliSatz * 100) / 100;
    var soliMin  = Math.floor((ST_KIST - SOLI_FREIGRENZE) * 0.119 * 100) / 100;
    SOLI = Math.min(soliVoll, soliMin);
  }

  return {
    lstJahr: ST, soliJahr: SOLI, stKistBase: ST_KIST,
    JB: JB, ANP: ANP, SAP: SAP,
    sonderausgaben: sonderausgaben, ZRE4: ZRE4, GFB: GFB[stkl] || 0, ZVE: ZVE,
    ZVE_KIST: ZVE_KIST, splittingActive: stkl === 3,
    cfgYear: cfg.year, cfgLabel: cfg.label,
  };
}

// ── Gehaltsrechner Hauptfunktion ──────────────────────────

export function calcGehaltResult(gh, pkvMonthly, pkvSteuerMonthly) {
  var brutto        = gh.ghBrutto;
  var stkl          = gh.ghStkl;
  var kinder        = gh.ghKinder;
  // KFB-Zähler: User-Override nutzen wenn gesetzt, sonst automatisch aus
  // Kinderzahl + Steuerklasse ableiten (verhindert, dass KiSt/Soli auf
  // der vollen LSt berechnet werden, wenn User nur ghKinder setzt)
  var kinderFB      = (gh.ghKinderFB != null && gh.ghKinderFB > 0)
                        ? gh.ghKinderFB
                        : getKinderFB(kinder, stkl);
  var kistAktiv     = gh.ghKist;
  var bl            = gh.ghBundesland;
  var ghKvType      = gh.ghKvType;
  var gkvZusatz     = gh.ghGkvZusatz;
  var pkvBrutto     = gh.ghPkvBeitrag;
  var pkvBasis      = gh.ghPkvBasis || 0;
  var pkvAgZuschuss = gh.ghPkvAgZuschuss || 0;
  var rvAktiv       = gh.ghRv;
  var avAktiv       = gh.ghAv;

  // Steuer-/SV-Konfig für gewählten Berechnungszeitraum (Default: aktuell)
  var cfg = getTaxConfig(gh.ghYear || new Date().getFullYear(), gh.ghMonth || (new Date().getMonth() + 1));
  var bbgKvMo = cfg.bbgKvPvJahr / 12;
  var bbgRvMo = cfg.bbgRvAlvJahr / 12;

  var kistSatz = (bl === 8 || bl === 9) ? 0.08 : 0.09;
  var svBase   = Math.min(brutto, bbgKvMo);
  var rvBase   = Math.min(brutto, bbgRvMo);
  var pvRate   = pvSatzByKinder(kinder, cfg);

  var rv = rvAktiv ? rvBase * cfg.rvANRate : 0;
  var av = avAktiv ? rvBase * cfg.avANRate : 0;

  var kvAN = 0, pvAN = 0;
  var agZuschuss = 0;

  if (ghKvType === 'gkv') {
    kvAN = svBase * (cfg.kvANRateAllgemein + gkvZusatz / 200);
    pvAN = svBase * pvRate;
  } else {
    var effectivePkvBrutto = pkvMonthly > 0 ? pkvMonthly : (pkvBrutto || 0);
    agZuschuss = pkvAgZuschuss > 0 ? pkvAgZuschuss : calcAgZuschuss(effectivePkvBrutto, brutto, gkvZusatz, cfg);
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
  var base_RVj = Math.min(JB_VSP, cfg.bbgRvAlvJahr);
  var base_KVj = Math.min(JB_VSP, cfg.bbgKvPvJahr);

  // VSPR — Altersvorsorge-Teilbetrag
  var VSP_RV = rvAktiv ? Math.floor(base_RVj * cfg.rvANRate * 100) / 100 : 0;

  // VSPKVPV — KV/PV-Teilbetrag
  var VSP_KVPV = 0;
  if (ghKvType === 'gkv') {
    // BMF-PAP nutzt für die VSP den ERMÄSSIGTEN KV-Satz (§ 243 SGB V)
    // + halben Zusatzbeitrag + PV-Satz nach Familienstand
    var kvSatzVsp = cfg.kvANRateErmaessigt + (gkvZusatz / 200);
    VSP_KVPV = Math.floor(base_KVj * (kvSatzVsp + pvRate) * 100) / 100;
  } else {
    var effectiveBasis = pkvBasis > 0 ? pkvBasis : (pkvMonthly > 0 ? pkvMonthly : (pkvBrutto || 0));
    var agZVsp = pkvAgZuschuss > 0 ? pkvAgZuschuss : calcAgZuschuss(effectiveBasis, brutto, gkvZusatz, cfg);
    VSP_KVPV = Math.max(0, Math.floor((effectiveBasis - agZVsp) * 12 * 100) / 100);
  }

  var VSP_simple = Math.ceil(VSP_RV + VSP_KVPV);

  // MVSPHB — Höchstbetragsberechnung für Sonstige (AV)
  var VSP_AV  = avAktiv ? Math.floor(base_RVj * cfg.avANRate * 100) / 100 : 0;
  var VSPHB   = Math.min(VSP_AV + VSP_KVPV, 1900);                // Cap § 10 Abs. 4 EStG
  var VSPN    = Math.ceil(VSP_RV + VSPHB);
  var sonderausgabenJahr = (avAktiv && stkl !== 6)
    ? Math.max(VSP_simple, VSPN)
    : VSP_simple;
  var VSP_AV_effektiv = Math.max(0, sonderausgabenJahr - VSP_simple);
  var jahresfreibetrag = (gh.ghFreibetragMo || 0) * 12;
  var lstDetail = calcLohnsteuer2025(brutto, stkl, kinderFB, sonderausgabenJahr, jahresfreibetrag, cfg);
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
  var kinderFB = (gh.ghKinderFB != null && gh.ghKinderFB > 0)
                    ? gh.ghKinderFB
                    : getKinderFB(kinder, stkl);
  var avAktiv  = gh.ghAv;
  var rvAktiv  = gh.ghRv !== false;
  var cfg      = getTaxConfig(gh.ghYear || new Date().getFullYear(), gh.ghMonth || (new Date().getMonth() + 1));
  var bbgKvMo  = cfg.bbgKvPvJahr / 12;
  var bbgRvMo  = cfg.bbgRvAlvJahr / 12;
  var pvRate   = pvSatzByKinder(kinder, cfg);
  var svBase   = Math.min(brutto, bbgKvMo);
  var rvBase   = Math.min(brutto, bbgRvMo);
  var kvGkv    = svBase * (cfg.kvANRateAllgemein + zusatz / 200);
  var pvGkv    = svBase * pvRate;

  // Vorsorgepauschale nach BMF-PAP MVSPHB-Algorithmus
  var JB        = brutto * 12;
  var base_RVj  = Math.min(JB, cfg.bbgRvAlvJahr);
  var base_KVj  = Math.min(JB, cfg.bbgKvPvJahr);
  var vsp_RV    = rvAktiv ? Math.floor(base_RVj * cfg.rvANRate * 100) / 100 : 0;
  var vsp_AV    = avAktiv ? Math.floor(base_RVj * cfg.avANRate * 100) / 100 : 0;
  var vspKV_GKV = Math.floor(base_KVj * (cfg.kvANRateErmaessigt + zusatz / 200 + pvRate) * 100) / 100;

  function vspFinal(vspKV) {
    var simple = Math.ceil(vsp_RV + vspKV);
    if (!avAktiv || stkl === 6) return simple;
    var hb = Math.min(vsp_AV + vspKV, 1900);
    return Math.max(simple, Math.ceil(vsp_RV + hb));
  }

  var vspGkv   = vspFinal(vspKV_GKV);
  var lstG     = calcLohnsteuer2025(brutto, stkl, kinderFB, vspGkv, 0, cfg);
  var rvG      = rvAktiv ? rvBase * cfg.rvANRate : 0;
  var avG      = avAktiv ? rvBase * cfg.avANRate : 0;
  var nettoGkv = brutto - lstG.lstJahr / 12 - lstG.soliJahr / 12 - kvGkv - pvGkv - rvG - avG;

  // PKV Vorsorgepauschale (Basisanteil − AG-Zuschuss)
  var pkvMonthly = pkvMonthlyFromModule || (gh.ghPkvBeitrag || 0);
  var pkvBasis   = gh.ghPkvBasis || pkvMonthly;
  var agZ        = calcAgZuschuss(pkvMonthly, brutto, zusatz, cfg);
  var kvPkv      = pkvMonthly - agZ;
  var vspKV_PKV  = Math.max(0, Math.floor((pkvBasis - agZ) * 12 * 100) / 100);
  var vspPkv     = vspFinal(vspKV_PKV);

  var lstP     = calcLohnsteuer2025(brutto, stkl, kinderFB, vspPkv, 0, cfg);
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
