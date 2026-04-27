---
name: domain-strom
description: Stromverbrauchs-Tracking — Zählerstände, dynamische Abschläge, Tarif-Historie mit unterjährigen Preiswechseln, Belegmanagement, Außerordentliche Kosten und Gutschriften. Lies diese Skill für alle Tasks rund um Stromtarif, Verbrauchserfassung, Hochrechnung und Abrechnungsperioden.
---

# Strommodul

Erfasst Zählerstände, dynamische Abschläge und unterjährig veränderliche Tarife. Pflichten: Hochrechnung des Jahresverbrauchs, exakte Kostenermittlung trotz Preiswechseln, korrekte Trennung von Verbrauchskosten vs. außerordentlichen Posten.

## Dynamische Abschlagsverwaltung

Der monatliche Abschlag kann unterjährig variieren (Erhöhung durch Versorger). Statt einem statischen Feld wird der Abschlag als zeitbezogene Liste geführt.

### Datenmodell
- **Tabelle `tariff_installments`:** `id, tariff_id (FK), amount (€), valid_from (Date)`.

### Berechnung der gezahlten Abschläge
- Σ der Abschlagszahlungen für ein Jahr = Σ (Beträge × Monate ihrer Gültigkeit).
- Beispiel: Jan–Apr (4 × 100 €) + Mai–Dez (8 × 110 €) = 1.280 €.

### UI-Anforderungen
- Statt einfaches Feld "Monatlicher Abschlag" → dynamische Liste (`MUI Stack` oder `Table`).
- Jede Zeile: `[Gültig ab Monat/Jahr] | [Betrag €] | [Löschen-Icon]`.
- Button "Weiteren Abschlag hinzufügen".

## Zählerstände & Verbrauchshistorie

### Datenmodell
- **Tabelle `electricity_readings`:** `id, user_id, reading_date, reading_value (kWh), image_path`.

### Berechnungslogik
- **Verbrauch seit letzter Ablesung** (Delta).
- **Hochrechnung Jahresverbrauch** basierend auf dem Durchschnitt der letzten 3–6 Monate.
- Integration der Kostendaten (Grundpreis + Arbeitspreis pro kWh) aus den Benutzereinstellungen.

### Beleg-Dokumentation (Foto-Upload)
- **Prinzip:** Zu jedem Zählerstand kann optional ein Foto hochgeladen werden.
- **Speicherung:**
  - Storage Bucket: `meter-readings`.
  - Dateiname-Konvention: `user_id/reading_date_reading_value.jpg`.
  - In der DB nur der `image_path` (UUID).
- **UI:**
  - MUI-Komponenten für den Datei-Auswahldialog.
  - Thumbnail in der Historientabelle, das bei Klick vergrößert (`MUI Modal` / Lightbox).
- Frontend-seitige Bildkompression vor Upload (siehe [`architecture`](../architecture/SKILL.md)).

## Erweiterte Preis-Logik (Tarif-Historie)

Da Stromanbieter unterjährig den Arbeitspreis ändern können, wird die 1:1-Beziehung zwischen Abrechnungsperiode und Arbeitspreis in eine **1:N-Beziehung** umgewandelt.

### Datenmodell
- **Tabelle `billing_period_labor_prices`:** `id, billing_period_id (FK), price_per_kwh (€), valid_from (Date), consumption_kwh (kWh)`.
- **RLS:** `auth.uid() = user_id` via FK.

### UI (Dynamisches MUI-Formular)
- Statisches Feld "Arbeitspreis (€/kWh)" wird ersetzt durch eine dynamische Sektion.
- Jede Zeile: `[MUI DatePicker valid_from] | [MUI TextField price_per_kwh mit €-Adornment] | [Verbrauch in kWh] | [MUI IconButton Delete]`.
- Button "Weiteren Arbeitspreis hinzufügen".

### Mathematische Brücke (Gewichteter Durchschnitt)
Da sich der Verbrauch meist nicht taggenau Preiszeiträumen zuordnen lässt, nutze für Prognosen den **gewichteten Durchschnitts-Arbeitspreis**:

$$AP_{weighted} = \frac{\sum (p_i \times D_i)}{D_{total}}$$

- $p_i$: Arbeitspreis in Periode $i$
- $D_i$: Dauer der Preisperiode $i$ in Tagen
- $D_{total}$: Gesamtdauer der Abrechnungsperiode in Tagen

