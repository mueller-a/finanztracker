name: Finance Tracker & Wealth Management Architect

## 🎯 Projekt-Kontext
Du entwickelst einen hochgradig personalisierten Finanz-Tracker für anspruchsvolle Nutzer (Fokus: PKV-versicherte Angestellte/Selbstständige in Deutschland). Die App kombiniert Cashflow-Management mit langfristiger Ruhestandsplanung.

## 🏗️ A. Modul-Architektur & Feature-Flagging

### 1. Registrierung neuer Module
* **Datenbank-Konsistenz:** Jedes neue Hauptmodul (z. B. `real_estate`) MUSS eine entsprechende Boolean-Spalte in der Tabelle `user_module_settings` erhalten (Name: `show_[modulname]`, Default: `true`).
* **Settings-Integration:** Füge für jedes neue Modul automatisch einen Toggle-Switch im `/settings` Bereich (Tab "Module") hinzu. Jede Karte im Einstellungsbereich muss den Namen des Moduls, ein passendes Icon und eine kurze Beschreibung enthalten.

### 2. Bedingtes Rendering (Conditional Rendering)
* **Sidebar:** Links zu Modulen dürfen nur gerendert werden, wenn das entsprechende Flag in `user_module_settings` auf `true` steht.
* **Dashboard:** Widgets oder KPI-Karten eines Moduls müssen ausgeblendet werden, wenn das Modul deaktiviert ist.
* **Berechtigungs-Check:** Implementiere eine zentrale Logik (via `ModuleContext`), die global prüft, ob ein Modul aktiv ist, um unnötige API-Abrufe für deaktivierte Features zu vermeiden.

### 3. Workflow bei Modul-Erstellung
1. Erstelle zuerst das SQL-Skript zur Erweiterung von `user_module_settings`.
2. Aktualisiere den `ModuleContext` / Provider, um das neue Flag zu laden.
3. Integriere den Toggle in die UI der Einstellungen.
4. Setze erst danach die fachliche Logik des Moduls um.

### 4. Frontend Image Processing
* **Kompression:** Bilder müssen vor dem Upload zwingend im Frontend komprimiert werden.
* **Spezifikationen:**
    - Format: JPEG (progressive).
    - Maximale Breite/Höhe: 1280px (reicht völlig für Zählerstände).
    - Qualität: 0.7 bis 0.8.
    - Zielgröße: < 500 KB.
* **Library-Empfehlung:** Nutze `browser-image-compression` oder eine native `Canvas`-Implementierung, um die Bundle-Größe gering zu halten.
* **UX:** Zeige während der Kompression und des Uploads einen Ladeindikator (z.B. `MUI CircularProgress` mit Prozentanzeige).

### 5. Dashboard-Architektur (The Command Center)

* **Hierarchie:** Summary (NW, Liquidity, Savings Rate) -> Module Status -> Visual Trends -> Quick Actions.
* **KPI-Logik pro Modul:**
    - **Strom:** Zeige "Delta" (Guthaben/Nachzahlung) statt nur den Jahresverbrauch.
    - **Verbindlichkeiten:** Zeige "Debt Free Date" (Wann bin ich bei 0 €?).
    - **Ruhestand:** Zeige "Netto-Rente nach heutiger Kaufkraft".
    - **Versicherungen:** Zeige "Optimierungspotenzial" oder "Nächster Kündigungstermin".
* **Design-Vorgabe:** - Nutze `MUI Stack` für die vertikale Trennung der Sektionen.
    - Nutze `MUI Divider` zwischen Header und Content.
    - Vermeide "Floating Bubbles"; alle KPI-Cards müssen in das 188px-Raster passen.

#### Dashboard-Logik (KPI Definitionen)

* **Netto-Vermögen:** Summe aller Assets (Konten, Depot, Immobilien, Versicherungswerte) minus Summe aller Verbindlichkeiten (Kredite, Rahmenkredite).
* **Liquidity Runway:** `Verfügbares Cash / Monatliche Fixkosten`.
* **Sparquote:** `(Einnahmen - Ausgaben) / Einnahmen * 100`.
* **Schuldenfrei-Datum:** Berechnet aus dem Tilgungsplan des Kredits mit der längsten Laufzeit.
* **Strom-Forecast:** Aktueller Zählerstand hochgerechnet auf das Jahr vs. Summe der gezahlten Abschläge.

## 🧠 B. Domain Knowledge (Essential)

### 🩺 Private Krankenversicherung (PKV)
* **Gesetzlicher Zuschlag (GZ):** Immer 10 % des Beitrags (pflichtig bis Alter 60).
* **Basisabsicherung:** Nur der Basisanteil ist steuerlich absetzbar. Dieser wird pro Tarif prozentual hinterlegt.
* **Beitragsrückerstattung (BRK):** Muss jährlich (kumuliert) gegen die Kosten gerechnet werden.
* **Prognose-Logik:** Jahre erben Werte vom Vorjahr (+ Steigerungssatz), außer es existiert ein `yearlyOverride` in der Datenbank.

## 📑 Versicherungs-Tracking (Real-Daten & Snapshots)

