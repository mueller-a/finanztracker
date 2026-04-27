---
name: steuern-de
description: Cross-Cutting deutsche Steuer-Logik — ETF-Besteuerung mit Teilfreistellung, Soli/Kirchensteuer/Kinderfreibetrag, Halbeinkünfteverfahren, Ertragsanteilbesteuerung, Fünftelregelung, Vorsorgepauschale, BMF-Validierungs-API. Lies diese Skill bei jeder Berechnung mit steuerlichem Bezug.
---

# Steuerrecht Deutschland (Cross-Cutting)

Steuer-Logik wird von mehreren Domain-Modulen genutzt (Renten, Versicherungen, Depot, Gehalt, Immobilien). Hier zentral, jeder Domain-Skill verlinkt zurück.

## ETF-Besteuerung

- **Abgeltungssteuer:** 25 % + 5,5 % Soli = effektiv **26,375 %**.
- **Teilfreistellung Aktien-ETFs:** **30 %** des Gewinns sind steuerfrei.
- **Netto-Performance-Berechnung:** Berücksichtigung beider Faktoren erforderlich, sonst werden Ergebnisse zu hoch ausgewiesen.

## Solidaritätszuschlag (Soli) 2026

- **Freigrenze:** Soli wird erst erhoben, wenn die jährliche Lohnsteuer **20.350 €** übersteigt.

## Kirchensteuer

- Nur berechnen, wenn `kirchensteuer_pflichtig === true`.
- Bemessungsgrundlage: Lohnsteuer.
- **8 %** in Bayern und Baden-Württemberg, **9 %** in allen anderen Bundesländern.

## Kinderfreibetrag

- **3.414 €** pro Elternteil (gesamt 6.828 €).
- Wichtig für die Prüfung, ob Kindergeld oder Freibetrag günstiger ist (Günstigerprüfung im Einkommensteuerbescheid).

## Halbeinkünfteverfahren — Schicht-3-Police, Kapitalauszahlung

- **Rechtsgrundlage:** § 20 Abs. 1 Nr. 6 EStG.
- **Voraussetzung:** Vertragslaufzeit ≥ 12 Jahre **UND** Auszahlung nach vollendetem 62. Lebensjahr.
- **Berechnung:**
  1. Gewinn = `Auszahlungsbetrag − Σ eingezahlte Beiträge`.
  2. Steuerpflichtiger Ertrag = `Gewinn × 0,5` (50 % steuerfrei).
  3. Individuelle Steuer = `Steuerpflichtiger Ertrag × persönlicher Steuersatz`.

**Wichtig:** Für private Rentenversicherungen wird **KEINE Kapitalertragsteuer (25 %)** berechnet — nur Halbeinkünfteverfahren oder Ertragsanteilbesteuerung.

## Ertragsanteilbesteuerung — Schicht-3-Police, Verrentung

- **Rechtsgrundlage:** § 22 EStG.
- **Logik:** Nur ein Bruchteil der monatlichen Rente (der "Ertragsanteil") wird versteuert.

### Ertragsanteil-Tabelle (Alter bei Rentenbeginn)

| Alter | Ertragsanteil |
|---|---|
| 62 J | 21 % |
| 63 J | 20 % |
| 64 J | 19 % |
| 65 J | 18 % |
| 66 J | 18 % |
| 67 J | 17 % |
| 70 J | 15 % |

### Berechnung
1. Steuerpflichtiger Anteil = `Monatsrente × Ertragsanteil`.
2. Monatliche Steuerlast = `Steuerpflichtiger Anteil × persönlicher Steuersatz`.

## Fünftelregelung — bAV-Einmalauszahlung

- **Rechtsgrundlage:** § 34 EStG.
- **Anwendung:** Bei einmaliger Kapitalauszahlung der bAV → Progression abmildern, indem rechnerisch fünf Jahre Auszahlung simuliert werden.
- **Bei monatlicher Rente:** Nicht anwendbar — die monatliche bAV-Rente wird zu 100 % mit dem persönlichen Einkommensteuersatz versteuert (siehe `domain-renten`).

## Lohnsteuer-Tarif 2026 (Präzisions-Regeln)

Strikt nach diesem Schema rechnen, sonst entsteht der Fehler "doppelter Grundfreibetrag".

