---
name: architecture
description: Modul-System, RLS-Sicherheit, Admin-Bypass, Mobile-Layout, Vercel-Deployment, Frontend-Image-Compression. Lies diese Skill bei Tasks rund um Modul-Registrierung, Authentifizierung, Berechtigungs-Logik, Responsive Design oder Bild-Uploads.
---

# Architektur — Cross-Cutting

Repo-weite Strukturregeln, die für jeden Task gelten — unabhängig von der konkreten Fachdomäne.

## Modul-Architektur & Feature-Flagging

### 1. Registrierung neuer Module
- **Datenbank-Konsistenz:** Jedes neue Hauptmodul (z. B. `real_estate`) MUSS eine Boolean-Spalte in `user_module_settings` erhalten (Name: `show_[modulname]`, Default: `true`).
- **Settings-Integration:** Jedes neue Modul bekommt einen Toggle-Switch im `/settings` Bereich (Tab "Module"). Jede Karte braucht Name + Icon + kurze Beschreibung.

### 2. Bedingtes Rendering
- **Sidebar:** Modul-Links nur rendern, wenn das Flag in `user_module_settings` auf `true` steht.
- **Dashboard:** Widgets/KPI-Karten eines Moduls ausblenden, wenn das Modul deaktiviert ist.
- **Berechtigungs-Check:** Zentrale Logik via `ModuleContext` — globaler Check verhindert unnötige API-Abrufe für deaktivierte Features.

### 3. Workflow bei Modul-Erstellung (in dieser Reihenfolge)
1. SQL-Skript zur Erweiterung von `user_module_settings`.
2. `ModuleContext` / Provider aktualisieren, um das neue Flag zu laden.
3. Toggle in der Settings-UI integrieren.
4. **Erst danach** die fachliche Logik des Moduls umsetzen.

## Globale Feature-Toggles (`app_modules`)

### Datenmodell & Sicherheit
- **Tabelle `app_modules`:** Zentrale Steuerungstabelle. Spalten: `id`, `module_key` (z. B. `pkv`, `electricity`), `is_active` (boolean), `label` (text).
- **Admin-Berechtigung:** Nur Nutzer mit Rolle `admin` dürfen `app_modules` ändern.
- **RLS:** `SELECT` für alle authentifizierten Nutzer; `UPDATE/INSERT` nur für Admins.

### UI-Logik (Conditional Rendering)
- **Sidebar & Dashboard:** Vor dem Render eines Modul-Links/Kachel den Status in `app_modules` prüfen.
- **Globaler Context:** Modul-Status beim App-Start in einen `ModuleContext` laden — keine DB-Abfrage pro Klick.
- **Admin-Panel:** Einstellungsseite (nur für Admins sichtbar) mit `MUI Switch`-Liste pro Modul.

### UX bei Direktaufruf
- Wenn ein Nutzer eine URL eines deaktivierten Moduls direkt aufruft → Redirect auf "Under Construction"-Seite oder Dashboard.

### Sichtbarkeits-Matrix (Bypass-Logik)
- **Admin-Status:** Ein Nutzer mit `role === 'admin'` hat IMMER Zugriff, unabhängig vom `is_active`-Flag.
- **User-Status:** Ein normaler Nutzer sieht ein Modul NUR, wenn `is_active === true`.
- **Frontend-Implementierung:**
  ```js
  const isVisible = module.is_active || currentUser.role === 'admin';
  ```
- **Route-Guards:** Wrapper für geschützte Routen muss Admins den Zugriff erlauben, selbst wenn das Modul deaktiviert ist.

## Security & Multi-User

- **Provider:** Google OAuth via Supabase Auth.
- **Data Isolation:** Jede Tabelle hat eine `user_id`. **Row Level Security (RLS)** ist zwingend. Jede Query muss auf `auth.uid() = user_id` prüfen.
- **Roles:** Es gibt die Rollen `user` und `admin`. Admins haben Zugriff auf den `/settings` → "Developer" Tab.

## Daten-Management

- **Persistenz:** Supabase (PostgreSQL).
- **Single Source of Truth:** Das Geburtsdatum (`birthday`) wird zentral in `user_module_settings` verwaltet und global via Context verteilt.
- **Auto-Save:** Eingabefelder nutzen **Debounce-Logik (800 ms)**, um API-Calls zu minimieren.