### 💼 Ruhestandsplanung & Renten
* **Rentenfaktor:** Berechnung der monatlichen Rente: `(Kapital / 10.000) * Rentenfaktor`.
* **Kapitalwahlrecht:** Nutzer können zwischen lebenslanger Rente und Einmalzahlung wählen (außer bei der DRV).
* **bAV (Alte Leipziger):** Betriebliche Altersvorsorge wird nachgelagert besteuert (persönlicher Steuersatz im Alter). 
* **PKV-Vorteil:** Da der Nutzer PKV-versichert ist (`is_pkv === true`), fallen auf Rentenzahlungen (bAV/DRV) keine zusätzlichen GKV/PV-Beiträge an.

### 1. Hybrid-Modell-Prinzip
* **Definition:** Eine Police besteht aus statischen Stammdaten (Garantiewerte) und einer Historie von jährlichen Snapshots (Realdaten aus dem Versicherungsschreiben).
* **Prognose-Anker:** Zukünftige Berechnungen dürfen NICHT beim Vertragsstart ansetzen. Sie müssen immer den **Zeitstempel und den Vertragswert des aktuellsten Snapshots** als Startpunkt (Basiswert) nutzen.

### 2. Snapshot-Datenstruktur (Nürnberger-Standard)
Jeder Snapshot muss folgende Felder erfassen können:
* `snapshot_date`: Datum der Information (z.B. Stand 31.12.2025).
* `contract_value`: Aktueller Rückkaufswert/Vertragswert.
* `fund_balance`: Aktuelles Fondsguthaben (Summe aller Anteile).
* `valuation_reserves`: Bewertungsreserven.
* `total_contributions_paid`: Summe der bisher eingezahlten Beiträge.
* `total_costs_paid`: Summe der bisher entnommenen Kosten (Vertrieb, Verwaltung).
* `fund_details`: Array von Objekten (ISIN, Anteilspreis, Bestand, Name).

### 3. Mathematische Brücke
Die Prognose-Formel ab dem letzten Snapshot:
$$Kapital_{Ende} = Kapital_{Snapshot} \times (1 + r)^t + \sum (Beitrag \times (1 + r)^n)$$
Dabei ist $r$ die prognostizierte Rendite und $t$ die Restlaufzeit ab dem Snapshot-Datum.

### ⚖️ Steuerrecht (Deutschland)
* **ETF-Besteuerung:** 25 % Abgeltungssteuer + 5,5 % Soli (effektiv 26,375 %). Beachte die **Teilfreistellung von 30 %** für Aktien-ETFs.
* **Einkommensteuer:** Nutze für den Gehaltsrechner aktuelle deutsche Steuertabellen inkl. Vorsorgepauschale.

## ---

## 👴 Gesetzliche Rentenversicherung (GRV - Schicht 1)

### 1. Hybrid-Modell & Snapshots
* **Logik:** Nutze die jährliche "Renteninformation" der DRV als Snapshot-Quelle.
* **Datenfelder:** `snapshot_date`, `current_entitlements` (bisher erreichte Rente), `projected_pension_67` (Hochrechnung bei aktuellem Gehalt), `total_points` (Entgeltpunkte).

### 2. Steuerliche Behandlung (Kohortenprinzip)
* **Regel:** Nachgelagerte Besteuerung nach § 22 EStG.
* **Steueranteil 2026:** Für Neurentner im Jahr 2026 sind voraussichtlich **86 %** der Rente steuerpflichtig (steigt jährlich um 1 %).
* **Formel:** `Netto_Rente = Brutto_Rente - ((Brutto_Rente * 0.86) * persönlicher_Steuersatz)`.

### 3. Sozialversicherung im Ruhestand
* **KVdR/PV:** Als pflichtversicherter Rentner fallen ca. **10 - 12 %** für KV und PV an. Der Staat übernimmt bei der GRV einen Teil des KV-Beitrags (ca. 7,3 %), den PV-Beitrag trägt der Rentner allein.

---

## 🛠️ Refactoring-Vorgabe: Fokus auf Status Quo
* **Entfernung Wunschrente:** Alle UI-Elemente, Datenbankfelder und Logiken bezüglich "Wunschrente", "Rentenlücke" oder "Zielbetrag" sind zu entfernen.
* **Fokus:** Das System visualisiert ausschließlich den **Status Quo** (Snapshots) und die **Netto-Prognose** (was real ausgezahlt wird).


## ---

## 🏢 Betriebliche Altersvorsorge (bAV - Schicht 2)

### 1. Hybrid-Modell & Snapshots
* **Logik:** Analog zur privaten Rente. Nutze eine Tabelle `bav_snapshots` für Realdaten (Vertragswert, eingezahlte Beiträge, projizierte Rente).
* **Datenfelder:** `snapshot_date`, `current_capital`, `guaranteed_pension`, `projected_pension`, `employer_contribution`, `employee_contribution`.

### 2. Steuerliche Behandlung (Nachgelagerte Besteuerung)
* **Grundregel:** Leistungen aus der bAV (Direktversicherung, Pensionskasse, etc.) sind zu **100 % steuerpflichtig** (§ 22 Nr. 5 EStG).
* **Szenario A (Kapitalauszahlung):**
    - Der gesamte Auszahlungsbetrag wird als Einkommen versteuert.
    - **Fünftelregelung:** Prüfe die Anwendung der Fünftelregelung (§ 34 EStG) zur Abmilderung der Progression bei Einmalauszahlung.
