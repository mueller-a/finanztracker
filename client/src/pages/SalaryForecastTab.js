// Forecast-Tab für den Gehaltsrechner.
//
// Drei Slider (Bruttosteigerung p.a., Inflation p.a., Prognosezeitraum)
// liefern eine Forward-Projektion ab dem heutigen Brutto. Vier prominente
// KPI-Karten zeigen Brutto / Netto / Real-Netto / Kalte Progression
// zwischen Startjahr und Endjahr. Die Real-Netto-Karte ist Hauptkennzahl
// (vergrößert + Editorial-Navy-Hintergrund).
//
// Berechnung pro Jahr: enrichWithNetto erzwingt jahresspezifische
// getTaxConfig() — Tarif-Eckwerte, BBGen und SV-Sätze. Für Jahre nach der
// jüngsten hinterlegten Config (z.Z. 2026) werden die letzten Werte
// fortgeschrieben (siehe TAX_CONFIGS in src/utils/taxConfigs.js).

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Card, CardContent, Slider, Chip, Alert,
  Table, TableHead, TableBody, TableRow, TableCell,
  Tooltip as MuiTooltip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, Legend,
} from 'recharts';

import { calcGehaltResult } from '../utils/salaryCalculations';
import {
  enrichWithSteigerung, enrichWithInflation,
  enrichWithNetto, buildEstimateNet,
} from '../utils/salaryHistoryCalc';

const fmt0 = (v) => v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString('de-DE') + ' €';
const fmtPctSigned = (v) => v == null || isNaN(v)
  ? '–'
  : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace('.', ',') + ' %';
const fmtPpSigned = (v) => v == null || isNaN(v)
  ? '–'
  : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace('.', ',') + ' Pp';

const CURRENT_YEAR = new Date().getFullYear();
// Letztes Jahr mit hinterlegter Tarif-Config — nach diesem Jahr greift der
// Fallback und der Hinweis-Banner wird angezeigt.
const LATEST_KNOWN_TAX_YEAR = 2026;

