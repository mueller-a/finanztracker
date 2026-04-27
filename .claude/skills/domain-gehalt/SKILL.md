---
name: domain-gehalt
description: Gehaltsrechner Deutschland 2026 — Lohnsteuer-Tarifzonen, Sozialversicherung mit BBG, Vorsorgepauschale-Günstigerprüfung, PKV-Integration, Gehaltshistorie mit Inflationsbereinigung. Lies diese Skill bei jeder Berechnung von Brutto→Netto, Tarif-Zone, Soli, Real-Lohn-Analyse.
---

# Gehaltsrechner & Lohnsteuer-Logik (Deutschland 2026)

Größtes Berechnungs-Modul des Repos. Pflichten: Lohnsteuer **exakt** nach BMF-Schema, Sozialversicherung mit BBG-Deckelung, Vorsorgepauschale mit Günstigerprüfung, PKV-Integration für Privatversicherte.

## Lohnsteuer-Rechenlogik (Präzisions-Regeln)

Strikt nach diesem Schema rechnen — sonst entsteht der Fehler "doppelter Grundfreibetrag".

### 1. Ermittlung des zvE (zu versteuerndes Einkommen)
```
zvE = Jahresbrutto − Arbeitnehmerpauschbetrag (1.230 €) − Sonderausgabenpauschale (36 €) − Vorsorgepauschale
```
**Wichtig:** Der Grundfreibetrag wird **NICHT** vom zvE abgezogen — er ist bereits mathematisch in den Tarifformeln integriert. Ziehe den Grundfreibetrag (12.348 €) NICHT manuell ab.

### 2. Tarif-Formeln 2026 (vereinfacht für Code)
- **Zone 1** (bis 12.348 €): Steuer = 0
- **Zone 2** (12.349 € bis 17.799 €): Eingangssteuersatz **14 %**.
- **Zone 3** (17.800 € bis 69.878 €): Lineare Progression bis **42 %**.
- **Zone 4** (69.879 € bis 277.825 €): `Steuer = (zvE − 69.878) × 0,42 + 18.230 €` (die 18.230 € ist die kumulierte Steuer der Zonen 1–3).
- **Zone 5** (ab 277.826 €): `Steuer = (zvE − 277.825) × 0,45 + 105.567 €`.

### 3. Validierungs-Regel
Bei Brutto **7.352,93 €** (≈ 88.235 € p. a.) muss zvE bei **≈ 71.800 €** liegen → **Zone 4 (42 %)**. Eine monatliche Lohnsteuer **< 1.500 €** ist bei diesem Gehalt (Stkl. 1) mathematisch unmöglich. Wenn dein Code unter dieser Grenze landet, ist die Tarif-Zone falsch.

### Weitere Lohnsteuer-Komponenten
- **Solidaritätszuschlag (Soli) 2026:** Freigrenze — Soli erst, wenn jährliche Lohnsteuer **20.350 €** übersteigt.
- **Kirchensteuer:** Nur wenn `kirchensteuer_pflichtig === true`. Bemessungsgrundlage: Lohnsteuer. **8 %** (BY/BW) oder **9 %** (alle anderen Bundesländer).
- **Kinderfreibetrag:** **3.414 €** pro Elternteil (gesamt 6.828 €) — wichtig für Günstigerprüfung Kindergeld vs. Freibetrag.

Detail-Spec → [`steuern-de`](../steuern-de/SKILL.md).

## Vorsorgepauschale (§ 39b EStG)

Die Lohnsteuer basiert auf dem zu versteuernden Einkommen. Wichtigster Abzugsposten ist die Vorsorgepauschale, bestehend aus:

### 1. Teilbetrag Altersvorsorge
- **9,3 %** des Bruttolohns (gedeckelt an BBG RV).
- In 2026 zu **100 %** absetzbar.

### 2. Teilbetrag KV/PV (Günstigerprüfung)
- **GKV-Fall:** `(AN-Beitrag_KV × 0,96) + AN-Beitrag_PV`.
- **PKV-Fall:** `(PKV_Basisanteil − steuerfreier_AG_Zuschuss)`.
- **Mindestschutz:** Dieser Teilbetrag (KV/PV) darf die **Mindestvorsorgepauschale** nicht unterschreiten:
  - 12 % des Bruttolohns, max. **1.900 € p. a.** (Stkl. I, II, IV) bzw. **3.000 € p. a.** (Stkl. III).

### 3. Weitere Abzüge
- Arbeitnehmer-Pauschbetrag (Werbungskosten): **1.230 € p. a.**
- Sonderausgaben-Pauschbetrag: **36 € p. a.**

## Sozialversicherung & Grenzwerte (Stand 2026)

### Beitragssätze
- **Rentenversicherung (RV):** 18,6 % (AN-Anteil: 9,3 %).
- **Arbeitslosenversicherung (AV):** 2,6 % (AN-Anteil: 1,3 %).
- **Krankenversicherung (GKV):** 14,6 % + Zusatzbeitrag (AN trägt jeweils die Hälfte).
- **Pflegeversicherung (PV):** 3,4 % Basissatz. Zuschlag für Kinderlose (0,6 %) entfällt ab dem 1. Kind. Abschläge ab dem 2. Kind (0,25 % pro Kind).