* **Szenario B (Monatliche Rente):**
    - Die monatliche Rente wird zu 100 % mit dem persönlichen Einkommensteuersatz versteuert.

### 3. Sozialversicherung im Ruhestand (GKV/PV)
* **Pflichtversicherte Rentner (KVdR):** - Auf bAV-Leistungen fallen Krankenkassen- (KV) und Pflegeversicherungsbeiträge (PV) an.
    - **Freibetrag KV:** Nutze den gesetzlichen Freibetrag (2026: ca. 180 € - 190 € monatlich). Nur der Betrag darüber ist KV-pflichtig.
    - **Freigrenze PV:** Wenn die bAV-Leistung die Grenze überschreitet, ist der gesamte Betrag PV-pflichtig (kein Freibetrag).
* **Privatversicherte (PKV):** Keine zusätzlichen Sozialabgaben auf die bAV-Rente.

### 4. Beitragsfrei-Stellung (Passiv-Modus)
* **Logik:** Ein Vertrag muss als "passiv" markiert werden können. Dies stoppt alle zukünftigen Einzahlungen (Arbeitgeber- und Arbeitnehmeranteile) in der Projektionsrechnung.
* **Datenmodell:** Feld `is_passive` (boolean, default: false) in der Tabelle `bav_contracts` oder im aktuellsten Snapshot.
* **Berechnung (Projektion):**
    - Wenn `is_passive = true`: Setze monatliche Beiträge für alle zukünftigen Monate auf 0 €.
    - Das vorhandene Kapital verzinst sich jedoch weiterhin bis zum Rentenbeginn (Zinseszinseffekt auf den Bestand).
* **UI-Anforderung (MUI):**
    - Füge in der bAV-Detailansicht einen prominenten `MUI Switch` oder ein `MUI Chip` (Toggle) ein: "Vertrag aktiv" vs. "Vertrag passiv / beitragsfrei".
    - Wenn der Status auf "passiv" gesetzt wird, sollen die Eingabefelder für monatliche Beiträge (`employer_contribution`, `employee_contribution`) ausgegraut oder auf 0 gesetzt werden.

## ---

## ⚖️ Steuer-Logik: Private Rentenversicherung (Schicht 3 - DE)

### ❌ WICHTIG: Keine Abgeltungsteuer
* Für private Rentenversicherungen wird KEINE Kapitalertragsteuer (25 %) berechnet. Nutze stattdessen ausschließlich die folgenden zwei Verfahren:

### 🅰️ Szenario A: Kapitalabfindung (Halbeinkünfteverfahren)
* **Rechtsgrundlage:** § 20 Abs. 1 Nr. 6 EStG.
* **Voraussetzung:** Vertragslaufzeit >= 12 Jahre UND Auszahlung nach vollendetem 62. Lebensjahr.
* **Berechnung:** 1. Gewinn = `Auszahlungsbetrag - Summe der eingezahlten Beiträge`.
    2. Steuerpflichtiger Ertrag = `Gewinn * 0,5` (50 % sind steuerfrei).
    3. `Individuelle Steuer = Steuerpflichtiger Ertrag * persönlicher_Steuersatz`.

### 🅱️ Szenario B: Verrentung (Ertragsanteilbesteuerung)
* **Rechtsgrundlage:** § 22 EStG.
* **Logik:** Nur ein Bruchteil der monatlichen Rente (der Ertragsanteil) wird versteuert.
* **Ertragsanteil-Tabelle (Alter bei Rentenbeginn):**
    - 62 J: 21% | 63 J: 20% | 64 J: 19% | 65 J: 18% | 66 J: 18% | 67 J: 17% | 70 J: 15%.
* **Berechnung:**
    1. Steuerpflichtiger Anteil = `Monatsrente * Ertragsanteil`.
    2. `Monatliche Steuerlast = Steuerpflichtiger Anteil * persönlicher_Steuersatz`.

### 🛠️ UI & UX Vorgaben
* **Steuer-Switch:** Implementiere in der Detailansicht der Police einen Toggle zwischen "Kapitalauszahlung" und "Monatliche Rente".
* **Netto-Fokus:** Zeige immer den Brutto-Wert UND den berechneten Netto-Wert (nach Steuern) an.

### Zusatzinfo für 2026 (Krankenversicherung):
* Bei Privatversicherten (PKV) fallen auf die Rente keine zusätzlichen GKV-Beiträge an.
* Bei gesetzlich Versicherten (GKV) in der "Krankenversicherung der Rentner" (KVdR) ist die private Rente aus Schicht 3 in der Regel beitragsfrei.

## ---
## 💶 Gehaltsrechner & Lohnsteuer-Logik (Deutschland 2026)

### ⚖️ Lohnsteuer-Rechenlogik (Präzisions-Regeln)

Um den Fehler des "doppelten Grundfreibetrags" zu vermeiden, muss Claude die Berechnung strikt nach diesem Schema durchführen:

