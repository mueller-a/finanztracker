---
name: domain-haushaltsbuch
description: Variables Wochen-Budget — Gemeinschaftskonto-Logik, Burn-Rate-Berechnung, Tages-Budget, Ampel-Visualisierung, Quick-Add für Mobile. Lies diese Skill für Tasks rund um household_transactions, weekly_limit, gemeinsames Budget zweier User.
---

# Haushaltsbuch (Variables Wochen-Budget)

Geteilter Budget-Space für zwei Nutzer (Partner-Konto). Fokus liegt auf schnellem Erfassen im Alltag (Supermarkt-Quick-Add) und psychologischer Ampel-Visualisierung statt detaillierter Statistik.

## Gemeinschaftskonto-Logik

### Konzept
Ein geteilter Space für zwei Nutzer — beide können Ein- und Ausgaben buchen, beide sehen denselben Saldo.

### Datenmodell `household_transactions`
| Feld | Typ | Beschreibung |
|---|---|---|
| `id`, `created_at` | — | Standard |
| `amount` | numeric | Betrag |
| `description` | text | Freitext (z. B. "Edeka") |
| `category` | text | Supermarkt, Freizeit, Mobilität, … |
| `user_id` | uuid | Wer hat gezahlt? |
| `household_id` | uuid | Verknüpfung beider Partner |
| `type` | enum | `'income'` / `'expense'` |

### Budget-Definition
- Festgelegtes `weekly_limit` (z. B. 150 €).

## Die "Burn-Rate"-Logik

### Verfügbar
$$V = Limit - \sum \text{Ausgaben (aktuelle Woche)}$$

### Tages-Budget
Zeige an, wie viel pro restlichem Tag der Woche noch ausgegeben werden darf:

$$Tagesbudget = V / \text{restliche Tage}$$

### Psychologisches UI — Ampel
Nutze eine `MUI LinearProgress`-Bar mit Status-Farben:

| Status | Verfügbar | Farbe |
|---|---|---|
| Komfortabel | > 50 % | Grün |
| Achtsam | 20 % – 50 % | Gelb |
| Knapp | < 20 % | Rot |

## UI/UX-Anforderungen (MUI)

### Quick-Add-Widget
- Großer Button "Ausgabe erfassen" direkt auf dem Dashboard.
- Mobile-optimiert (Touch-Target ≥ 44 × 44 px — siehe [`architecture`](../architecture/SKILL.md)).

### Toggle "Diese Woche / Diesen Monat"
- Umschaltmöglichkeit, damit der User auch das Monats-Budget im Blick hat.

### Kategorien
- **Icon-basierte Auswahl** für schnelles Erfassen im Supermarkt.
- Vermeide Dropdown-Menüs — Tap statt Scroll-Selektion.

## Existierende Utilities

- [client/src/hooks/useHouseholdBudget.js](../../../client/src/hooks/useHouseholdBudget.js) — CRUD + Burn-Rate-Berechnung + Ampel-Logik.
- [client/src/pages/HouseholdBudgetPage.js](../../../client/src/pages/HouseholdBudgetPage.js) — Master-UI.

## Cross-Referenzen

- **Mobile-Touch-Target-Vorgaben:** → [`architecture`](../architecture/SKILL.md)
- **Ampel-Farben aus Theme-Tokens:** → [`design-system`](../design-system/SKILL.md)
