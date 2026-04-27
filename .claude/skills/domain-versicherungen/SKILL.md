---
name: domain-versicherungen
description: Private Rentenversicherung (Schicht 3) und fondsgebundene Policen — Hybrid-Modell mit Stammdaten + jährlichen Snapshots (Nürnberger-Standard), Steuer-Switch Kapital vs. Verrentung. Lies diese Skill für Tasks rund um etf_policen, Snapshot-Erfassung, Schicht-3-Steuer-UI.
---

# Versicherungs-Modul (Schicht 3 + fondsgebundene Policen)

Schicht-3-Policen unterscheiden sich von GRV/bAV (siehe [`domain-renten`](../domain-renten/SKILL.md)) durch:
1. **Hybrid-Datenmodell** mit Snapshot-Historie aus realen Versicherungsschreiben.
2. **Eigene Steuerverfahren** (Halbeinkünfte oder Ertragsanteil — keine Abgeltungssteuer).
3. **Komplexere Snapshot-Felder** (Bewertungsreserven, Fondsdetails) als bei DRV-Renteninformation oder bAV-Snapshots.

## Hybrid-Modell-Prinzip

- **Definition:** Eine Police besteht aus **statischen Stammdaten** (Garantiewerte, Vertragsbeginn, Beitragsplan) und einer **Historie von jährlichen Snapshots** (Realdaten aus den jährlichen Versicherungsschreiben).
- **Prognose-Anker:** Zukünftige Berechnungen dürfen **nicht** beim Vertragsstart ansetzen. Sie müssen immer den **Zeitstempel und den Vertragswert des aktuellsten Snapshots** als Startpunkt (Basiswert) nutzen.

Das ist die kritischste Regel im gesamten Versicherungs-Modul: alte Snapshots (Vertragsstart-Werte) sind historischer Kontext — die **letzte Snapshot-Zeile** ist die einzig gültige Basis für jede Prognose.

## Snapshot-Datenstruktur (Nürnberger-Standard)

Jeder Snapshot muss folgende Felder erfassen können:

| Feld | Typ | Beschreibung |
|---|---|---|
| `snapshot_date` | Date | Datum der Information (z. B. Stand 31.12.2025) |
| `contract_value` | numeric | Aktueller Rückkaufswert / Vertragswert |
| `fund_balance` | numeric | Aktuelles Fondsguthaben (Σ aller Anteile) |
| `valuation_reserves` | numeric | Bewertungsreserven |
| `total_contributions_paid` | numeric | Σ der bisher eingezahlten Beiträge |
| `total_costs_paid` | numeric | Σ der bisher entnommenen Kosten (Vertrieb, Verwaltung) |
| `fund_details` | jsonb | Array von Objekten: `{ ISIN, Anteilspreis, Bestand, Name }` |

**Datenbank-Tabelle:** `policy_snapshots` (FK auf `etf_policen`).

## Mathematische Brücke (Prognose-Formel)

Ab dem letzten Snapshot:

$$Kapital_{Ende} = Kapital_{Snapshot} \times (1 + r)^t + \sum (Beitrag \times (1 + r)^n)$$

- $r$: prognostizierte Rendite (User-Input oder Default).
- $t$: Restlaufzeit ab Snapshot-Datum bis Rentenbeginn.
- $\sum$: Summe der noch zu leistenden Beiträge mit jeweils anteiliger Verzinsung $n$.

Implementierung: [client/src/utils/etfCalculations.js](../../../client/src/utils/etfCalculations.js) — `calcPolicy`, `calcAVD`, `calcDepot`.

## Schicht-3-spezifische UI / UX

### Steuer-Switch im Detail-Dialog

Implementiere in der Detailansicht der Police einen Toggle zwischen den zwei steuerlichen Auszahlungsoptionen:
- **Kapitalauszahlung** → Halbeinkünfteverfahren (siehe [`steuern-de`](../steuern-de/SKILL.md)).
- **Monatliche Rente** → Ertragsanteilbesteuerung (siehe [`steuern-de`](../steuern-de/SKILL.md)).

### Netto-Fokus
Zeige immer den **Brutto-Wert UND** den berechneten **Netto-Wert** (nach Steuern) an — sonst wirkt eine Police optisch attraktiver als sie real ist.

### Krankenversicherung im Ruhestand (Schicht 3)
- **PKV-Versicherte:** Keine zusätzlichen GKV-Beiträge auf die Schicht-3-Rente.
- **GKV-Versicherte (KVdR):** Schicht-3-Rente ist in der Regel **beitragsfrei** (Ausnahme: Direktversicherungen, die als bAV gelten — siehe [`domain-renten`](../domain-renten/SKILL.md)).

## Existierende Utilities

- [client/src/utils/etfCalculations.js](../../../client/src/utils/etfCalculations.js) — Prognose-Engine `calcPolicy`/`calcAVD`/`calcDepot`.
- [client/src/utils/insuranceTax.js](../../../client/src/utils/insuranceTax.js) — Halbeinkünfte- und Ertragsanteil-Berechnungen.
- [client/src/hooks/useETFPolicen.js](../../../client/src/hooks/useETFPolicen.js) — CRUD für Policen + Snapshots.
- [client/src/pages/ETFRechnerPage.js](../../../client/src/pages/ETFRechnerPage.js) — Master-UI mit Snapshot-Tabelle, Steuer-Switch, Prognose-Chart.

## Cross-Referenzen

- **Steuer-Verfahren im Detail (Halbeinkünfte, Ertragsanteil-Tabelle):** → [`steuern-de`](../steuern-de/SKILL.md)
- **GRV/bAV-Snapshots (anderes Datenmodell!):** → [`domain-renten`](../domain-renten/SKILL.md)
- **Snapshot-UI-Tokens:** → [`design-system`](../design-system/SKILL.md)