1. **Ermittlung des zvE (zu versteuerndes Einkommen):**
   `zvE = Jahresbrutto - Arbeitnehmerpauschbetrag (1.230 €) - Sonderausgabenpauschale (36 €) - Vorsorgepauschale`.
   *Wichtig:* Der Grundfreibetrag wird NICHT vom zvE abgezogen, da er bereits mathematisch in den Formeln der Tarifzonen integriert ist!
   *Wichtig:* Ziehe den Grundfreibetrag (12.348 €) NICHT manuell ab. Er ist in den Tarifformeln enthalten.

2. **Anwendung der Tarif-Formeln 2026 (vereinfacht für Code):**
   * **Zone 1 (bis 12.348 €):** Steuer = 0
   * **Zone 2 (12.349 € bis 17.799 €):** Nutze den Eingangssteuersatz (14 %).
   * **Zone 3 (17.800 € bis 69.878 €):** Lineare Progression bis 42 %.
   * **Zone 4 (69.879 € bis 277.825 €):**
       `Steuer = (zvE - 69.878) * 0,42 + 18.230 €` (Die 18.230 € ist die kumulierte Steuer der Zonen 1-3).
   * **Zone 5 (ab 277.826 €):**
       `Steuer = (zvE - 277.825) * 0,45 + 105.567 €`.

3. **Validierungs-Regel:**
   Bei einem Brutto von 7.352,93 € (ca. 88.235 € p.a.) muss das zvE bei ca. 71.800 € liegen. Da dies > 69.878 € ist, greift die **Zone 4 (42 %)**. Eine monatliche Lohnsteuer unter 1.500 € ist bei diesem Gehalt (Stkl. 1) mathematisch unmöglich.

### 🔄 Lohnsteuer-Rechenschritt (Intern)
* **Vorsorgepauschale:** Nutze die Günstigerprüfung (Ist-Beiträge vs. 1.900 € Mindestbetrag).
* **Solidaritätszuschlag (Soli) 2026:**
    * **Freigrenze:** Der Soli wird erst erhoben, wenn die jährliche Lohnsteuer **20.350 €** übersteigt.
* **Kirchensteuer:** Nur berechnen, wenn `kirchensteuer_pflichtig === true`. Bemessungsgrundlage ist die Lohnsteuer (8 % oder 9 % je nach Bundesland).
* **Kinderfreibetrag:** 3.414 € pro Elternteil (6.828 € gesamt) - wichtig für die Prüfung, ob Kindergeld oder Freibetrag günstiger ist.

### 📊 Sozialversicherung & Grenzwerte (Stand 2026)
* **Beitragssätze:**
    - Rentenversicherung (RV): 18,6 % (AN-Anteil: 9,3 %)
    - Arbeitslosenversicherung (AV): 2,6 % (AN-Anteil: 1,3 %)
    - Krankenversicherung (GKV): 14,6 % + Zusatzbeitrag (AN trägt jeweils die Hälfte)
    - Pflegeversicherung (PV): 3,4 % Basissatz. Zuschlag für Kinderlose (0,6 %) entfällt ab dem 1. Kind. Abschläge ab dem 2. Kind (0,25 % pro Kind).
### 📊 Sozialversicherung & Grenzwerte 2026 (Aktualisiert)
* **Beitragsbemessungsgrenzen (BBG) - Monatswerte:**
    - BBG KV/PV: **5.812,50 €**
    - BBG RV/AV (West): **8.450,00 €**
    - BBG RV/AV (Ost): **8.350,00 €**


### ⚖️ Lohnsteuer-Berechnung (§ 39b EStG)
Die Lohnsteuer basiert auf dem zu versteuernden Einkommen. Der wichtigste Abzugsposten ist die **Vorsorgepauschale**, bestehend aus:

### 🏛️ Offizielle BMF-Validierung (LSt2026ext)
* **API-Endpunkt:** `https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml`
* **Pflicht-Parameter:**
    - `code=LSt2026ext`: Aktiviert die externe Schnittstelle für 2026.
    - `LZZ=1`: Berechnungszeitraum Monat (2 für Jahr, 3 für Quartal).
    - `RE4`: Laufender Arbeitslohn in **Cents** (Brutto * 100).
    - `STKL`: Steuerklasse (1-6).
    - `f`: Faktor (nur bei Steuerklasse 4 mit Faktor).
    - `PKV`: 1 für privat versichert, 0 für gesetzlich.
    - `PKPV`: PKV-Basisbeitrag pro Monat in **Cents**.
    - `AGVZ`: Steuerfreier Arbeitgeberzuschuss in **Cents**.
* **Verarbeitung:** Extrahiere den Wert aus dem XML-Tag `<lstlzz>` für die monatliche Lohnsteuer.
* **Architektur:** Implementiere einen Proxy (z.B. Supabase Edge Function), um CORS-Probleme beim direkten Browser-Aufruf der BMF-Seite zu umgehen.

1. **Teilbetrag Altersvorsorge:**
   - 9,3 % des Bruttolohns (gedeckelt an BBG RV). In 2026 zu 100 % absetzbar.
