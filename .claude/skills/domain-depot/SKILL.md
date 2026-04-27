---
name: domain-depot
description: Depot-Tracking mit Snapshots — Performance-Berechnung mit Teilfreistellung, Sparplan-Historie, Zwei-Linien-Chart Eingezahlt vs. Wert. Lies diese Skill für Tasks rund um investment_snapshots, depot_snapshots, ROI-Anzeige.
---

# Depot-Investment-Modul

Eigenständige Snapshot-Logik für den Vorsorge-Typ "Depot" — bildet Performance und Steuer korrekt ab. Anders als die fondsgebundenen Versicherungs-Policen (siehe [`domain-versicherungen`](../domain-versicherungen/SKILL.md)) wird hier nicht nach Nürnberger-Standard gespeichert, sondern simpler.

## Snapshot-Logik (Datenquelle)

### Tabelle `investment_snapshots`
| Feld | Typ | Beschreibung |
|---|---|---|
| `id`, `user_id`, `snapshot_date` | — | Standard |
| `total_balance` | numeric (€) | Tatsächlicher Wert des Depots laut Bank |
| `invested_capital` | numeric (€) | Σ aller bisherigen Einzahlungen − Entnahmen ("Eigengeld") |
| `dividends` | numeric (€) | Erhaltene Ausschüttungen (optional) |
| `costs` | numeric (€) | Depotgebühren / Transaktionskosten (optional) |

### Spezialisierte Tabelle `depot_snapshots` (für Vorsorge-Depot)
| Feld | Typ | Beschreibung |
|---|---|---|
| `id`, `retirement_id` (FK), `date` | — | Standard |
| `total_balance` | numeric | Aktueller Kurswert des Depots |
| `invested_capital` | numeric | Kumulierte Σ aller Eigeninvestitionen (wichtig für ROI) |

## Performance-Kennzahlen (berechnete Werte)

- **Absoluter Gewinn:** `total_balance − invested_capital`.
- **Performance in %:** `(Absoluter Gewinn / invested_capital) × 100`.
- **Netto-Performance:** Berücksichtigung der Steuern:
  - **Teilfreistellung** 30 % für Aktien-ETFs.
  - **Abgeltungsteuer** 26,375 % auf den steuerpflichtigen Gewinn.
  - Details → [`steuern-de`](../steuern-de/SKILL.md).

## UI-Anforderungen (MUI)

### Eingabe
- Einfacher Dialog "Neuen Snapshot erstellen".
- Felder: Datum, Total-Balance, Invested Capital, optional Dividenden + Kosten.

### Visualisierung — Zwei-Linien-Chart
1. **Eingezahltes Kapital** (Treppenstufen-Form bei Erhöhung des Sparplans).
2. **Depot-Wert** (die schwankende Kurve aus den Snapshots).

### Sparplan-Historie
- Tabelle, in der der User festhält: "Ab Jan 2026: 50 €", "Ab Juni 2026: 150 €".
- Wird genutzt, um die Treppenstufen-Linie korrekt zu zeichnen.

### Steuer-Sim Sektion
- Eigener Tab oder Sektion "Depot-Performance" innerhalb der Ruhestandsplanung.
- **Startpunkt** der Projektionskurve = `total_balance` des **letzten Snapshots** (gleiche Regel wie bei Versicherungen — kein Ansetzen am Vertragsstart).

## Existierende Utilities

- [client/src/utils/etfCalculations.js](../../../client/src/utils/etfCalculations.js) — `calcDepot()` für Vorsorge-Depots.
- [client/src/pages/ETFRechnerPage.js](../../../client/src/pages/ETFRechnerPage.js) — UI mit Snapshot-Tabelle, Sparplan-Historie, Prognose-Chart (geteilt mit `domain-versicherungen`).

## Cross-Referenzen

- **Teilfreistellung + Abgeltungsteuer Detail:** → [`steuern-de`](../steuern-de/SKILL.md)
- **Versicherungs-Snapshot-Modell (anders!):** → [`domain-versicherungen`](../domain-versicherungen/SKILL.md)
