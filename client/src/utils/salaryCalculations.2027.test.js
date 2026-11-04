// Prüft den Parametersatz „2027 – Entwurf“ gegen die Werte Stand 04.11.2026
// und sichert, dass 2026 unverändert bleibt.
import { TAX_CONFIGS, getTaxConfig, AVAILABLE_YEARS } from './taxConfigs';
import { tarifEst, calcGehaltResult, calcAgZuschuss, pvSatzByKinder, DEFAULT_GEHALT } from './salaryCalculations';

const cfg26 = getTaxConfig(2026, 1);
const cfg27 = getTaxConfig(2027, 1);
const est = (zve, cfg) => Math.floor(tarifEst(zve, cfg));

describe('Einkommensteuer Grundtabelle', () => {
  test.each([
    // zvE,    ESt 2026, ESt 2027
    [12564,        30,      0],
    [15000,       435,    397],
    [17800,      1035,    994],
    [30000,      4217,   4172],
    [50000,     10548,  10482],
    [65000,     16205,  16111],
    [70600,     18516,  18410],
    [100000,    30864,  30758],
    [250000,    93864,  93758],
    [300000,   115529, 116658],
  ])('zvE %i → 2026: %i €, 2027: %i €', (zve, soll26, soll27) => {
    expect(est(zve, cfg26)).toBe(soll26);
    expect(est(zve, cfg27)).toBe(soll27);
  });
});

describe('Tarif 2027: Zonengrenzen', () => {
  test('Grundfreibetrag endet bei 12.564 €', () => {
    expect(tarifEst(12564, cfg27)).toBe(0);
    expect(tarifEst(12565, cfg27)).toBeGreaterThan(0);
  });

  test('Formelwahl an den Zonenrändern', () => {
    expect(tarifEst(70601, cfg27)).toBeCloseTo(0.42 * 70601 - 11241.73, 2);
    expect(tarifEst(249999, cfg27)).toBeCloseTo(0.42 * 249999 - 11241.73, 2);
    expect(tarifEst(250000, cfg27)).toBeCloseTo(0.45 * 250000 - 18741.70, 2);
    expect(tarifEst(279999, cfg27)).toBeCloseTo(0.45 * 279999 - 18741.70, 2);
    expect(tarifEst(280000, cfg27)).toBeCloseTo(0.47 * 280000 - 24341.68, 2);
  });

  test.each([17799, 70600, 249999, 279999])('kein Sprung über %i €', (grenze) => {
    const sprung = tarifEst(grenze + 1, cfg27) - tarifEst(grenze, cfg27);
    expect(sprung).toBeGreaterThanOrEqual(0);
    expect(sprung).toBeLessThan(0.5);
  });
});

describe('Parametersatz 2027', () => {
  test('ist auswählbar und als Entwurf markiert', () => {
    expect(AVAILABLE_YEARS).toContain(2027);
    expect(cfg27.label).toBe('2027 – Entwurf');
    expect(cfg27.entwurf.stand).toBe('04.11.2026');
    expect(cfg27.entwurf.offeneParameter).toContain('soliFreigrenze');
  });

  test('Rechengrößen entsprechen den Sollwerten', () => {
    expect(cfg27).toMatchObject({
      anp: 1430, kfbProKindSonst: 10056, kfbProKindStkl4: 5028,
      bbgKvPvJahr: 76500, bbgRvAlvJahr: 106200,
      rvANRate: 0.093, avANRate: 0.013, pvANRate: 0.018, pvKinderlosZuschlag: 0.009,
      kvANRateAllgemein: 0.073, kvANRateErmaessigt: 0.07, kvZusatzDurchschnitt: 2.9,
    });
    expect(cfg27.rechengroessen).toMatchObject({
      bbgKnappschaftJahr: 130800, jaegJahr: 84150, jaegBesondereAbs8Jahr: 80550,
      bezugsgroesseMonat: 4130, minijobGrenzeMonat: 633, midijobFaktorF: 0.7683,
      minijobKvPauschaleAG: 0.175, mindestlohnStunde: 14.60, kindergeldMonat: 267,
    });
  });

  test('AG-Höchstzuschüsse folgen aus BBG und Sätzen', () => {
    const bbg = cfg27.bbgKvPvJahr / 12;
    const r = cfg27.rechengroessen;
    const zusatz = cfg27.kvZusatzDurchschnitt / 200;
    expect(bbg * (cfg27.kvANRateAllgemein + zusatz)).toBeCloseTo(r.agHoechstzuschussKvMitKrankengeld, 2);
    expect(bbg * (cfg27.kvANRateErmaessigt + zusatz)).toBeCloseTo(r.agHoechstzuschussKvOhneKrankengeld, 2);
    expect(bbg * cfg27.pvANRate).toBeCloseTo(r.agHoechstzuschussPpv, 2);
    expect(bbg * r.pvAGRateSachsen).toBeCloseTo(r.agHoechstzuschussPpvSachsen, 2);
  });

  test('AG-Zuschuss wird bei hohem PKV-Beitrag auf 672,56 € gedeckelt', () => {
    expect(calcAgZuschuss(2000, 8000, 2.9, cfg27)).toBeCloseTo(672.56, 2);
  });

  test('PV-Satz: Kinderlose 2,7 %, ein Kind 1,8 %', () => {
    expect(pvSatzByKinder(0, cfg27)).toBeCloseTo(0.027, 6);
    expect(pvSatzByKinder(1, cfg27)).toBeCloseTo(0.018, 6);
  });
});