## Dashboard-Architektur (Command Center)

### Hierarchie
Summary (Netto-Vermögen, Liquidity, Sparquote) → Module Status → Visual Trends → Quick Actions.

### KPI-Logik pro Modul
- **Strom:** Zeige "Delta" (Guthaben/Nachzahlung) statt nur Jahresverbrauch.
- **Verbindlichkeiten:** Zeige "Debt Free Date".
- **Ruhestand:** Zeige "Netto-Rente nach heutiger Kaufkraft".
- **Versicherungen:** Zeige "Optimierungspotenzial" oder "Nächster Kündigungstermin".

### Design-Vorgabe
- `MUI Stack` für vertikale Trennung der Sektionen.
- `MUI Divider` zwischen Header und Content.
- Keine "Floating Bubbles" — alle KPI-Cards in das **188px-Grid** (siehe `design-system`).

### KPI-Definitionen (cross-cutting)
- **Netto-Vermögen:** Σ Assets (Konten + Depot + Immobilien + Versicherungswerte) − Σ Verbindlichkeiten (Kredite + Rahmenkredite).
- **Liquidity Runway:** `Verfügbares Cash / Monatliche Fixkosten`.
- **Sparquote:** `(Einnahmen − Ausgaben) / Einnahmen × 100`.
- **Schuldenfrei-Datum:** Aus dem Tilgungsplan des Kredits mit der längsten Laufzeit.
- **Strom-Forecast:** Aktueller Zählerstand hochgerechnet aufs Jahr vs. Σ gezahlter Abschläge.

## Frontend Image Processing

Vor jedem Upload werden Bilder im Frontend komprimiert. Existierende Helper: [client/src/utils/imageCompression.js](../../../client/src/utils/imageCompression.js).

### Spezifikationen
- Format: JPEG (progressive).
- Maximale Breite/Höhe: 1280 px (reicht für Zählerstände).
- Qualität: 0,7 bis 0,8.
- Zielgröße: < 500 KB.

### Library-Wahl
- Nutze `browser-image-compression` oder eine native `Canvas`-Implementierung — Bundle-Größe niedrig halten.

### UX
- Während Kompression + Upload einen Ladeindikator zeigen (`MUI CircularProgress` mit Prozentanzeige).

## Mobile Optimierung & Responsivität

### Navigation & Layout
- Konsequent MUI Breakpoints (`xs`, `sm`, `md`).
- **Desktop:** Permanente Sidebar links.
- **Mobile (xs/sm):** Sidebar durch `MUI BottomNavigation` für die wichtigsten Module ODER `SwipeableDrawer` (Hamburger) ersetzen.
- **Viewport:** `user-scalable=no` im Meta-Tag — verhindert ungewolltes Zoomen beim Tippen in Inputs.

### Tabellen & Listen
- Große Tabellen (Versicherungen, Gehalt) auf Mobile zu `MUI Cards` transformieren — jede Zeile wird eine Card.
- Wenn Tabelle bleiben muss: `<TableContainer component={Paper} sx={{ overflowX: 'auto' }}>`.

### Formulare & Charts
- Touch-Targets mind. **44 × 44 px**.
- Recharts immer in `<ResponsiveContainer>` packen — keine Charts über den Bildschirmrand.
- Das 188-px-KPI-Grid bricht auf `xs` auf 100% Breite (1 Spalte) um.

## Deployment & Web-Spezifika (Vercel)

- **Environment Variables:** Ausschließlich `process.env` für API-Keys.
- **Navigation:** Keine harten `localhost`-Referenzen — alle Links müssen im Web-Kontext funktionieren.
- **Responsive Design:** Tool läuft auf Vercel — Dashboard MUSS auf Smartphone-Browsern nutzbar sein.

## Verhaltensregeln für Claude Code

(Aus dem Root-`CLAUDE.md` referenziert; hier nur ergänzende architektonische Regeln.)

1. **Migrationen-First:** Bei neuen Feldern (z. B. `rentenfaktor`) zuerst das SQL-Skript für Supabase vorschlagen — niemals Schema-Änderungen über die UI.
2. **Mitdenken:** Wenn eine Änderung Auswirkungen auf die Steuerlast hat, proaktiv darauf hinweisen.
