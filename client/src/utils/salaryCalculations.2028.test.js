// Prüft den Parametersatz „2028 – Entwurf“. Amtliche Testwerte gibt es für 2028
// noch nicht, deshalb Sollwerte aus dem Entwurf und Stetigkeit des Tarifs.
import { getTaxConfig, AVAILABLE_YEARS } from './taxConfigs';
import { tarifEst, calcAgZuschuss, pvSatzByKinder } from './salaryCalculations';

const cfg27 = getTaxConfig(2027, 1);
const cfg28 = getTaxConfig(2028, 1);

describe('Parametersatz 2028', () => {
  test('ist auswählbar und als Entwurf markiert', () => {
    expect(AVAILABLE_YEARS).toContain(2028);
    expect(cfg28.label).toBe('2028 – Entwurf');
    expect(cfg28.entwurf.offeneParameter).toContain('soliFreigrenze');
  });

  test('Sollwerte aus dem Entwurf', () => {
    expect(cfg28).toMatchObject({ gfb: 12900, kfbProKindSonst: 10236, kfbProKindStkl4: 5118 });
    expect(cfg28.rechengroessen.kindergeldMonat).toBe(272);
  });

  test('Platzhalter entsprechen 2027', () => {
    expect(cfg28).toMatchObject({
      anp: cfg27.anp, zone3End: cfg27.zone3End, zone4End: cfg27.zone4End, zone5End: cfg27.zone5End,
      bbgKvPvJahr: cfg27.bbgKvPvJahr, bbgRvAlvJahr: cfg27.bbgRvAlvJahr,
      pvKinderlosZuschlag: cfg27.pvKinderlosZuschlag, kvZusatzDurchschnitt: cfg27.kvZusatzDurchschnitt,
    });
  });

  test('PV-Satz Kinderlose bleibt bei 2,7 %', () => {
    expect(pvSatzByKinder(0, cfg28)).toBeCloseTo(0.027, 6);
  });

  test('AG-Zuschuss-Deckel entspricht dem Hinweistext', () => {
    const r = cfg28.rechengroessen;
    expect(calcAgZuschuss(2000, 8000, 2.9, cfg28))
      .toBeCloseTo(r.agHoechstzuschussKvMitKrankengeld + r.agHoechstzuschussPpv, 2);
  });
});

describe('Tarif 2028', () => {
  test('Grundfreibetrag endet bei 12.900 €', () => {
    expect(tarifEst(12900, cfg28)).toBe(0);
    expect(tarifEst(12901, cfg28)).toBeGreaterThan(0);
  });

  test('Formelwahl an den Zonenrändern', () => {
    expect(tarifEst(249999, cfg28)).toBeCloseTo(0.42 * 249999 - 11305.52, 2);
    expect(tarifEst(250000, cfg28)).toBeCloseTo(0.45 * 250000 - 18805.49, 2);
    expect(tarifEst(279999, cfg28)).toBeCloseTo(0.45 * 279999 - 18805.49, 2);
    expect(tarifEst(280000, cfg28)).toBeCloseTo(0.47 * 280000 - 24405.47, 2);
  });

  test.each([17799, 70600, 249999, 279999])('kein Sprung über %i €', (grenze) => {
    const sprung = tarifEst(grenze + 1, cfg28) - tarifEst(grenze, cfg28);
    expect(sprung).toBeGreaterThanOrEqual(0);
    expect(sprung).toBeLessThan(0.5);
  });
});