**Beispiel:** 200 Tage zu 0,35 €/kWh + 165 Tage zu 0,28 €/kWh → die App berechnet den durchschnittlichen Preis automatisch.

## Präzisions-Abrechnung (Splitted Input)

Innerhalb der Abrechnungsperiode wird die Eingabe des "Gesamtverbrauchs" durch eine aufgesplittete Liste ersetzt — pro Preisperiode wird der jeweilige Verbrauch erfasst.

- Jede Zeile: `[Gültig ab] | [Preis €/kWh] | [Verbrauch kWh]`.
- Σ der Teil-Verbräuche wird automatisch als "Gesamtverbrauch der Periode" angezeigt (schreibgeschützt).

### Exakte Kostenermittlung

$$Kosten_{Arbeit} = \sum (Preis_i \times Verbrauch_i)$$

**Prognose-Basis:** Für die Hochrechnung künftiger Jahre nutzt das System den realen Durchschnittspreis dieser Periode (`Kosten_Arbeit / Gesamtverbrauch`).

## Belegmanagement für Abrechnungen

- **Speicherung:** Rechnungen (PDF oder Bilder) im Supabase Storage Bucket `electricity-bills`.
- **Datenmodell:** Tabelle für Abrechnungsperioden hat das Feld `bill_file_path` (text, nullable).
- **UI-Anforderungen:**
  - **Upload:** Im Dialog für die Abrechnungsperiode ein `MUI Button` mit Upload-Funktion (PDF + Bilder).
  - **Vorschau:** Spalte "Beleg" in der Jahreshistorie-Tabelle.
  - **Aktion:** `MUI IconButton` (z. B. `PictureAsPdf` oder `Visibility`) öffnet die Datei in neuem Tab.
- **Dateibenennung:** `user_id/billing_period_start_end.pdf` (oder Originalname).

## Außerordentliche Kosten & Gebühren

Kosten, die nicht direkt mit Verbrauch oder Tarif zusammenhängen — z. B. Mahngebühren, Rücklastschriftgebühren, Zinsen.

### Datenmodell
- **Tabelle `billing_period_extra_costs`:** `id, billing_period_id (FK), description (text), amount (€)`.

### Berechnungs-Logik
- Werden zu den Gesamtkosten der Abrechnungsperiode addiert: `Gesamtkosten = Grundpreis + Arbeitspreis + Gebühren`.
- **Wichtig:** Diese Gebühren dürfen **NICHT** in die Berechnung des durchschnittlichen kWh-Preises einfließen — das würde die Verbrauchsstatistik verzerren.

### UI
- Sektion "Zusätzliche Gebühren / Korrekturen" im Abrechnungs-Dialog.
- Dynamische Liste: `[MUI TextField Bezeichnung] | [MUI TextField Betrag mit €-Adornment] | [Löschen-Icon]`.

## Gutschriften & Boni (Geld-Zurück)

Gutschriften, die den Rechnungsbetrag reduzieren — z. B. Neukundenbonus, Sofortbonus, Treuebonus.

### Datenmodell
- **Tabelle `billing_period_credits`:** `id, billing_period_id (FK), description (text), amount (€)`.

### Berechnungs-Logik
- Werden von den Gesamtkosten abgezogen:
  $$Gesamtkosten = (Grundpreis + Arbeitspreis + Zusatzgebühren) - Gutschriften$$
- **Wichtig (gleiche Regel wie bei Zusatzgebühren):** Gutschriften dürfen **NICHT** den durchschnittlichen kWh-Preis verzerren. Sie beeinflussen nur den finalen Saldo (Guthaben/Nachzahlung).

### UI
- Sektion "Gutschriften & Boni" im Abrechnungs-Dialog.
- Dynamische Liste: `[Beschreibung] | [Betrag €] | [Löschen]`.
- Optisch als "positiv" kennzeichnen (grünes Icon oder dezenter grüner Hintergrund).

## Existierende Utilities

- [client/src/utils/electricityCalc.js](../../../client/src/utils/electricityCalc.js) — Hochrechnung, gewichteter Durchschnitt, Saldo-Berechnung.
- [client/src/hooks/useElectricity.js](../../../client/src/hooks/useElectricity.js) — CRUD + Foto-Upload + Signed URLs.
- [client/src/pages/StromPage.js](../../../client/src/pages/StromPage.js) — UI mit allen oben genannten Sektionen.