2. **Teilbetrag KV/PV (Günstigerprüfung):**
   - **GKV-Fall:** `(AN-Beitrag_KV * 0,96) + AN-Beitrag_PV`.
   - **PKV-Fall:** `(PKV_Basisanteil - steuerfreier_AG_Zuschuss)`.
   - **Mindestschutz:** Dieser Teilbetrag (KV/PV) darf die **Mindestvorsorgepauschale** nicht unterschreiten:
     - 12 % des Bruttolohns, max. 1.900 € p.a. (Stkl. I, II, IV) bzw. 3.000 € p.a. (Stkl. III).
3. **Weitere Abzüge:**
   - Arbeitnehmer-Pauschbetrag (Werbungskosten): 1.230 € p.a.
   - Sonderausgaben-Pauschbetrag: 36 € p.a.

### 🔗 PKV-Integration (Spezifische Regeln)
* **AG-Höchstzuschuss PKV (Monat):**
    - KV: **508,59 €** (Basis: 14,6% + 2,9% Ø-Zusatzbeitrag)
    - PV: **104,63 €** (Basis: 3,6% PV-Satz)
    - Gesamt-Cap: **613,22 €**
* **AG-Zuschuss:** Der Arbeitgeber zahlt 50 % des PKV-Beitrags, maximal jedoch den GKV-Höchstzuschuss. Dieser Zuschuss ist steuerfrei (§ 3 Nr. 62 EStG).
* **Netto-Berechnung:**
  `Auszahlung = Brutto - Lohnsteuer - Soli - RV(AN) - AV(AN) - (PKV_Gesamt - AG_Zuschuss)`.



## 🛠 Tech Stack & Architecture

### 🔐 Security & Multi-User
* **Provider:** Google OAuth via Supabase Auth.
* **Data Isolation:** Jede Tabelle hat eine `user_id`. **Row Level Security (RLS)** ist zwingend. Jede Query muss auf `auth.uid() = user_id` prüfen.
* **Roles:** Es gibt die Rollen `user` und `admin`. Admins haben Zugriff auf den `/settings` -> "Developer" Tab.

### 💾 Daten-Management
* **Persistenz:** Nutze Supabase (PostgreSQL).
* **Single Source of Truth:** Das Geburtsdatum (`birthday`) wird zentral in `user_module_settings` verwaltet und global via Context verteilt.
* **Auto-Save:** Eingabefelder nutzen eine **Debounce-Logik** (800ms), um API-Calls zu minimieren.

### 📐 UI/UX Standards
* **Grid-System:** KPI-Karten nutzen `grid-template-columns: repeat(auto-fit, minmax(188px, 1fr))`.
* **Design:** Konsequenter Dark-Mode (Deep Purple / Rich Black Palette).
* **Navigation:** Sidebar mit 2nd-Level Navigation (z.B. Versicherungen -> Übersicht / PKV-Rechner).
* **Admin-UI:** "Developer"-Tab enthält den Theme-Showcase und die Nutzer-Übersicht.
* **Interaktion:** Icons sollten aus `@mui/icons-material` stammen. Nutze `MUI Tooltip` für Erklärungen zu komplexen Versicherungswerten (z.B. Bewertungsreserven).

## 🎨 UI & Design System (Material UI)
* **Framework-Vorgabe:** Verwende für alle UI-Komponenten konsequent **Material UI (MUI)**. 
* **Theming:** Nutze das MUI `ThemeProvider` System. Alle Farben, Spacing und Typografie müssen zentral über das Theme gesteuert werden, um Konsistenz zwischen Dark- und Light-Mode zu garantieren.
* **Komponenten-Wahl:** - Nutze `MUI DataGrid` oder `Table` für die Snapshot-Historie.
    - Nutze `MUI Card` für die Versicherungs-Übersichten.
    - Nutze `MUI TextField` mit `InputAdornment` für Währungs-Eingaben (€).
    - Nutze `MUI DatePicker` für die Snapshot-Daten.
* **Layout:** Verwende ausschließlich `Grid2` (oder die aktuelle MUI Layout-Engine) und `Stack` für die Ausrichtung der Komponenten innerhalb des 188px-Grid-Systems.

## 🚀 Verhaltensregeln für Claude Code
1. **Keine Redundanz:** Prüfe immer, ob eine Logik (z.B. Altersberechnung) bereits in einer Utility-Funktion existiert.
2. **Migrationen:** Wenn neue Felder (z.B. `rentenfaktor`) benötigt werden, schlage erst das SQL-Script für Supabase vor.
3. **Validierung:** Finanzielle Eingabewerte sind immer als `Decimal` zu validieren.
4. **Mitdenken:** Wenn eine Änderung Auswirkungen auf die Steuerlast hat, weise proaktiv darauf hin.

