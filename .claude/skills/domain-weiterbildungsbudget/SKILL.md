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

### Jahreslimit
- `user_module_settings.learning_budget_annual_limit` (Default 1200) — **ein** Wert, gilt für alle Jahre. Änderung wirkt sich auf die Verfügbar-Berechnung aller Jahre aus (keine Jahres-spezifischen Overrides — bewusst nicht gebaut, da nicht gefordert).
- Verwaltung über `ModuleContext` (`learningBudgetLimit` / `setLearningBudgetLimit`), analog zu `steuerSatzAlter`.

## Jahres-Logik

- Kein separater "Reset"-Mechanismus nötig: Restbetrag wird immer für das aktuell gewählte Jahr aus den Items dieses Jahres berechnet.
- Jahres-Umschalter (Chevron links/rechts) in `LearningBudgetPage.js`, Default = laufendes Kalenderjahr. Zukünftige Jahre sind gesperrt (`disabled` auf "nächstes Jahr"-Button).

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
