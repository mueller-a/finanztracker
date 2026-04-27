---
name: design-system
description: Verbindliche MUI-Komponenten + visuelle Design-Tokens für den Finanztracker (border-radius 16 px, KPI-Grid 188 px, ThemeProvider). Lies diese Skill bei jeder UI-Änderung, jeder neuen Page und jeder Komponenten-Wahl.
---

# Design-System — Finanztracker

Single Source of Truth für alle visuellen Entscheidungen. Verbindlich für jede Page und Komponente.

## UI-Framework

- **Framework-Vorgabe:** Verwende für alle UI-Komponenten konsequent **Material UI (MUI)**.
- **Theming:** Nutze das MUI `ThemeProvider`-System. Alle Farben, Spacing und Typografie zentral über das Theme — nicht pro Page neu definieren.
- **Theme-Datei:** [client/src/theme.js](../../../client/src/theme.js) — Light/Dark-Theme + Component-Overrides.

## Komponenten-Wahl

- `MUI Card` für die Versicherungs-/Asset-Übersichten.
- `MUI Table` für tabellarische Historie (Snapshots, Gehaltsverlauf, Tilgungspläne).
- `MUI TextField` mit `InputAdornment` für Währungs-Eingaben (€) und Prozent-Eingaben (%).
- `MUI DatePicker` für Snapshot-Daten / Stichtage.
- `MUI Switch` für boolesche Optionen (`is_active`, `kirchensteuer_pflichtig` …).
- `MUI Tooltip` für Erklärungen zu komplexen Versicherungswerten (z. B. Bewertungsreserven).
- Icons aus `@mui/icons-material`.

## Layout

- **Ausschließlich** `Grid2` (oder die aktuelle MUI-Layout-Engine) und `Stack`.
- **KPI-Grid (zentrale Regel):**
  ```css
  grid-template-columns: repeat(auto-fit, minmax(188px, 1fr));
  ```
  Auf `xs` (Mobile) bricht das Grid auf 100 % Breite (1 Spalte) um.
- Helper-Mixin im Theme: `theme.mixins.kpiGrid`.

## Verbindliche Design-Tokens

### Border-Radius

- **Einheitlich 16 px** für alle Container-Elemente: `<Card>`, `<Paper>`, `<Dialog>`, `<TextField>`, `<Alert>`, `<Select>`, `<Button>`, `<Tooltip>`, `<TableContainer>`.
- `theme.shape.borderRadius = 16`. Der MUI-`sx`-Prop behandelt `borderRadius` als **Multiplikator**:
  - `sx={{ borderRadius: 1 }}` → `1 × 16 px = 16 px` ✅ **Standard**.
  - `sx={{ borderRadius: 2 }}` → `2 × 16 px = 32 px` ❌ **nicht verwenden**.
  - Alternativ: `sx={{ borderRadius: '16px' }}` (expliziter String, keine Multiplikation).
- **Ausnahmen:**
  - `<Chip>` / Pills / Tags: `borderRadius: 99` (voll runde Kapsel — MUI clamped visuell auf max. Dimension).
  - `<LinearProgress>`: `borderRadius: 99`.
  - Kleine Indikator-Boxen (< 24 × 24 px): explizit via `borderRadius: '8px'`, wenn eine kleinere Rundung gewünscht.

Alle globalen Komponenten-Overrides sind im Theme bereits auf 16 px konfiguriert. Bei neuen Containern einfach `<Card>`, `<Paper>`, `<Dialog>` nutzen — ohne Inline-`borderRadius`-Prop — dann greift der Standard automatisch.

### Farben

- **Niemals** arbitrary Hex-Codes (`#1a1744`, `#ede9fe`, …) inline verwenden.
- Stattdessen Theme-Tokens aus dem `accent`-/`text`-/`surface`-Palette-System:
  - `accent.positiveSurface` (emerald)
  - `accent.negative` (coral)
  - `surface.highest`
  - `text.primary`, `text.secondary`
  - `primary.main`, `primary.dark`, `primary.contrastText`

### Typografie

- Manrope für Display-Werte (Saldo, KPI-Hauptzahl) — fett, eng, hohe Lesbarkeit für Zahlen.
- System-Stack für Body-Text.
- Caption-Variant für Sublabels und Subtitle.

## Inline-Style-Verbot

**Niemals** `style={{ ... }}` oder hartkodierte Hex-Codes in Page-/Komponenten-Code. Alle Layout- und Farbentscheidungen über `sx`-Prop mit Theme-Tokens.

Begründung: Single-Source-of-Truth für Light/Dark-Konsistenz. Wer Hex hartkodiert, bricht das Theme-Switching.

## Existierende Wrapper-Komponenten

[client/src/components/mui/](../../../client/src/components/mui/):
- `KpiCard` — kompakte Kennzahl-Karte für das 188-px-Raster.
- `SectionCard` — Card mit Titel-Header.
- `PageHeader` — einheitlicher Page-Top mit Titel + Subtitle + Actions.
- `CurrencyField` — `<TextField type="number">` mit € Adornment.
- `DateField` — `<DatePicker>` mit deutschem Format `DD.MM.YYYY`.
- `ConfirmDialog` — Bestätigung mit Standard-Aktionen.

Wenn ein neuer wiederkehrender Pattern auftaucht: erst prüfen, ob es schon einen Wrapper gibt. Sonst hier ergänzen — nicht ad-hoc kopieren.

## Generische Aesthetic-Guidelines

Für Tasks, die ein neues UI-Konzept brauchen (Onboarding, Marketing-Pages, Showcases) → siehe Agent [`frontend-design`](../../agents/frontend-design.md). Der Agent übernimmt die "wie wirkt es"-Entscheidungen; dieser Skill hier definiert die "an welche Tokens muss es sich halten"-Regeln.
