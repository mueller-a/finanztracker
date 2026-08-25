---
name: domain-weiterbildungsbudget
description: Jährliches Personal-Development-Budget (Fachbücher, Konferenzen, Training) — Jahres-Deckel, Restbetrag-Berechnung, Ampel-UI. Lies diese Skill für Tasks rund um learning_budget_items, learning_budget_annual_limit.
---

# Weiterbildungsbudget (Personal Development Budget)

Einzelnutzer-Modul zum Tracken von Ausgaben gegen ein jährliches Arbeitgeber-Budget (Standard 1.200 €) für Fachbücher, Konferenzen und Trainingsmaterial. Kein Beleg-Upload, keine Erstattungsstatus-Verwaltung — bewusst simpel gehalten, Fokus liegt auf dem Überblick "wie viel ist noch übrig".

## Datenmodell

### `learning_budget_items`
| Feld | Typ | Beschreibung |
|---|---|---|
| `id`, `created_at` | — | Standard |
| `user_id` | uuid | Eigentümer (kein Sharing, anders als `household_transactions`) |
| `amount` | numeric(10,2) | Betrag der Ausgabe |
| `category` | text | `'fachbuch' \| 'konferenz' \| 'training' \| 'sonstiges'` |
| `description` | text | Freitext (optional) |
| `occurred_at` | date | Datum der Ausgabe — das Jahr wird daraus abgeleitet (`occurred_at.slice(0,4)`), kein separates `year`-Feld |

### Jahreslimit (pro Jahr, NICHT global)
- `learning_budget_year_limits` (`user_id`, `year`, `annual_limit`, UNIQUE `(user_id, year)`) — ein Eintrag pro Jahr. **Kein** globales Limit-Feld mehr (ein früherer Entwurf hatte `user_module_settings.learning_budget_annual_limit` — bewusst wieder entfernt, siehe unten "Warum kein globales Limit").
- Fallback-Kette pro Jahr (`effectiveLimitForYear` in `useLearningBudget.js`): eigener Eintrag → sonst rückwärts das nächste gesetzte Vorjahr → sonst `DEFAULT_ANNUAL_LIMIT` (1200).
- Editieren eines Jahres (`setYearLimit(year, value)`) schreibt **ausschließlich** die Zeile für genau dieses Jahr — vergangene und zukünftige Jahre bleiben unverändert.

### Warum kein globales Limit
Ein einzelner `annual_limit`-Wert für alle Jahre hätte bedeutet: Ändert man das Budget fürs laufende Jahr (z. B. Gehaltserhöhung, neues PD-Budget), würde sich die Verfügbar-Berechnung rückwirkend auch für vergangene, bereits abgeschlossene Jahre ändern — fachlich falsch. Stattdessen: jedes Jahr hat sein eigenes Limit; neue Jahre übernehmen automatisch das zuletzt gesetzte Vorjahres-Limit als Startwert, bis man es explizit für das neue Jahr ändert.

## Jahres-Logik

- Kein separater "Reset"-Mechanismus nötig: Restbetrag wird immer für das aktuell gewählte Jahr aus den Items dieses Jahres berechnet.
- Jahres-Umschalter (Chevron links/rechts) in `LearningBudgetPage.js`, Default = laufendes Kalenderjahr. Zukünftige Jahre sind gesperrt (`disabled` auf "nächstes Jahr"-Button).
- `YearLimitEditor` in `LearningBudgetPage.js` zeigt an, ob das Limit für das gewählte Jahr explizit gesetzt wurde (`hasExplicitLimit`) oder vom Vorjahr übernommen ist — und materialisiert erst beim Speichern einen eigenen Eintrag für dieses Jahr.

## Berechnung (`useLearningBudgetStats`)

```
spent     = Σ amount (Items des gewählten Jahres)
available = max(0, annualLimit - spent)
percentAvailable = available / annualLimit × 100
```

### Ampel-Farblogik (wiederverwendet aus [`domain-haushaltsbuch`](../domain-haushaltsbuch/SKILL.md))
| Status | Verfügbar | Farbe |
|---|---|---|
| Komfortabel | > 50 % | Grün (`success`) |
| Achtsam | 20 % – 50 % | Gelb (`warning`) |
| Knapp | < 20 % | Rot (`error`) |

## Existierende Utilities

- [client/src/hooks/useLearningBudget.js](../../../client/src/hooks/useLearningBudget.js) — `useLearningBudgetItems` (CRUD) + `useLearningBudgetStats` (Jahres-Berechnung inkl. Ampel-Severity und Kategorie-Aufschlüsselung).
- [client/src/pages/LearningBudgetPage.js](../../../client/src/pages/LearningBudgetPage.js) — Master-UI (Jahres-Navigator, KPI-Grid, Ampel-Progress, Eintrags-Liste, Jahreslimit-Editor).

## Cross-Referenzen

- **Modul-Registrierung (SQL → ModuleContext → Settings-UI):** → [`architecture`](../architecture/SKILL.md)
- **Ampel-Farben + KPI-Grid aus Theme-Tokens:** → [`design-system`](../design-system/SKILL.md)
- **Ampel-UI-Vorbild:** → [`domain-haushaltsbuch`](../domain-haushaltsbuch/SKILL.md)