describe('calcGehaltResult 2027 (GKV, Stkl I, kinderlos, 7.000 €, Zusatzbeitrag 2,9 %)', () => {
  const gh = { ...DEFAULT_GEHALT, ghBrutto: 7000, ghStkl: 1, ghKinder: 0, ghKinderFB: 0, ghKist: false,
    ghKvType: 'gkv', ghGkvZusatz: 2.9, ghYear: 2027, ghMonth: 1 };
  const r = calcGehaltResult(gh, 0, 0);

  test('SV-Beiträge sind an den BBG gedeckelt', () => {
    expect(r.kvAN).toBeCloseTo(6375 * 0.0875, 2);
    expect(r.pvAN).toBeCloseTo(6375 * 0.027, 2);
    expect(r.rv).toBeCloseTo(7000 * 0.093, 2);
    expect(r.av).toBeCloseTo(7000 * 0.013, 2);
  });

  test('Vorsorgepauschale nutzt BBG, Zusatzbeitrag 2,9 % und PV-Zuschlag 0,9 %', () => {
    // RV: 84.000 · 9,3 % = 7.812; KV/PV: 76.500 · (7,0 % + 1,45 % + 2,7 %) = 8.529,75
    expect(r.vspRV).toBeCloseTo(7812, 2);
    expect(r.vspKVPV).toBeCloseTo(8529.75, 1);
    expect(r.sonderausgabenJahr).toBe(16342);
  });

  test('Lohnsteuer folgt aus zvE und Tarif 2027', () => {
    // 84.000 − 1.430 − 36 − 16.342 = 66.192
    expect(r.lstDetail.ZVE).toBe(66192);
    expect(r.lstJahr).toBe(est(66192, cfg27));
    expect(r.lstDetail.cfgLabel).toBe('2027 – Entwurf');
  });
});

describe('2026 bleibt unverändert', () => {
  test('Tarif- und SV-Werte', () => {
    expect(cfg26).toMatchObject({
      label: '2026', gfb: 12348, zone2End: 17799, zone3End: 69878, zone4End: 277825,
      tarifZ2a: 914.51, tarifZ3a: 173.10, tarifZ3c: 1034.87,
      tarifZ4Abzug: 11135.63, tarifZ5Abzug: 19470.38,
      anp: 1230, kfbProKindSonst: 9756, pvKinderlosZuschlag: 0.006, kvZusatzDurchschnitt: 2.5,
      bbgKvPvJahr: 69750, bbgRvAlvJahr: 101400, soliFreigrenze: 20350,
    });
    expect(cfg26.zone5End).toBeUndefined();
    expect(cfg26.entwurf).toBeUndefined();
  });

  test('2026 und 2027 sind getrennte Parametersätze', () => {
    expect(TAX_CONFIGS.filter((c) => c.year === 2027)).toHaveLength(1);
    expect(getTaxConfig(2026, 12).year).toBe(2026);
    expect(getTaxConfig(2027, 1).year).toBe(2027);
  });
});