### Beitragsbemessungsgrenzen (BBG) — Monatswerte
- **BBG KV/PV:** **5.812,50 €**
- **BBG RV/AV (West):** **8.450,00 €**
- **BBG RV/AV (Ost):** **8.350,00 €**

## PKV-Integration

Bei privatversicherten Angestellten ändert sich die Vorsorgepauschale-Berechnung und die Netto-Formel. Konkrete Beträge (AG-Höchstzuschuss-Cap 613,22 €) → [`domain-pkv`](../domain-pkv/SKILL.md).

### Netto-Berechnung (PKV-Fall)
```
Auszahlung = Brutto − Lohnsteuer − Soli − RV(AN) − AV(AN) − (PKV_Gesamt − AG_Zuschuss)
```

## BMF-Validierung (offizielle Berechnung)

Für unabhängige Validierung gegen das offizielle Berechnungsschema des Bundesfinanzministeriums.

- **API-Endpunkt:** `https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml` (Pflicht-Parameter, XML-Tag `<lstlzz>`).
- **Architektur-Hinweis:** Proxy via Supabase Edge Function — direkte Browser-Aufrufe scheitern an CORS.
- Vollständige Param-Spec → [`steuern-de`](../steuern-de/SKILL.md).
- **Existierender Validator:** [client/src/lib/bmfValidator.js](../../../client/src/lib/bmfValidator.js).

## Gehaltshistorie & -prognose

### Tab-Navigation
- **Struktur:** `MUI Tabs`-Komponente am oberen Rand des Moduls.
  - Tab 1: "Aktueller Rechner" (bestehende Logik).
  - Tab 2: "Gehaltshistorie & Prognose" (neue Seite).

### Datenmodell & Logik
- **Tabelle `salary_history`:** `id, user_id, year (int), annual_gross (€), net_monthly (€), is_projection (bool)`.
- **Berechnungen:**
  - **Steigerung:** Prozentuale Veränderung zum Vorjahr automatisch — `((Aktuell / Vorjahr) − 1) × 100`.
  - **Monatswerte:** Brutto Monat = Jahresbrutto / 12.
  - **Prognose-Modus:** Eingabe einer pauschalen Steigerungsrate (z. B. 5 %), zukünftige Jahre automatisch vorberechnen.

### UI-Anforderungen (MUI)
- **Darstellung:** `MUI Table` für tabellarische Ansicht (analog zum Excel-Screenshot).
- **Interaktion:**
  - Inline-Editing für historische Jahre.
  - Prognose-Jahre (z. B. ab 2027) optisch markieren — kursiv oder andere Hintergrundfarbe.
- **Visualisierung:** Line-Chart unter der Tabelle, der die Entwicklung von Brutto- und Netto-Einkommen über die Jahre zeigt.

## Real-Lohn-Analyse (Inflations-Check)

### Datenquelle
- **Destatis API (GENESIS-Online):**
  - Endpunkt: `https://www-genesis.destatis.de/genesisWS/rest/2020/`
  - Tabelle: `61111-0001` (Verbraucherpreisindex — VPI).

### Logik
- **Inflation:** Jährliche Inflationsrate (VPI) für alle Jahre in der Gehaltshistorie abrufen.
- **Real-Lohn-Index:** Inflationsbereinigte Darstellung des Gehalts.
- **Formel:** `Realgehalt = Nominalgehalt / (1 + Inflationsrate)` (kumuliert ggü. Basisjahr).

### Prognose
- Eingabe einer geschätzten zukünftigen Inflationsrate (Default: **2,0 %**).
- Berechnung der Kaufkraftentwicklung für die Prognose-Jahre.

### Visualisierung (MUI)
- Erweitere den Chart um eine zweite Linie: **"Reallohn (Kaufkraft)"**.
- Spalte "Kaufkraft-Delta" in der Tabelle (Gewinn/Verlust an Kaufkraft zum Basisjahr).

## Existierende Utilities

- [client/src/utils/salaryCalculations.js](../../../client/src/utils/salaryCalculations.js) — Brutto-Netto-Engine.
- [client/src/utils/salaryHistoryCalc.js](../../../client/src/utils/salaryHistoryCalc.js) — Historie + Inflations-Adjust.
- [client/src/utils/taxConfigs.js](../../../client/src/utils/taxConfigs.js) — Tarif-Zonen-Konstanten 2026.
- [client/src/lib/bmfValidator.js](../../../client/src/lib/bmfValidator.js) — BMF-API-Proxy-Wrapper.
- [client/src/lib/inflationData.js](../../../client/src/lib/inflationData.js) — VPI-Daten / Destatis-Cache.
- [client/src/pages/SalaryPage.js](../../../client/src/pages/SalaryPage.js) — Master-UI.

## Cross-Referenzen

- **Soli, Kirchensteuer, BMF-API-Spec im Detail:** → [`steuern-de`](../steuern-de/SKILL.md)
- **PKV-AG-Zuschuss-Beträge:** → [`domain-pkv`](../domain-pkv/SKILL.md)
- **Lohnsteuer-Formeln und Tarifzonen Detail:** → [`steuern-de`](../steuern-de/SKILL.md)
