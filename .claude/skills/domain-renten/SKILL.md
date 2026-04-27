---
name: domain-renten
description: Gesetzliche Rentenversicherung (GRV/Schicht 1) und betriebliche Altersvorsorge (bAV/Schicht 2) — Hybrid-Modell mit jährlichen Snapshots, Kohortenprinzip-Besteuerung, KVdR/PV im Ruhestand, Beitragsfreistellung. Lies diese Skill für Tasks rund um DRV-Renteninformation, bAV-Verträge, Netto-Rentenprognosen.
---

# Renten — GRV (Schicht 1) + bAV (Schicht 2)

Diese Skill deckt die ersten beiden Schichten der deutschen Altersvorsorge ab. **Schicht 3** (private Rentenversicherung) hat ein eigenes Snapshot-Modell und liegt in [`domain-versicherungen`](../domain-versicherungen/SKILL.md).

## Generische Rentenfaktor-Logik

Gilt für GRV, bAV und Schicht-3-Policen.

- **Rentenfaktor:** Berechnung der monatlichen Rente: `(Kapital / 10.000) × Rentenfaktor`.
- **Kapitalwahlrecht:** Nutzer können zwischen lebenslanger Rente und Einmalzahlung wählen — **außer bei der DRV** (gesetzliche Rente, keine Wahl).
- **PKV-Vorteil:** Da viele Nutzer PKV-versichert sind (`is_pkv === true`), fallen auf Rentenzahlungen (bAV/DRV) keine zusätzlichen GKV/PV-Beiträge an.

## Gesetzliche Rentenversicherung (GRV — Schicht 1)

### Hybrid-Modell & Snapshots
- **Logik:** Jährliche "Renteninformation" der DRV als Snapshot-Quelle.
- **Datenfelder:** `snapshot_date`, `current_entitlements` (bisher erreichte Rente), `projected_pension_67` (Hochrechnung bei aktuellem Gehalt), `total_points` (Entgeltpunkte).

### Steuerliche Behandlung (Kohortenprinzip)
- **Regel:** Nachgelagerte Besteuerung nach § 22 EStG.
- **Steueranteil 2026:** Für Neurentner im Jahr 2026 sind voraussichtlich **86 %** der Rente steuerpflichtig (steigt jährlich um 1 %).
- **Formel:** `Netto_Rente = Brutto_Rente − ((Brutto_Rente × 0,86) × persönlicher_Steuersatz)`.

### Sozialversicherung im Ruhestand
- **KVdR/PV:** Als pflichtversicherter Rentner fallen ca. **10–12 %** für KV und PV an.
- **Aufteilung:** Der Staat übernimmt bei der GRV einen Teil des KV-Beitrags (~7,3 %); den PV-Beitrag trägt der Rentner allein.

## Betriebliche Altersvorsorge (bAV — Schicht 2)

### Hybrid-Modell & Snapshots
- **Logik:** Analog zur privaten Rente. Tabelle `bav_snapshots` für Realdaten (Vertragswert, eingezahlte Beiträge, projizierte Rente).
- **Datenfelder:** `snapshot_date`, `current_capital`, `guaranteed_pension`, `projected_pension`, `employer_contribution`, `employee_contribution`.

### Steuerliche Behandlung (Nachgelagerte Besteuerung)
- **Grundregel:** Leistungen aus der bAV (Direktversicherung, Pensionskasse etc.) sind zu **100 %** steuerpflichtig (§ 22 Nr. 5 EStG).

#### Szenario A — Kapitalauszahlung
- Der gesamte Auszahlungsbetrag wird als Einkommen versteuert.
- **Fünftelregelung:** Prüfe die Anwendung der Fünftelregelung (§ 34 EStG) zur Abmilderung der Progression bei Einmalauszahlung. Details → [`steuern-de`](../steuern-de/SKILL.md).

#### Szenario B — Monatliche Rente
- Die monatliche Rente wird zu **100 %** mit dem persönlichen Einkommensteuersatz versteuert.

### Sozialversicherung im Ruhestand (GKV/PV)

#### Pflichtversicherte Rentner (KVdR)
- Auf bAV-Leistungen fallen Krankenkassen- (KV) und Pflegeversicherungsbeiträge (PV) an.
- **Freibetrag KV:** 2026: ca. **180–190 €** monatlich. Nur der Betrag darüber ist KV-pflichtig.
- **Freigrenze PV:** Wenn die bAV-Leistung die Grenze überschreitet, ist der **gesamte Betrag** PV-pflichtig (kein Freibetrag).

#### Privatversicherte (PKV)
- **Keine** zusätzlichen Sozialabgaben auf die bAV-Rente.

### Beitragsfreistellung (Passiv-Modus)

Ein Vertrag muss als "passiv" markiert werden können — stoppt alle zukünftigen Einzahlungen (Arbeitgeber- und Arbeitnehmeranteile) in der Projektionsrechnung.

- **Datenmodell:** Feld `is_passive` (boolean, default `false`) in der Tabelle `bav_contracts` oder im aktuellsten Snapshot.
- **Berechnung (Projektion):**
  - Wenn `is_passive = true`: Setze monatliche Beiträge für alle zukünftigen Monate auf 0 €.
  - Das vorhandene Kapital verzinst sich jedoch weiterhin bis zum Rentenbeginn (Zinseszinseffekt auf den Bestand).
- **UI (MUI):**
  - In der bAV-Detailansicht prominent ein `MUI Switch` oder `MUI Chip` (Toggle): "Vertrag aktiv" vs. "Vertrag passiv / beitragsfrei".
  - Wenn Status auf "passiv": Eingabefelder für `employer_contribution`/`employee_contribution` ausgegrauen oder auf 0 setzen.

## Refactoring-Vorgabe: Fokus auf Status Quo (historisch)

> **Hinweis:** Diese Vorgabe wurde im Verlauf der Entwicklung umgesetzt. Sie steht hier als historische Referenz, damit niemand versehentlich "Wunschrente"-Logik wieder einführt.

- **Entfernung Wunschrente:** Alle UI-Elemente, Datenbankfelder und Logiken bezüglich "Wunschrente", "Rentenlücke" oder "Zielbetrag" sind entfernt.
- **Fokus:** Das System visualisiert ausschließlich den **Status Quo** (Snapshots) und die **Netto-Prognose** (was real ausgezahlt wird).

## Existierende Utilities

- [client/src/utils/grvTax.js](../../../client/src/utils/grvTax.js) — Kohortenprinzip-Steuer.
- [client/src/utils/retirementNet.js](../../../client/src/utils/retirementNet.js) — Netto-Rentenberechnung mit KVdR/PV.
- [client/src/utils/bavTax.js](../../../client/src/utils/bavTax.js) — bAV-Besteuerung inkl. Fünftelregelung.

## Cross-Referenzen

- **Schicht 3 (private Rentenversicherung):** → [`domain-versicherungen`](../domain-versicherungen/SKILL.md)
- **Steuer-Verfahren im Detail (Halbeinkünfte, Ertragsanteil, Fünftelregelung):** → [`steuern-de`](../steuern-de/SKILL.md)
- **PKV-Beitragslogik im Ruhestand:** → [`domain-pkv`](../domain-pkv/SKILL.md)
