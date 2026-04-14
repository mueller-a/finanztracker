# Finanztracker

Persönliche Finanz-Zentrale: Versicherungen, Stromabrechnungen, Guthaben/Sparziele, Verbindlichkeiten, Budget, Ruhestandsplanung (PKV/DRV/bAV/ETF) und Gehaltsrechner — alles an einem Ort.

Frontend: React (CRA) + Material UI + Recharts.
Backend: Supabase (Postgres, Auth, Storage, Row-Level Security).

## Features

- **Versicherungen**: Verträge, Beiträge, Kategorien, Snapshot-Historie
- **Strom**: Zählerstände, Tarife mit variablen Abschlägen, Abrechnungsperioden mit mehreren Arbeitspreisen, Splitted Consumption, außerordentliche Gebühren, Gutschriften, PDF-Upload der Rechnung
- **Guthaben & Sparziele**: mehrere Ziele, Entnahmen, Neustart-Logik
- **Verbindlichkeiten**: Annuitätskredite (Tilgungsplan + Sondertilgungen) und Rahmenkredite (Tilgung/Entnahme)
- **Budget**: Einnahmen/Ausgaben pro Monat, geteilt auf mehrere Personen
- **Ruhestandsplanung**: Private RV, AVD-Depot, ETF-Depot, bAV (mit Beitragsfrei-Stellung), DRV-Projektion mit Snapshot-Tracking
- **Rechner**: Gehaltsrechner (BMF-validiert), PKV-Rechner
- **Dashboard**: Financial Health Puls, Modul-Kacheln, Wealth-Progress-Chart, Next-Steps-Liste

## Projekt-Struktur

```
Finanztracker/
├─ client/          # React-App (UI, Hooks, Utils, MUI-Wrapper)
├─ server/          # Optionales Node-Backend (aktuell: Legacy)
├─ supabase/        # SQL-Migrations + Edge Functions
└─ SKILL.md         # Architektur- und Feature-Dokumentation
```

## Setup

### 1. Supabase-Projekt anlegen

1. Neues Projekt auf [supabase.com](https://supabase.com) erstellen
2. Dashboard → SQL Editor → Inhalt von **`supabase/setup.sql`** einfügen und ausführen.
   - Das File ist komplett idempotent (Tabellen, Indizes, Storage-Buckets, RLS-Policies, Trigger) und bringt ein leeres Projekt in einem Schritt auf den aktuellen Stand.
   - Die einzelnen Migrations unter `supabase/migrations/` sind chronologisch nummeriert (`00_schema.sql` … `34_billing_period_credits.sql`) und dokumentieren die Schema-Evolution — für Neueinrichtungen nicht nötig.
3. Optional: Edge Function deployen, falls Gehaltsrechner mit BMF-Validator gewünscht ist:
   ```
   supabase functions deploy bmf-lst-validator
   ```

### 2. Client konfigurieren

```bash
cd client
cp .env.example .env
# .env öffnen und REACT_APP_SUPABASE_URL + REACT_APP_SUPABASE_ANON_KEY eintragen
#   → Supabase Dashboard → Project Settings → API
npm install
```

### 3. Entwicklungsserver starten

```bash
# aus dem Repo-Root:
npm install
npm run client

# oder parallel mit Legacy-Server:
npm run dev
```

Die App läuft auf [http://localhost:3000](http://localhost:3000).

### 4. Production-Build

```bash
cd client && npm run build
```

Der Build-Output unter `client/build/` lässt sich z.B. auf Vercel oder Netlify deployen.

## Sicherheit

- **Niemals** den Supabase **Service Role Key** committen. Die `.env` mit dem Anon Key liegt außerhalb des Repos.
- RLS ist für alle User-Daten aktiv (`auth.uid() = user_id`), siehe `supabase/migration_rls_all_tables.sql`.

## Lizenz

Privates Projekt — alle Rechte vorbehalten.
