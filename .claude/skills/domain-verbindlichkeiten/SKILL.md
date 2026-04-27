---
name: domain-verbindlichkeiten
description: Kredit-Verwaltung — Annuitätsdarlehen mit First-Row-Override, Rahmenkredit/Abrufkredit mit bidirektionalen Transaktionen (Tilgung + Entnahme). Lies diese Skill bei Tasks rund um Tilgungspläne, Sondertilgungen, Rahmenkredit-UI, Schulden-Visualisierung.
---

# Verbindlichkeits-Modul

Zwei klar getrennte Kredit-Typen mit unterschiedlicher Logik:
- **Annuitätsdarlehen (`debt_type = 'annuity'`)** — fixe monatliche Rate, Tilgung wächst, Zins schrumpft.
- **Rahmenkredit / Abrufkredit (`debt_type = 'revolving'`)** — bidirektional, Saldo schwankt durch Entnahmen + Tilgungen.

## Annuitätsdarlehen — Amortisationslogik

### First-Row-Override

**Szenario:** Anpassung der Zinsen in der ersten Rate (Rumpfperiode/Anschlusszinsen).

- **Datenmodell:** Optionaler Wert `initial_interest_override` (Decimal) in der Tabelle `debts`.
- **Berechnungs-Logik:**
  - Wenn `initial_interest_override` existiert, ersetze die berechneten Zinsen der 1. Rate durch diesen Wert.
  - Tilgung der 1. Rate = `Rate − initial_interest_override`.
  - Alle folgenden Zeilen (ab Rate 2) berechnen sich automatisch auf Basis des verbleibenden Restdarlehens nach der korrigierten 1. Rate.

### UI (Material UI)
- In der Tilgungsplan-Tabelle erhält die Zins-Zelle der ersten Zeile ein `MUI Edit`-Icon.
- **Inline-Editing:** Beim Klick öffnet sich ein kleiner Inline-Editor oder ein Popover, um den Betrag anzupassen.
- **Visualisierung:** Manuell geänderte erste Zeile dezent markieren (kursiv oder "Manuell angepasst"-Tooltip), damit User die Korrektur erinnert.

## Rahmenkredit / Abrufkredit

### Transaktions-Logik (Bidirektional)

Im Gegensatz zum Annuitätsdarlehen erlaubt der Rahmenkredit sowohl Tilgungen als auch Entnahmen.

**Transaktionstypen:**
- **Tilgung (`type = 'repayment'`):** Verringert den Saldo der Verbindlichkeit. Default.
- **Entnahme (`type = 'withdrawal'`):** Erhöht den Saldo (Belastung des Kreditkontos).

**Datenmodell:** Die Tabelle `debt_payments` hat ein Feld `type` (Enum: `'repayment'`, `'withdrawal'`).

### UI & UX (MUI)
- **Eingabe-Dialog:** Beim Erfassen einer Buchung muss zwischen "Tilgung" und "Entnahme" gewählt werden können.
- **Komponente:** `MUI ToggleButtonGroup` für die Wahl des Typs:
  - Grün für Tilgung.
  - Rot/Orange für Entnahme.
- **Validierung:** Eine Entnahme darf den hinterlegten Gesamtrahmen (`credit_limit`) nicht überschreiten.
  - Validierungs-Formel: `(currentBalance + entnahmeAmount) ≤ credit_limit`.
  - Bei Überschreitung: Inline-Error im Dialog mit konkretem Hinweis "Würde Kreditrahmen von X € überschreiten".
- **Mindestrate-Hinweis:** Zinsen werden tagesgenau berechnet. Mindestrate = MAX(2 % des Saldos, 50 €).

### Visualisierung
- **Schuldenkurve:** Bei Entnahmen muss die Kurve nach oben steigen, bei Tilgungen nach unten.
- **Historie:** Entnahmen in der Transaktionsliste deutlich kennzeichnen (z. B. "+"-Präfix oder farbiges Icon).

## Existierende Utilities

- [client/src/utils/debtCalc.js](../../../client/src/utils/debtCalc.js) — `buildSchedule`, `buildRevolvingSchedule`, `simulateRevolvingExtraPayment`, `getCurrentBalance`, `getPayoffDate`, `buildDebtChart`, `buildAnnualInterest`, `isRevolving` — komplette Berechnungs-Library.
- [client/src/hooks/useDebts.js](../../../client/src/hooks/useDebts.js) — CRUD für Kredite und Zahlungen.
- [client/src/pages/VerbindlichkeitenPage.js](../../../client/src/pages/VerbindlichkeitenPage.js) — Master-Liste.
- [client/src/pages/DebtDetailPage.js](../../../client/src/pages/DebtDetailPage.js) — Detail-Page pro Kredit.

## Cross-Referenzen

- **UI-Tokens / Border-Radius:** → [`design-system`](../design-system/SKILL.md)
- **Zahlungs-Belege (Foto-Upload):** → [`architecture`](../architecture/SKILL.md) (Bild-Kompression-Vorgaben)