### 1. Ermittlung des zvE (zu versteuerndes Einkommen)
```
zvE = Jahresbrutto − Arbeitnehmerpauschbetrag (1.230 €) − Sonderausgabenpauschale (36 €) − Vorsorgepauschale
```
**Wichtig:** Der Grundfreibetrag (12.348 €) wird NICHT vom zvE abgezogen — er ist bereits mathematisch in den Tarifformeln integriert.

### 2. Tarif-Formeln 2026
- **Zone 1** (bis 12.348 €): Steuer = 0
- **Zone 2** (12.349 € bis 17.799 €): Eingangssteuersatz 14 %.
- **Zone 3** (17.800 € bis 69.878 €): Lineare Progression bis 42 %.
- **Zone 4** (69.879 € bis 277.825 €): `Steuer = (zvE − 69.878) × 0,42 + 18.230 €`.
- **Zone 5** (ab 277.826 €): `Steuer = (zvE − 277.825) × 0,45 + 105.567 €`.

### 3. Validierungs-Regel
Bei Brutto 7.352,93 € (≈ 88.235 € p. a.) muss zvE bei ≈ 71.800 € liegen → Zone 4 (42 %). Eine monatliche Lohnsteuer < 1.500 € ist bei diesem Gehalt (Stkl. 1) mathematisch unmöglich.

## Vorsorgepauschale (für Lohnsteuer-Berechnung)

Bestandteile:

### 1. Teilbetrag Altersvorsorge
- 9,3 % des Bruttolohns (gedeckelt an BBG RV).
- In 2026 zu **100 %** absetzbar.

### 2. Teilbetrag KV/PV (Günstigerprüfung)
- **GKV-Fall:** `(AN-Beitrag_KV × 0,96) + AN-Beitrag_PV`.
- **PKV-Fall:** `(PKV_Basisanteil − steuerfreier_AG_Zuschuss)`.
- **Mindestschutz:** Dieser Teilbetrag darf die **Mindestvorsorgepauschale** nicht unterschreiten:
  - 12 % des Bruttolohns, max. 1.900 € p. a. (Stkl. I, II, IV) bzw. 3.000 € p. a. (Stkl. III).

### 3. Weitere Abzüge
- Arbeitnehmer-Pauschbetrag (Werbungskosten): 1.230 € p. a.
- Sonderausgaben-Pauschbetrag: 36 € p. a.

## BMF-Validierung (offizielle Steuerberechnung)

Für unabhängige Validierung gegen das offizielle Berechnungsschema des Bundesfinanzministeriums.

- **API-Endpunkt:** `https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml`
- **Pflicht-Parameter:**
  - `code=LSt2026ext` — externe Schnittstelle für 2026 aktivieren.
  - `LZZ=1` — Berechnungszeitraum Monat (2 für Jahr, 3 für Quartal).
  - `RE4` — laufender Arbeitslohn in **Cents** (Brutto × 100).
  - `STKL` — Steuerklasse (1–6).
  - `f` — Faktor (nur bei Steuerklasse 4 mit Faktor).
  - `PKV` — 1 für privat versichert, 0 für gesetzlich.
  - `PKPV` — PKV-Basisbeitrag pro Monat in **Cents**.
  - `AGVZ` — steuerfreier Arbeitgeberzuschuss in **Cents**.
- **Verarbeitung:** Wert aus dem XML-Tag `<lstlzz>` für die monatliche Lohnsteuer extrahieren.
- **Architektur:** Proxy via Supabase Edge Function — direkte Browser-Aufrufe scheitern an CORS.
- **Existierender Validator:** [client/src/lib/bmfValidator.js](../../../client/src/lib/bmfValidator.js).

## Cross-Referenzen

- **Lohnsteuer-Berechnung im Gehaltsrechner:** → [`domain-gehalt`](../domain-gehalt/SKILL.md)
- **PKV-spezifische Beiträge / AG-Zuschuss-Cap:** → [`domain-pkv`](../domain-pkv/SKILL.md)
- **Schicht-3-Auszahlungs-UI:** → [`domain-versicherungen`](../domain-versicherungen/SKILL.md)
- **bAV nachgelagerte Besteuerung:** → [`domain-renten`](../domain-renten/SKILL.md)
- **Depot Teilfreistellung:** → [`domain-depot`](../domain-depot/SKILL.md)
- **AfA, Veräußerungsgewinn 10-Jahres-Frist:** → [`domain-immobilien`](../domain-immobilien/SKILL.md)