export default function SalaryForecastTab({ baseParams }) {
  const theme = useTheme();
  const [growthPct,    setGrowthPct]    = useState(3);
  const [inflationPct, setInflationPct] = useState(2.5);
  const [years,        setYears]        = useState(5);

  const startYear = Number(baseParams.ghYear) || CURRENT_YEAR;
  const endYear   = startYear + years;
  const startGrossMonthly = Number(baseParams.ghBrutto) || 0;
  const startGrossAnnual  = startGrossMonthly * 12;

  const estimateNet = useMemo(
    () => buildEstimateNet(baseParams, calcGehaltResult),
    [baseParams],
  );

  // Synthetische History-Reihe ab Startjahr — pro Jahr Brutto×(1+Steigerung)^i
  const enriched = useMemo(() => {
    if (startGrossAnnual <= 0) return [];
    const rows = [];
    const factor = 1 + (Number(growthPct) || 0) / 100;
    for (let i = 0; i <= years; i++) {
      rows.push({
        year:          startYear + i,
        annual_gross:  Math.round(startGrossAnnual * Math.pow(factor, i)),
        net_monthly:   null,            // immer per estimate
        is_projection: i > 0,
      });
    }
    const withSteig = enrichWithSteigerung(rows);
    // Inflation als VPI-Projection: Basis = aktuelles Jahr=100, future
    // wird mit `inflationPct` extrapoliert, Inflation pro Jahr = inflationPct.
    const fakeVpi = { [startYear]: 100 };
    const withInfl = enrichWithInflation(withSteig, fakeVpi, inflationPct);
    return enrichWithNetto(withInfl, estimateNet);
  }, [startGrossAnnual, growthPct, inflationPct, years, startYear, estimateNet]);

  // Vergleich Startjahr ↔ Endjahr
  const dashboard = useMemo(() => {
    if (enriched.length < 2) return null;
    const first = enriched[0];
    const last  = enriched[enriched.length - 1];
    const grossStart = Number(first.annual_gross);
    const grossEnd   = Number(last.annual_gross);
    const netStart   = first.nettoMonthlyEffective;
    const netEnd     = last.nettoMonthlyEffective;
    if (!grossStart || !grossEnd || netStart == null || netEnd == null) return null;

    const bruttoNomPct = (grossEnd / grossStart - 1) * 100;
    const nettoNomPct  = (netEnd / netStart - 1) * 100;
    // Multi-Jahres-Inflation kompoundiert
    const inflFactor = Math.pow(1 + inflationPct / 100, years);
    const realNetPct = ((netEnd / netStart) / inflFactor - 1) * 100;
    const kalteProgPp = bruttoNomPct - nettoNomPct;

    return {
      startYear:    first.year,
      endYear:      last.year,
      grossStartM:  grossStart / 12,
      grossEndM:    grossEnd / 12,
      netStartM:    netStart,
      netEndM:      netEnd,
      bruttoNomPct,
      nettoNomPct,
      realNetPct,
      kalteProgPp,
      inflationCompoundPct: (inflFactor - 1) * 100,
    };
  }, [enriched, inflationPct, years]);

  const chartData = useMemo(() => enriched.map((r) => ({
    year:   r.year,
    brutto: Math.round(Number(r.annual_gross) / 12),
    netto:  r.nettoMonthlyEffective != null ? Math.round(r.nettoMonthlyEffective) : null,
    real:   r.nettoMonthlyEffective != null
      ? Math.round(r.nettoMonthlyEffective / Math.pow(1 + inflationPct / 100, r.year - startYear))
      : null,
  })), [enriched, inflationPct, startYear]);

  if (startGrossAnnual <= 0) {
    return (
      <Alert severity="info">
        Trage zuerst im Tab „Aktueller Monat" ein Brutto-Monatsgehalt ein, dann erscheint hier die Forecast-Projektion.
      </Alert>
    );
  }

  return (
    <Stack spacing={2.5}>
      {/* ─── Sektion 1: Eingabe / Prognose-Parameter ─── */}
      <Card elevation={2} sx={{ borderRadius: 1 }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
            <Box sx={{
              width: 32, height: 32, borderRadius: '8px',
              bgcolor: 'accent.positiveSurface', color: 'primary.dark',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 18 }}>
                tune
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Prognose-Parameter
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Brutto heute: {fmt0(startGrossMonthly)}/Mo · Startjahr {startYear}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{
            display: 'grid', gap: 3,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          }}>
            <ParamSlider
              label="Jährliche Bruttosteigerung"
              value={growthPct} onChange={setGrowthPct}
              min={0} max={10} step={0.1}
              format={(v) => v.toFixed(1).replace('.', ',') + ' %'}
            />
            <ParamSlider
              label="Erwartete Inflation"
              value={inflationPct} onChange={setInflationPct}
              min={0} max={8} step={0.1}
              format={(v) => v.toFixed(1).replace('.', ',') + ' %'}
            />
            <ParamSlider
              label="Prognosezeitraum"
              value={years} onChange={setYears}
              min={1} max={10} step={1}
              format={(v) => `${v} Jahr${v === 1 ? '' : 'e'}`}
            />
          </Box>

          {endYear > LATEST_KNOWN_TAX_YEAR && (
            <Alert severity="info" variant="outlined" sx={{ mt: 2, fontSize: '0.78rem' }}>
              Steuer- und SV-Parameter sind nur bis <strong>{LATEST_KNOWN_TAX_YEAR}</strong> hinterlegt.
              Für Jahre danach werden die letzten bekannten Werte fortgeschrieben — die kalte Progression
              ist daher leicht überschätzt, da reale künftige Tarifeckwert-Anhebungen fehlen.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ─── Sektion 2: Kennzahlen-Dashboard ─── */}
      {dashboard && (
        <Box sx={{
          display: 'grid', gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            md: '1fr 1fr 1.6fr 1fr',
          },
          alignItems: 'stretch',
        }}>
          <DashCard
            label={`Brutto ${dashboard.startYear} → ${dashboard.endYear}`}
            from={fmt0(dashboard.grossStartM)}
            to={fmt0(dashboard.grossEndM)}
            unit="/ Mo"
            delta={fmtPctSigned(dashboard.bruttoNomPct)}
            tag="nominal"
            tooltip="Brutto-Monatsgehalt vom Startjahr zum Endjahr — rein nominal, ohne Berücksichtigung von Steuer und Inflation."
          />
          <DashCard
            label={`Netto ${dashboard.startYear} → ${dashboard.endYear}`}
            from={fmt0(dashboard.netStartM)}
            to={fmt0(dashboard.netEndM)}
            unit="/ Mo"
            delta={fmtPctSigned(dashboard.nettoNomPct)}
            tag="kalte Progression"
            tooltip="Netto-Monatsgehalt mit jahresspezifischen Tarifeckwerten und BBGen. Differenz zu Brutto-% = kalte Progression."
          />
          <DashCard
            label="Reale Kaufkraft"
            valueLarge={fmtPctSigned(dashboard.realNetPct)}
            tag="primär"
            highlight={
              Math.abs(dashboard.realNetPct) <= 0.1 ? 'neutral'
              : dashboard.realNetPct > 0 ? 'positive' : 'negative'
            }
            sub={`nach ${fmtPctSigned(dashboard.inflationCompoundPct)} Inflation kompoundiert`}
            tooltip={`Δ Real Netto = ((Netto[${dashboard.endYear}]/Netto[${dashboard.startYear}]) / (1 + Inflation)^${years}) − 1. ` +
                     'Diese Zahl ist die ökonomisch relevante Veränderung deiner Kaufkraft.'}
          />
          <DashCard
            label="Kalte Progression"
            valueLarge={fmtPpSigned(dashboard.kalteProgPp)}
            tag="Brutto − Netto"
            tone={dashboard.kalteProgPp > 0 ? 'warn' : 'good'}
            sub="Prozentpunkte"
            tooltip="Differenz zwischen nominaler Brutto-Steigerung und nominaler Netto-Steigerung. Positiver Wert = Steuerprogression frisst einen Teil der Lohnerhöhung."
          />
        </Box>
      )}

      {/* ─── Sektion 3: Detail-Aufschlüsselung ─── */}
      {dashboard && (
        <Card elevation={1} sx={{ borderRadius: 1 }}>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Typography variant="overline" sx={{
              color: 'text.secondary', letterSpacing: '0.08em', display: 'block', mb: 1,
            }}>
              Jahr-für-Jahr-Verlauf
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Jahr</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Brutto / Mo</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Δ Brutto</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Netto / Mo</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Δ Netto</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Δ Real-Netto</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Kalte Progr.</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {enriched.map((r) => (
                    <TableRow key={r.year}>
                      <TableCell>
                        {r.year}
                        {r.year > LATEST_KNOWN_TAX_YEAR && (
                          <Chip label="Fortgeschr." size="small" variant="outlined"
                            sx={{ height: 16, fontSize: '0.55rem', ml: 0.5 }} />
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmt0(r.grossMonthly)}
                      </TableCell>
                      <TableCell align="right" sx={{
                        fontVariantNumeric: 'tabular-nums',
                        color: r.steigerungPct == null ? 'text.disabled' : 'text.secondary',
                      }}>
                        {r.steigerungPct == null ? '–' : fmtPctSigned(r.steigerungPct)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmt0(r.nettoMonthlyEffective)}
                      </TableCell>
                      <TableCell align="right" sx={{
                        fontVariantNumeric: 'tabular-nums',
                        color: r.nettoSteigerungPct == null ? 'text.disabled' : 'text.secondary',
                      }}>
                        {r.nettoSteigerungPct == null ? '–' : fmtPctSigned(r.nettoSteigerungPct)}
                      </TableCell>
                      <TableCell align="right" sx={{
                        fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                        color: r.realNettoSteigerungPct == null ? 'text.disabled'
                             : Math.abs(r.realNettoSteigerungPct) <= 0.1 ? 'text.primary'
                             : r.realNettoSteigerungPct > 0 ? 'success.main'
                             : 'error.main',
                      }}>
                        {r.realNettoSteigerungPct == null ? '–' : fmtPctSigned(r.realNettoSteigerungPct)}
                      </TableCell>
                      <TableCell align="right" sx={{
                        fontVariantNumeric: 'tabular-nums',
                        color: r.kalteProgressionPp == null ? 'text.disabled'
                             : r.kalteProgressionPp > 0 ? 'warning.main'
                             : 'success.main',
                      }}>
                        {r.kalteProgressionPp == null ? '–' : fmtPpSigned(r.kalteProgressionPp)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Chart: Brutto / Netto / Real-Netto über Zeit */}
      {chartData.length >= 2 && (
        <Card elevation={1} sx={{ borderRadius: 1 }}>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Typography variant="overline" sx={{
              color: 'text.secondary', letterSpacing: '0.08em', display: 'block', mb: 1,
            }}>
              Verlauf — Brutto, Netto, Real-Netto (Kaufkraft)
            </Typography>
            <Box sx={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                  <XAxis dataKey="year"
                    tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
                    axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v}
                    width={55} />
                  <RechartTooltip
                    formatter={(v, k) => [`${fmt0(v)}/Mo`, k === 'brutto' ? 'Brutto' : k === 'netto' ? 'Netto' : 'Real Netto']}
                    labelFormatter={(l) => `Jahr ${l}`}
                    contentStyle={{
                      background: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 8, fontSize: 12,
                    }}
                  />
                  <Legend formatter={(k) => k === 'brutto' ? 'Brutto' : k === 'netto' ? 'Netto' : 'Real Netto (Kaufkraft)'}
                    wrapperStyle={{ fontSize: 11 }} iconType="line" iconSize={10} />
                  <Line type="monotone" dataKey="brutto" stroke={theme.palette.primary.main}
                    strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="netto" stroke={theme.palette.warning.main}
                    strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="real" stroke={theme.palette.success.main}
                    strokeWidth={2.5} strokeDasharray="0" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

// ─── Slider mit Label + aktuellem Wert rechts ───────────────────────────────
function ParamSlider({ label, value, onChange, min, max, step, format }) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{
          color: 'text.secondary', fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {label}
        </Typography>
        <Typography sx={{
          fontFamily: '"Manrope", sans-serif',
          fontWeight: 800, fontSize: '0.95rem',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {format(value)}
        </Typography>
      </Stack>
      <Slider
        value={value}
        min={min} max={max} step={step}
        onChange={(_, v) => onChange(Number(v))}
        size="small"
        sx={{ py: 1 }}
      />
    </Box>
  );
}

// ─── Dashboard-Karte ─────────────────────────────────────────────────────────
function DashCard({ label, from, to, unit, valueLarge, delta, sub, tag, tooltip, highlight, tone }) {
  // highlight: 'positive' | 'negative' | 'neutral' (Real-Netto-Hauptkennzahl)
  // tone: 'good' | 'warn' (Kalte Progression)
  const isHighlight = !!highlight;
  const heroBgColor = isHighlight ? 'primary.dark'
                    : tone === 'warn' ? 'warning.light'
                    : 'background.paper';
  const heroTextColor = isHighlight ? 'primary.contrastText'
                      : 'text.primary';
  const accentColor = isHighlight && highlight === 'positive' ? 'accent.positiveSurface'
                    : isHighlight && highlight === 'negative' ? 'error.light'
                    : isHighlight ? 'primary.contrastText'
                    : 'text.primary';

  return (
    <Card elevation={isHighlight ? 4 : 1}
      sx={{
        borderRadius: 1, overflow: 'hidden',
        position: 'relative',
        bgcolor: heroBgColor,
        color: heroTextColor,
        border: isHighlight ? 'none' : 1,
        borderColor: 'divider',
        ...(isHighlight && {
          '&::before': {
            content: '""', position: 'absolute', inset: 0,
            background: (t) => `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 100%)`,
            opacity: 0.5, pointerEvents: 'none',
          },
        }),
      }}>
      <CardContent sx={{ p: { xs: 1.75, sm: 2 }, position: 'relative', zIndex: 1, '&:last-child': { pb: { xs: 1.75, sm: 2 } } }}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 0.75 }}>
          <Typography variant="caption" sx={{
            color: isHighlight ? 'primary.light' : 'text.secondary',
            fontWeight: 700, letterSpacing: '0.06em', fontSize: '0.62rem',
            textTransform: 'uppercase',
          }}>
            {label}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {tag && (
              <Chip label={tag} size="small" variant="outlined"
                sx={{
                  height: 18, fontSize: '0.6rem', fontWeight: 700,
                  color: isHighlight ? 'primary.contrastText' : 'text.secondary',
                  borderColor: isHighlight ? 'primary.light' : 'divider',
                }} />
            )}
            {tooltip && (
              <MuiTooltip title={tooltip} arrow>
                <Box component="span" className="material-symbols-outlined" sx={{
                  fontSize: 14, cursor: 'help',
                  color: isHighlight ? 'primary.light' : 'text.disabled',
                }}>
                  info
                </Box>
              </MuiTooltip>
            )}
          </Stack>
        </Stack>

        {valueLarge != null ? (
          <Typography sx={{
            fontFamily: '"Manrope", sans-serif',
            fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05,
            fontSize: { xs: '2rem', sm: '2.5rem' },
            color: accentColor,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {valueLarge}
          </Typography>
        ) : (
          <Stack direction="row" alignItems="baseline" spacing={0.75}>
            <Typography sx={{
              fontFamily: '"Manrope", sans-serif', fontWeight: 700,
              fontSize: '1.1rem', color: 'text.disabled',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {from}
            </Typography>
            <Typography sx={{ color: 'text.disabled', fontSize: '0.9rem' }}>→</Typography>
            <Typography sx={{
              fontFamily: '"Manrope", sans-serif', fontWeight: 800,
              fontSize: '1.4rem', letterSpacing: '-0.01em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {to}
            </Typography>
            {unit && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                {unit}
              </Typography>
            )}
          </Stack>
        )}

        {delta && (
          <Typography sx={{
            mt: 0.25, fontWeight: 700, fontSize: '0.85rem',
            color: 'text.secondary',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {delta}
          </Typography>
        )}

        {sub && (
          <Typography variant="caption" sx={{
            color: isHighlight ? 'primary.light' : 'text.secondary',
            display: 'block', mt: 0.5, fontSize: '0.7rem',
          }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
