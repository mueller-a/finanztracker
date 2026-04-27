---
name: domain-immobilien
description: Immobilien-Tracking — Annuitätendarlehen, LTV, Sondertilgungs-Effekt, Zinsbindungs-Risiko, AfA (linear/degressiv), 15%-Grenze Instandhaltung, 10-Jahres-Haltefrist. Lies diese Skill für Tasks rund um Immobilien-Modul, Finanzierung, AfA-Berechnung.
---

# Immobilien-Modul (Real Estate)

Trackt Eigentums-Immobilien mit Finanzierungsstruktur und steuerlicher Rendite-Logik.

## Finanzierungs-Architektur & Darlehenslogik

### Annuitätendarlehen
Berechne die monatliche Rate aus Zins und Tilgung. Beachte: der Zinsanteil verringert sich monatlich, während der Tilgungsanteil steigt.

$$Rate = Restschuld \cdot \frac{Zins + Tilgung}{12}$$

### LTV (Loan-to-Value)
Beleihungsauslauf als Risiko-Indikator und Hinweis auf zukünftige Zinskonditionen.

$$LTV = \frac{Restschuld}{Marktwert} \cdot 100$$

### Sondertilgungs-Effekt
- Implementiere eine Logik, die zeigt, wie eine **einmalige Sondertilgung** die Gesamtlaufzeit und die Zinskosten über die gesamte Zinsbindung hinweg reduziert.
- Visualisiere "Vorher / Nachher"-Vergleich, damit der Effekt der Sondertilgung intuitiv sichtbar wird.

### Zinsbindungs-Ende
- Markiere das Ende der Zinsbindung als kritisches Event für Anschlussfinanzierungen.
- Simuliere ein **Zinsänderungsrisiko** (z. B. +2 % auf den aktuellen Satz) — neue Rate, neue Restlaufzeit.

## Fiskalische Logik & Investment-Metriken

### AfA (Absetzung für Abnutzung)
- **Lineare AfA:**
  - 2 % für Altbau.
  - 3 % für Neubau ab 2023.
- **Degressive AfA für Wohngebäude:** 5 % ab 2024/2025 für die ersten 6 Jahre bei Neubau.
- **Wichtig:** AfA gilt nur auf den **Gebäudeanteil** — der Grundstücksanteil muss vom Kaufpreis abgezogen werden (typische Aufteilung 70/30 oder 80/20, abhängig von Lage).

### Die 15 %-Grenze (Instandhaltung)
Überwache Instandhaltungskosten in den **ersten 3 Jahren** nach Kauf:
- Wenn diese **15 % des Gebäude-Anschaffungspreises** übersteigen, werden sie zu **Anschaffungskosten** (AfA-pflichtig) statt sofort abziehbaren Werbungskosten.
- Implikation: User-Hinweis "Du näherst dich der 15 %-Grenze" frühzeitig anzeigen — sonst entsteht eine ungewollte Steuerfalle.

### Steuervorteil (Rendite-Boost)
Berechne die Steuerersparnis durch die **Verrechnung von negativen Einkünften** (Zinsen + AfA + Verwaltung > Miete) mit dem persönlichen Steuersatz aus dem Settings-Modul.

### 10-Jahres-Haltefrist (§ 23 EStG)
- **Steuerfreier Veräußerungsgewinn** erst nach Ablauf von **10 Jahren** (bei Vermietung).
- UI sollte das Erreichen der Frist prominent anzeigen — wichtige Verkaufs-Entscheidungshilfe.

## Existierende Utilities

- [client/src/utils/realEstateCalc.js](../../../client/src/utils/realEstateCalc.js) — Annuität, LTV, AfA, Sondertilgung, Stresstests.
- [client/src/pages/RealEstatePage.js](../../../client/src/pages/RealEstatePage.js) — UI mit Property-Cards, Mortgage-Form.

## Cross-Referenzen

- **Steuer-Verfahren (Veräußerungsgewinn-Steuer, Werbungskosten):** → [`steuern-de`](../steuern-de/SKILL.md)
- **Annuitätsformel-Engine (geteilt mit Verbindlichkeiten):** → [`domain-verbindlichkeiten`](../domain-verbindlichkeiten/SKILL.md)