## 🏠 Immobilien-Management (Real Estate)
1. **Finanzierungs-Architektur & Darlehenslogik**
* **Annuitätendarlehen:** Berechne die monatliche Rate aus Zins und Tilgung. Beachte, dass sich der Zinsanteil monatlich verringert, während der Tilgungsanteil steigt ($$Rate = Restschuld \cdot \frac{Zins + Tilgung}{12}$$).
* **LTV (Loan-to-Value):** Berechne den Beleihungsauslauf als Indikator für das Risiko und zukünftige Zinskonditionen ($$LTV = \frac{Restschuld}{Marktwert} \cdot 100$$).
* **Sondertilgungs-Effekt:** Implementiere eine Logik, die zeigt, wie eine einmalige Sondertilgung die Gesamtlaufzeit und die Zinskosten über die gesamte Zinsbindung hinweg reduziert.
* **Zinsbindungs-Ende:** Markiere das Ende der Zinsbindung als kritisches Event für Anschlussfinanzierungen und simuliere ein "Zinsänderungsrisiko" (z. B. +2 % auf den aktuellen Satz).
2. **Fiskalische Logik & Investment-Metriken**
* **AfA (Absetzung für Abnutzung):** Unterscheide zwischen Linearer AfA (2 % für Altbau, 3 % für Neubau ab 2023) und der Degressiven AfA für Wohngebäude (5 % ab 2024/2025 für 6 Jahre bei   Neubau).Wende die AfA nur auf den Gebäudeanteil an (Grundstücksanteil muss vom Kaufpreis abgezogen werden).
* **Die 15 %-Grenze:** Überwache Instandhaltungskosten in den ersten 3 Jahren nach Kauf. Übersteigen diese 15 % des Gebäude-Anschaffungspreises, werden sie zu Anschaffungskosten (AfA-Pflicht) statt sofort abziehbaren Werbungskosten.
* **Steuervorteil (Rendite-Boost):** Berechne die Steuerersparnis durch die Verrechnung von negativen Einkünften (Zinsen + AfA + Verwaltung > Miete) mit dem persönlichen Steuersatz aus dem Settings-Modul.
* **10-Jahres-Haltefrist:** Berechne den steuerfreien Veräußerungsgewinn nach § 23 EStG erst nach Ablauf von 10 Jahren (bei Vermietung).

# Stromübersicht & Strommodul

## ⚡ Stromübersicht (Electricity Overview)

### 💸 Dynamische Abschlagsverwaltung
* **Logik:** Da sich der monatliche Abschlag unterjährig ändern kann (z. B. Erhöhung durch den Versorger), wird der Abschlag als zeitbezogene Liste geführt.
* **Datenmodell:** Tabelle `tariff_installments`: `id, tariff_id (FK), amount (€), valid_from (Date)`.
* **Berechnung (Gezahlte Abschläge):** - Die Summe der geleisteten Abschlagszahlungen für ein Jahr berechnet sich aus den jeweiligen Beträgen multipliziert mit den Monaten ihrer Gültigkeit.
    - Beispiel: Jan-Apr (4 Monate * 100 €) + Mai-Dez (8 Monate * 110 €) = 1.280 €.
* **UI-Anforderungen (MUI):**
    - Ersetze das einfache Feld "Monatlicher Abschlag" durch eine dynamische Liste (MUI `Stack` oder `Table`).
    - Jede Zeile: [Gültig ab Monat/Jahr] | [Betrag in €] | [Löschen-Icon].
    - Ein MUI Button "Weiteren Abschlag hinzufügen".

### 1. Datenmodell & Historie
* **Tabelle `electricity_readings`:** Erfasse `id, user_id, reading_date, reading_value (kWh), image_path`.
* **Berechnungslogik:** - Berechne den **Verbrauch seit der letzten Ablesung** (Delta).
    - Hochrechnung des **Jahresverbrauchs** basierend auf dem Durchschnitt der letzten 3-6 Monate.
    - Integration der Kostendaten (Grundpreis + Arbeitspreis pro kWh) aus den Benutzereinstellungen.

### 2. Beleg-Dokumentation (Foto-Upload)
* **Prinzip:** Zu jedem Zählerstand kann optional ein Foto hochgeladen werden.
* **Speicherung:** - Dateien werden im Supabase Storage Bucket `meter-readings` gespeichert.
    - Dateiname-Konvention: `user_id/reading_date_reading_value.jpg`.
    - In der Datenbank wird nur der `image_path` (bzw. die UUID) gespeichert.
* **UI-Anforderung:** - Nutze Material UI Komponenten für den Dateiauswahldialog.
    - Zeige in der Historientabelle ein kleines Thumbnail an, das sich bei Klick vergrößert (MUI Modal/Lightbox).

## ⚡ Strommodul (Erweiterte Preis-Logik)

### 1. Datenmodell & Historie
* **Tabelle `billing_period_labor_prices`:** Da ein Stromanbieter unterjährig den Arbeitspreis ändern kann, wird die 1:1 Beziehung zwischen Abrechnungsperiode und Arbeitspreis in eine 1:N Beziehung umgewandelt.
* **Tabelle:** Erstelle `billing_period_labor_prices`: `id, billing_period_id (FK), price_per_kwh (€), valid_from (Date)`.
* **RLS:** auth.uid() = user_id (via FK).

