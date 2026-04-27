# Finanztracker — Wealth Management & Cashflow für PKV-versicherte

## Projekt-Kontext

Hochgradig personalisierter Finanz-Tracker für anspruchsvolle Nutzer (Fokus: PKV-versicherte Angestellte/Selbstständige in Deutschland). Die App kombiniert **Cashflow-Management** mit **langfristiger Ruhestandsplanung** — Snapshots realer Kontostände, Versicherungs-Werte und Lohnsteuer-Berechnung in einem Repo.

## Tech Stack

- **Frontend:** React 19 (CRA), Material UI 7.3, Recharts, dayjs, react-router 7.
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions).
- **Auth:** Google OAuth via Supabase Auth, Row Level Security auf jeder Tabelle.
- **Deployment:** Vercel (Frontend) + Supabase Cloud.
- **Sprachen:** TypeScript-fähig, aktuell überwiegend JS; UI-Texte deutsch.

## Verhaltensregeln für Claude Code

Diese Regeln gelten unabhängig vom konkreten Task — beim Bearbeiten jeder Datei in diesem Repo:

1. **Keine Redundanz:** Vor dem Schreiben neuer Logik prüfen, ob eine Utility (z. B. Altersberechnung, Steuer-Engine) bereits existiert. Erst suchen, dann schreiben.
2. **Migrationen-First:** Neue DB-Felder verlangen ein neues SQL-Skript in `supabase/migrations/` **vor** dem Frontend-Code. Nicht über die Supabase-UI ad-hoc Felder anlegen — Schema bleibt versioniert.
3. **Decimal-Validierung:** Alle finanziellen Eingabewerte werden als `Number(...)` validiert; leere Strings → `null` oder `0`, niemals `NaN` ins DB.
4. **Steuer-Auswirkungen flaggen:** Wenn eine Änderung Brutto-/Netto-, Tarif- oder AfA-Logik berührt, im Commit-Message bzw. PR explizit darauf hinweisen.
5. **Inline-Styles verboten:** Keine `style={{ ... }}`-Props oder Hex-Codes in JSX. Alle visuellen Entscheidungen über das MUI-Theme (`sx`-Prop mit Theme-Tokens). Siehe [`.claude/skills/design-system/SKILL.md`](.claude/skills/design-system/SKILL.md).
6. **Modul-Workflow respektieren:** Neue Hauptmodule durchlaufen die Reihenfolge SQL → ModuleContext → Settings-UI → fachliche Logik. Siehe [`.claude/skills/architecture/SKILL.md`](.claude/skills/architecture/SKILL.md).

## Skill-Verzeichnis

Die fachlichen + technischen Detailregeln sind in `.claude/skills/<topic>/SKILL.md` aufgesplittet. Claude Code lädt sie on-demand — passend zum aktuellen Task.

| Skill | Wann lesen | Hauptthemen |
|---|---|---|
| [architecture](.claude/skills/architecture/SKILL.md) | Modul-Setup, RLS, Mobile, Deployment, Image-Upload | `app_modules`, `user_module_settings`, ModuleContext, Admin-Bypass, BBG-Breakpoints, Vercel-Deployment, Image-Compression |
| [design-system](.claude/skills/design-system/SKILL.md) | **Jede UI-Änderung** | MUI-Komponenten-Wahl, ThemeProvider, Border-Radius 16 px, KPI-Grid 188 px, Theme-Tokens, Inline-Style-Verbot |
| [steuern-de](.claude/skills/steuern-de/SKILL.md) | Steuerberechnungen aller Art | ETF-Teilfreistellung 30 %, Soli 20.350 €, Halbeinkünfte, Ertragsanteil-Tabelle, Fünftelregelung, BMF-API |
| [domain-strom](.claude/skills/domain-strom/SKILL.md) | Strommodul (Tarif, Verbrauch, Abrechnung) | Dynamische Abschläge, gewichteter Durchschnittspreis, Belegmanagement, Extra-Kosten/Gutschriften (verzerren NICHT kWh-Schnitt) |
| [domain-verbindlichkeiten](.claude/skills/domain-verbindlichkeiten/SKILL.md) | Kredit-/Schulden-Tasks | Annuitätskredit + First-Row-Override, Rahmenkredit (bidirektional), Toggle Tilgung/Entnahme |
| [domain-renten](.claude/skills/domain-renten/SKILL.md) | GRV (Schicht 1) + bAV (Schicht 2) | DRV-Renteninformation, Kohortenprinzip 86 %, KVdR, Beitragsfreistellung `is_passive` |
| [domain-versicherungen](.claude/skills/domain-versicherungen/SKILL.md) | Schicht-3-Policen + fondsgebundene Versicherungen | Hybrid-Modell, Nürnberger-Snapshot (Bewertungsreserven, fund_details), Steuer-Switch Kapital vs. Verrentung |
| [domain-pkv](.claude/skills/domain-pkv/SKILL.md) | PKV-Rechner + Lohnsteuer-Integration | GZ 10 %, Basisabsicherung, BRK, AG-Höchstzuschuss-Cap 613,22 € |
| [domain-depot](.claude/skills/domain-depot/SKILL.md) | Depot-Snapshots + Performance | `investment_snapshots`, ROI, Sparplan-Treppen-Chart |
| [domain-gehalt](.claude/skills/domain-gehalt/SKILL.md) | Gehaltsrechner + Historie + Real-Lohn | Tarifzonen 2026, Vorsorgepauschale, BBG-Deckelung, Inflations-Bereinigung via Destatis VPI |
| [domain-immobilien](.claude/skills/domain-immobilien/SKILL.md) | Immobilien-Modul | LTV, AfA linear/degressiv, 15 %-Grenze Instandhaltung, 10-Jahres-Haltefrist |
| [domain-haushaltsbuch](.claude/skills/domain-haushaltsbuch/SKILL.md) | Wochen-Budget Gemeinschaftskonto | Burn-Rate, Tages-Budget, Ampel-UI, Quick-Add mobile |

### Agents

| Agent | Wann nutzen |
|---|---|
| [frontend-design](.claude/agents/frontend-design.md) | Generische Aesthetic-Guidelines bei großen UI-Konzeptionen (Onboarding, Marketing-Pages). Innerhalb des Finanztracker-UIs gilt zusätzlich der `design-system`-Skill. |

## Lokale CLAUDE.md im Frontend

[client/CLAUDE.md](client/CLAUDE.md) enthält frontend-spezifische Hinweise und verweist zurück auf den `design-system`-Skill.

## Verzeichnisstruktur (vereinfacht)

```
Finanztracker/
├── CLAUDE.md                          ← Du bist hier
├── .claude/
│   ├── agents/frontend-design.md
│   └── skills/<topic>/SKILL.md        ← 12 thematische Skills
├── client/                            ← React-App
│   ├── CLAUDE.md
│   └── src/{components,hooks,pages,utils,lib,context,theme.js}
└── supabase/
    ├── migrations/                    ← Versionierte Schema-Änderungen
    └── setup.sql
```
