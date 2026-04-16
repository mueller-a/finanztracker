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

## Berechtigungen & Rollen

Das Tool kennt zwei Rollen, die über die Spalte `role` in `public.user_module_settings` gesteuert werden:

| Rolle | Default | Berechtigungen |
|---|---|---|
| `user` | ja | Voller Zugriff auf alle eigenen Daten (RLS via `auth.uid() = user_id`). Sieht nur Module, die im Admin-Backend aktiviert sind. |
| `admin` | nein | Zusätzlich: Modul-Verwaltung (`/admin/modules`), Developer-Tab in den Einstellungen, BMF-Abgleich im Gehaltsrechner, Sichtbarkeit aller `user_module_settings`-Zeilen, sieht auch deaktivierte Module. |

### Admin-Rechte vergeben

Nach dem ersten Login eines Nutzers wird automatisch eine Zeile in `user_module_settings` mit `role = 'user'` angelegt. Um diesen Account zum Admin zu befördern, im **Supabase Dashboard → SQL Editor** ausführen:

```sql
UPDATE public.user_module_settings
   SET role = 'admin'
 WHERE user_id IN (
   SELECT id FROM auth.users WHERE email = 'dein@mail.de'
 );
```

Die Änderung wird beim nächsten App-Reload (oder Logout/Login) wirksam — `useModules().isAdmin` liest den Wert beim Auth-Wechsel neu ein.

Zum Zurückstufen analog mit `SET role = 'user'`. RLS-Policies lesen die Rolle bei jeder Anfrage frisch aus der DB, also greift die Änderung sofort serverseitig.

### Implementierung im Frontend

- `useModules().isAdmin` (aus [client/src/context/ModuleContext.js](client/src/context/ModuleContext.js)) — boolean Flag im Context.
- Sidebar-Items mit `adminOnly: true` werden für reguläre Nutzer ausgeblendet.
- Admin-Routen (z.B. `/admin/modules`) leiten Nicht-Admins per `<Navigate to="/" replace />` weiter.
- Einzelne UI-Sektionen (z.B. BMF-Abgleich im Gehaltsrechner) gaten via `{isAdmin && (...)}`.
- Server-seitig durchgesetzt durch RLS-Policies in den SQL-Migrations (`18_admin_role.sql`, `35_app_modules.sql`).

## Sicherheit

- **Niemals** den Supabase **Service Role Key** committen. Die `.env` mit dem Anon Key liegt außerhalb des Repos.
- RLS ist für alle User-Daten aktiv (`auth.uid() = user_id`), siehe `supabase/migrations/15_rls_all_tables.sql`.
- Admin-Rolle wird **ausschließlich** in der Datenbank gepflegt — kein Frontend-Code kann sie selbst setzen, da die `user_module_settings`-RLS-Policy `UPDATE` auf die `role`-Spalte verbietet (nur Service Role Key umgeht das).

## Lizenz

Privates Projekt — alle Rechte vorbehalten.