### 2. UI-Anforderung (Dynamisches MUI Formular)
* **Interaktion:** Das statische Feld "Arbeitspreis (€/kWh)" wird ersetzt durch eine dynamische Sektion.
* **Komponenten:** Nutze Material UI `Grid2` oder `Stack` für eine dynamische Liste von Eingabezeilen:
    - [MUI DatePicker 'valid_from'] | [MUI TextField 'price_per_kwh' mit €-Adornment] | [MUI IconButton 'Delete'].
* **Button:** Ein MUI 'Add' Button "Weiteren Arbeitspreis hinzufügen".

### 3. Mathematische Brücke (Gewichteter Durchschnitt)
* **Logik:** Da sich der Verbrauch meist nicht taggenau den Preiszeiträumen zuordnen lässt, nutze für Prognosen den gewichteten Durchschnitts-Arbeitspreis ($AP_{weighted}$) für das gesamte Jahr.
* **Formel:**
  $$AP_{weighted} = \frac{\sum (p_i \times D_i)}{D_{total}}$$
    - $p_i$: Arbeitspreis in Periode $i$
    - $D_i$: Dauer der Preisperiode $i$ in Tagen
    - $D_{total}$: Gesamtdauer der Abrechnungsperiode in Tagen
* **Beispiel (Rechnung):** Wenn 200 Tage mit 0,35 €/kWh und 165 Tage mit 0,28 €/kWh abgerechnet werden, berechnet die App den durchschnittlichen Preis.

## ⚡ Strommodul (Präzisions-Abrechnung)

### 1. Datenmodell & Historie
* **Tabelle `billing_period_labor_prices`:** - Erweitere die Tabelle um das Feld `consumption_kwh` (decimal, nullable).
  - Struktur: `id, billing_period_id (FK), price_per_kwh (€), valid_from (Date), consumption_kwh (kWh)`.

### 2. UI-Anforderung (Splitted Input)
* **Interaktion:** Innerhalb der Abrechnungsperiode wird die Eingabe des "Gesamtverbrauchs" durch eine aufgesplittete Liste ersetzt.
* **Komponenten (MUI):**
    - Jede Zeile enthält: [Gültig ab] | [Preis €/kWh] | [Verbrauch in kWh].
    - Die Summe der Teil-Verbräuche wird automatisch als "Gesamtverbrauch der Periode" berechnet und schreibgeschützt angezeigt.

### 3. Mathematische Logik (Exakte Kostenermittlung)
* **Ist-Kosten:** Die Gesamtkosten der Arbeitspreise ergeben sich aus der Summe der Teilprodukte:
  $$Kosten_{Arbeit} = \sum (Preis_i \times Verbrauch_i)$$
* **Prognose-Basis:** Für die Hochrechnung künftiger Jahre nutzt das System den realen Durchschnittspreis dieser Periode ($Kosten_{Arbeit} / Gesamtverbrauch$).

### 4. Belegmanagement für Abrechnungen
* **Speicherung:** Rechnungen (PDF oder Bilder) werden im Supabase Storage Bucket `electricity-bills` gespeichert.
* **Datenmodell:** Die Tabelle für Abrechnungsperioden erhält das Feld `bill_file_path` (text, nullable).
* **UI-Anforderungen (MUI):**
    - **Upload:** Integriere im Dialog für die Abrechnungsperiode ein `MUI Button` mit Upload-Funktion (akzeptiert PDF und Bilder).
    - **Vorschau:** In der Jahreshistorie-Tabelle wird eine Spalte "Beleg" hinzugefügt.
    - **Aktion:** Nutze ein `MUI IconButton` (z.B. `PictureAsPdf` oder `Visibility`), um die hinterlegte Datei in einem neuen Tab zu öffnen oder direkt im Browser anzuzeigen.
* **Dateibenennung:** `user_id/billing_period_start_end.pdf` (oder originaler Dateiname zur besseren Zuordnung).

### 5. Außerordentliche Kosten & Gebühren
* **Definition:** Erfassung von Kosten, die nicht direkt mit dem Verbrauch oder dem Tarif zusammenhängen (z. B. Mahngebühren, Rücklastschriftgebühren, Zinsen).
* **Datenmodell:** Tabelle `billing_period_extra_costs`: `id, billing_period_id (FK), description (text), amount (€)`.
* **Berechnungs-Logik:**
    - Diese Kosten werden zu den Gesamtkosten der Abrechnungsperiode addiert ($Gesamtkosten = Grundpreis + Arbeitspreis + Gebühren$).
    - **Wichtig:** Diese Gebühren dürfen NICHT in die Berechnung des durchschnittlichen kWh-Preises einfließen, um die Verbrauchsstatistik nicht zu verzerren.
* **UI-Anforderungen (MUI):**
    - Integriere im Abrechnungs-Dialog eine Sektion "Zusätzliche Gebühren / Korrekturen".
    - Nutze eine dynamische Liste: [MUI TextField 'Bezeichnung'] | [MUI TextField 'Betrag' mit €-Adornment] | [Löschen-Icon].

### 💰 Gutschriften & Boni (Geld-Zurück)
* **Definition:** Erfassung von Gutschriften, die den Rechnungsbetrag reduzieren (z. B. Neukundenbonus, Sofortbonus, Treuebonus).
* **Datenmodell:** Tabelle `billing_period_credits`: `id, billing_period_id (FK), description (text), amount (€)`.
* **Berechnungs-Logik:**
    - Diese Beträge werden von den Gesamtkosten der Periode abgezogen.
    - **Formel:** $$Gesamtkosten = (Grundpreis + Arbeitspreis + Zusatzgebühren) - Gutschriften$$
    - **Statistik:** Genau wie bei den Zusatzgebühren dürfen Gutschriften NICHT den durchschnittlichen kWh-Preis verzerren. Sie beeinflussen lediglich den finalen Saldo (Guthaben/Nachzahlung).
* **UI-Anforderungen (MUI):**
    - Integriere im Abrechnungs-Dialog eine Sektion "Gutschriften & Boni".
    - Nutze eine dynamische Liste: [Beschreibung] | [Betrag €] | [Löschen].
    - Kennzeichne diese Sektion optisch als "positiv" (z. B. grünes Icon oder dezenter grüner Hintergrund).

## 💳 Verbindlichkeits-Modul (Fixe Kredite)

### 1. Amortisations-Logik: First-Row-Override
* **Szenario:** Anpassung der Zinsen in der ersten Rate (Rumpfperiode/Anschlusszinsen).
* **Datenmodell:** Speichere einen optionalen Wert `initial_interest_override` (Decimal) in der Tabelle `loans`.
* **Berechnungs-Logik:**
    - Wenn `initial_interest_override` existiert, ersetze die berechneten Zinsen der 1. Rate durch diesen Wert.
    - Die Tilgung der 1. Rate berechnet sich dann als: `Rate - initial_interest_override`.
    - Alle folgenden Zeilen (ab Rate 2) berechnen sich automatisch auf Basis des verbleibenden Restdarlehens nach der korrigierten 1. Rate.

### 2. UI-Anforderungen (Material UI)
* **Interaktion:** In der Tilgungsplan-Tabelle erhält die Zins-Zelle der ersten Zeile ein `MUI Edit`-Icon.
* **Inline-Editing:** Beim Klick öffnet sich ein kleiner Inline-Editor oder ein Popover, um den Betrag anzupassen.
* **Visualisierung:** Eine manuell geänderte erste Zeile wird dezent markiert (z.B. kursive Schrift oder ein "Manuell angepasst" Tooltip), um den Nutzer an die Korrektur zu erinnern.

## 💳 Rahmenkredit / Abrufkredit

### 1. Transaktions-Logik (Bidirektional)
* **Konzept:** Im Gegensatz zum Annuitätendarlehen erlaubt der Rahmenkredit sowohl Tilgungen als auch Entnahmen.
* **Transaktionstypen:**
    - **Tilgung (-):** Verringert den Saldo der Verbindlichkeit.
    - **Entnahme (+):** Erhöht den Saldo der Verbindlichkeit (Belastung des Kreditkontos).
* **Datenmodell:** Die Tabelle `loan_transactions` benötigt ein Feld `type` (Enum: 'repayment', 'withdrawal').

### 2. UI & UX (MUI)
* **Eingabe-Dialog:** Beim Erfassen einer Buchung muss zwischen "Tilgung" und "Entnahme" gewählt werden können.
* **Komponente:** Nutze eine `MUI ToggleButtonGroup` für die Wahl des Typs (Farben: Grün für Tilgung, Rot/Orange für Entnahme).
* **Validierung:** Eine Entnahme darf den hinterlegten "Gesamtrahmen" (Credit Limit) des Kredits nicht überschreiten.

### 3. Visualisierung
* **Chart:** Die Schuldenkurve muss bei Entnahmen entsprechend nach oben steigen.
* **Historie:** Kennzeichne Entnahmen in der Transaktionsliste deutlich (z. B. durch ein "+" Präfix oder ein entsprechendes Icon).

## 🏥 PKV-Modul (Tarif-Konfiguration)

### 🎨 UI & Layout-Regeln (MUI)
* **Kopfzeile:** Tarifname und Tarifbeitrag (€) stehen nebeneinander in einer Zeile.
* **Optionen (Einzelspalten-Layout):** Jede Option steht in einer eigenen Zeile. Links das Label, rechts ein `MUI Switch` (Toggle).
* **Optionen-Liste:**
    - **GZ-pflichtig:** (Default: Nein). Steuert, ob der gesetzliche Zuschlag (10%) berechnet wird.
    - **Basisabsicherung:** (Default: Nein). Steuert die steuerliche Absetzbarkeit.
* **Bedingte Felder:**
    - Wenn `Basisabsicherung` aktiv: Zeige Eingabefeld `steuerl. Absetzbar` mit `%`-Adornment.
* **Alters-Regel:**
    - Feld `Tarif entfällt ab`: Eingabe eines Alters (Jahre). Zeige dieses Feld in einer eigenen Zeile mit dem Label "Tarif entfällt ab".
* **Refactoring:** Die Option "Fixbetrag" ist vollständig zu entfernen.

### ⚙️ Logik-Parameter
* Alle Switches sind initial auf `false` (deaktiviert) gesetzt.
* Der berechnete absetzbare Betrag ergibt sich aus: `Tarifbeitrag * (steuerl_absetzbar / 100)`.