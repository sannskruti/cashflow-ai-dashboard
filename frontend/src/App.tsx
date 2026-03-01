import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  createTheme,
  ThemeProvider,
  CssBaseline,
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Divider,
  Paper,
  alpha,
} from "@mui/material";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import { uploadCsv, getSummary, getWeekly, getDrivers, getRisk, getForecast, explain } from "./api";

// ── Types ───────────────────────────────────────────────────────────────────

type Summary = {
  datasetId: number; totalIncome: number; totalExpense: number;
  netCashflow: number; avgWeeklyNet: number; avgWeeklyExpense: number;
};
type WeeklyPoint = { weekStart: string; income: number; expense: number; net: number };
type DriverPoint  = { category: string; totalExpense: number };
type Risk = {
  datasetId: number; riskScore: number; negativeWeeksRatio: number;
  weeklyNetVolatility: number; reasons: string[]; topExpenseDrivers: DriverPoint[];
};
type ForecastPoint = { weekStart: string; projectedNet: number };
type AiInsights = {
  executiveSummary: string; keyDrivers: string[];
  recommendations: { action: string; impact: string; effort: string; timeframe: string }[];
  confidence: number; notes: string[];
};

// ── Formatters ───────────────────────────────────────────────────────────────

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const USD_FULL = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function fmtUSD(v: number | string): string {
  const n = Number(v);
  return Number.isNaN(n) ? "-" : USD.format(n);
}
function fmtFull(v: number): string { return USD_FULL.format(v); }
function fmtPct(v: number): string { return `${(v * 100).toFixed(0)}%`; }

function axiosMsg(e: unknown, fallback: string): string {
  if (e && typeof e === "object") {
    const err = e as Record<string, unknown>;
    const data = (err.response as Record<string, unknown>)?.data as Record<string, unknown>;
    if (typeof data?.message === "string") return data.message;
    if (typeof err.message === "string") return err.message;
  }
  return fallback;
}

function riskColor(s: number) { return s < 34 ? "#34d399" : s < 67 ? "#fbbf24" : "#fb7185"; }
function riskLabel(s: number) { return s < 34 ? "Low Risk" : s < 67 ? "Medium Risk" : "High Risk"; }

// ── Theme ───────────────────────────────────────────────────────────────────

const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#060b14", paper: "rgba(12,18,30,0.8)" },
    primary: { main: "#818cf8" },
    success: { main: "#34d399" },
    error:   { main: "#fb7185" },
    warning: { main: "#fbbf24" },
    text: { primary: "#f1f5f9", secondary: "#475569" },
    divider: "rgba(255,255,255,0.06)",
  },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
    h4: { fontWeight: 700, letterSpacing: "-0.5px" },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
        },
      },
    },
    MuiButton: {
      styleOverrides: { root: { borderRadius: 10, textTransform: "none", fontWeight: 600, letterSpacing: "0.01em" } },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8, fontWeight: 500 } },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 99, height: 6, background: "rgba(255,255,255,0.06)" } },
    },
  },
});

// ── Recharts tooltip style ───────────────────────────────────────────────────

const TOOLTIP = {
  contentStyle: {
    background: "rgba(10,16,28,0.95)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    color: "#f1f5f9",
    fontSize: 12,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
  },
  labelStyle: { color: "#64748b", marginBottom: 4 },
  formatter: (v: number | undefined) => [v !== undefined ? fmtFull(v) : "-", ""] as [string, string],
};

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <Card sx={{ background: "rgba(10,16,28,0.6)", height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
          <Typography variant="caption" sx={{ color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
            {title}
          </Typography>
          {badge && (
            <Chip label={badge} size="small" sx={{ fontSize: 9, height: 16, bgcolor: alpha("#818cf8", 0.1), color: "#818cf8" }} />
          )}
        </Box>
        {children}
      </CardContent>
    </Card>
  );
}

function KpiCard({ title, value, accent, sub, symbol }: {
  title: string; value: string; accent: string; sub?: string; symbol?: string;
}) {
  return (
    <Card sx={{
      height: "100%",
      background: `linear-gradient(145deg, ${alpha(accent, 0.09)} 0%, rgba(10,16,28,0.7) 65%)`,
      border: `1px solid ${alpha(accent, 0.22)}`,
      boxShadow: `0 0 28px ${alpha(accent, 0.07)}, 0 8px 32px rgba(0,0,0,0.45)`,
      position: "relative", overflow: "hidden",
      transition: "box-shadow 0.25s",
      "&:hover": { boxShadow: `0 0 40px ${alpha(accent, 0.15)}, 0 12px 40px rgba(0,0,0,0.5)` },
      "&::before": {
        content: '""', position: "absolute",
        top: 0, left: 0, right: 0, height: "2px",
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
      },
    }}>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Typography variant="caption" sx={{ color: "#475569", textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 600, lineHeight: 1.2 }}>
            {title}
          </Typography>
          {symbol && (
            <Typography sx={{ fontSize: 18, lineHeight: 1, opacity: 0.6 }}>{symbol}</Typography>
          )}
        </Box>
        <Typography variant="h5" sx={{ mt: 1.25, fontWeight: 700, color: accent, letterSpacing: "-0.5px" }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" sx={{ color: accent, opacity: 0.75, fontWeight: 600 }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [datasetId, setDatasetId]   = useState<number | null>(null);
  const [loading,   setLoading]     = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [summary,   setSummary]     = useState<Summary | null>(null);
  const [weekly,    setWeekly]      = useState<WeeklyPoint[]>([]);
  const [drivers,   setDrivers]     = useState<DriverPoint[]>([]);
  const [risk,      setRisk]        = useState<Risk | null>(null);
  const [forecast,  setForecast]    = useState<ForecastPoint[]>([]);
  const [ai,        setAi]          = useState<AiInsights | null>(null);
  const [error,     setError]       = useState<string | null>(null);

  const chartWeekly   = useMemo(() => weekly.map((w) => ({ ...w })), [weekly]);
  const chartForecast = useMemo(() => forecast.map((f) => ({ ...f })), [forecast]);

  async function loadAll(id: number) {
    setError(null); setLoading(true);
    try {
      const [s, w, d, r, f] = await Promise.all([
        getSummary(id), getWeekly(id), getDrivers(id), getRisk(id), getForecast(id, 12),
      ]);
      setSummary(s); setWeekly(w); setDrivers(d); setRisk(r); setForecast(f); setAi(null);
    } catch (e: unknown) {
      setError(axiosMsg(e, "Failed to load analytics"));
    } finally { setLoading(false); }
  }

  async function onUpload(file: File) {
    setError(null); setLoading(true);
    try {
      const ds = await uploadCsv(file);
      setDatasetId(ds.datasetId);
      await loadAll(ds.datasetId);
    } catch (e: unknown) {
      setError(axiosMsg(e, "Upload failed"));
    } finally { setLoading(false); }
  }

  async function onExplain() {
    if (!datasetId) return;
    setError(null); setAiLoading(true);
    try { setAi(await explain(datasetId, 12)); }
    catch (e: unknown) { setError(axiosMsg(e, "AI explain failed")); }
    finally { setAiLoading(false); }
  }

  const netColor = summary ? (summary.netCashflow >= 0 ? "#34d399" : "#fb7185") : "#818cf8";

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {/* Aurora background */}
      <Box sx={{
        minHeight: "100vh", bgcolor: "background.default", pb: 6, position: "relative",
        "&::before": {
          content: '""', position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          background: `
            radial-gradient(ellipse 60% 40% at 15% 15%, rgba(99,102,241,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 50% 35% at 85% 80%, rgba(52,211,153,0.05) 0%, transparent 55%),
            radial-gradient(ellipse 40% 30% at 50% 50%, rgba(251,113,133,0.03) 0%, transparent 60%)
          `,
        },
      }}>

        {/* ── Header ── */}
        <Box sx={{
          px: { xs: 2, md: 5 }, py: 1.75,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          backdropFilter: "blur(24px)",
          background: "rgba(6,11,20,0.85)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{
              width: 34, height: 34, borderRadius: "10px",
              background: "linear-gradient(135deg, #818cf8, #6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 16px rgba(99,102,241,0.45)",
              fontSize: 16,
            }}>◈</Box>
            <Box>
              <Typography variant="subtitle1" sx={{
                fontWeight: 700, lineHeight: 1.15,
                background: "linear-gradient(135deg, #c7d2fe, #818cf8)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>
                Cashflow AI
              </Typography>
              <Typography variant="caption" sx={{ color: "#334155", fontSize: 10, letterSpacing: "0.06em" }}>
                FINANCIAL INTELLIGENCE
              </Typography>
            </Box>
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center">
            {datasetId && (
              <Chip label={`Dataset #${datasetId}`} size="small" sx={{
                bgcolor: alpha("#818cf8", 0.1), color: "#818cf8",
                border: "1px solid", borderColor: alpha("#818cf8", 0.25),
              }} />
            )}
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
            <Button variant="outlined" size="small" onClick={() => fileRef.current?.click()} disabled={loading}
              sx={{
                borderColor: "rgba(255,255,255,0.12)", color: "#94a3b8",
                "&:hover": { borderColor: "rgba(255,255,255,0.25)", bgcolor: "rgba(255,255,255,0.04)" },
              }}>
              {loading && <CircularProgress size={12} sx={{ mr: 1 }} />}
              Upload CSV
            </Button>
            <Button variant="contained" size="small" disabled={!datasetId || aiLoading} onClick={onExplain}
              sx={{
                background: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
                boxShadow: "0 0 20px rgba(99,102,241,0.5), 0 4px 12px rgba(0,0,0,0.3)",
                "&:hover": { boxShadow: "0 0 30px rgba(99,102,241,0.65), 0 4px 16px rgba(0,0,0,0.4)" },
                "&:disabled": { opacity: 0.4 },
              }}>
              {aiLoading && <CircularProgress size={12} sx={{ mr: 1, color: "inherit" }} />}
              {aiLoading ? "Analyzing…" : "✦ AI Insights"}
            </Button>
          </Stack>
        </Box>

        {/* ── Body ── */}
        <Box sx={{ maxWidth: 1300, mx: "auto", px: { xs: 2, md: 5 }, mt: 4, position: "relative", zIndex: 1 }}>

          {error && (
            <Alert severity="error" onClose={() => setError(null)}
              sx={{ mb: 3, borderRadius: 2, bgcolor: alpha("#fb7185", 0.08), border: "1px solid", borderColor: alpha("#fb7185", 0.25) }}>
              {error}
            </Alert>
          )}

          {loading && !summary && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, mt: 14 }}>
              <CircularProgress sx={{ color: "#818cf8" }} />
              <Typography variant="body2" sx={{ color: "#475569" }}>Loading analytics…</Typography>
            </Box>
          )}

          {!summary && !loading && (
            <Box sx={{ textAlign: "center", mt: 14 }}>
              <Typography variant="h4" sx={{
                background: "linear-gradient(135deg, #c7d2fe, #818cf8)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                mb: 1.5, fontWeight: 700,
              }}>
                Upload your transactions to begin
              </Typography>
              <Typography variant="body2" sx={{ color: "#334155" }}>
                CSV → Risk Score · Expense Drivers · 12-Week Forecast · AI Executive Summary
              </Typography>
            </Box>
          )}

          {summary && (
            <>
              {/* ── KPI Row ── */}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2, mb: 3 }}>
                <KpiCard title="Total Income"   value={fmtUSD(summary.totalIncome)}   accent="#34d399" symbol="↑" />
                <KpiCard title="Total Expense"  value={fmtUSD(summary.totalExpense)}  accent="#fb7185" symbol="↓" />
                <KpiCard title="Net Cashflow"   value={fmtUSD(summary.netCashflow)}   accent={netColor} symbol="≈"
                  sub={summary.netCashflow >= 0 ? "Positive" : "Negative"} />
                <KpiCard title="Avg Weekly Net" value={fmtUSD(summary.avgWeeklyNet)}  accent="#818cf8" symbol="⌀" />
                <KpiCard
                  title="Risk Score"
                  value={risk ? `${risk.riskScore} / 100` : "—"}
                  accent={risk ? riskColor(risk.riskScore) : "#334155"}
                  sub={risk ? riskLabel(risk.riskScore) : undefined}
                  symbol="⚡"
                />
              </Box>

              {/* ── Charts Row 1 ── */}
              <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 2, mb: 2 }}>
                <SectionCard title="Weekly Cashflow" badge="USD">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartWeekly}>
                      <defs>
                        <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="weekStart" hide />
                      <YAxis tick={{ fill: "#334155", fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <ReTooltip {...TOOLTIP} />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#475569", paddingTop: 8 }} />
                      <Line type="monotone" dataKey="income"  stroke="#34d399" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="expense" stroke="#fb7185" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="net"     stroke="#818cf8" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </SectionCard>

                <SectionCard title="Top Expense Drivers" badge="USD">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={drivers} layout="vertical" margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#334155", fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis dataKey="category" type="category" tick={{ fill: "#64748b", fontSize: 11 }} width={80} axisLine={false} tickLine={false} />
                      <ReTooltip {...TOOLTIP} />
                      <Bar dataKey="totalExpense" fill="#fb7185" radius={[0, 7, 7, 0]}
                        background={{ fill: "rgba(255,255,255,0.02)", radius: 7 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </SectionCard>
              </Box>

              {/* ── Charts Row 2 ── */}
              <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 2, mb: 2 }}>
                <SectionCard title="12-Week Net Forecast" badge="EMA · USD">
                  <ResponsiveContainer width="100%" height={210}>
                    <LineChart data={chartForecast}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="weekStart" hide />
                      <YAxis tick={{ fill: "#334155", fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <ReTooltip {...TOOLTIP} />
                      <Line type="monotone" dataKey="projectedNet" stroke="#818cf8" dot={false}
                        strokeWidth={2.5} strokeDasharray="8 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </SectionCard>

                {risk && (
                  <SectionCard title="Risk Analysis">
                    <Box sx={{ mb: 2.5 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
                        <Typography variant="caption" sx={{ color: "#475569" }}>Composite Score</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: riskColor(risk.riskScore) }}>
                          {risk.riskScore}
                          <Typography component="span" variant="caption" sx={{ color: "#334155", fontWeight: 400 }}> / 100</Typography>
                        </Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={risk.riskScore}
                        sx={{ "& .MuiLinearProgress-bar": { background: riskColor(risk.riskScore), borderRadius: 99 } }} />
                      <Chip label={riskLabel(risk.riskScore)} size="small" sx={{
                        mt: 1, fontSize: 10, height: 20,
                        bgcolor: alpha(riskColor(risk.riskScore), 0.12),
                        color: riskColor(risk.riskScore),
                        border: "1px solid", borderColor: alpha(riskColor(risk.riskScore), 0.25),
                      }} />
                    </Box>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={1}>
                      {risk.reasons.map((r, i) => (
                        <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                          <Typography sx={{ color: riskColor(risk.riskScore), fontSize: 12, lineHeight: 1.6 }}>›</Typography>
                          <Typography variant="caption" sx={{ color: "#475569", lineHeight: 1.6 }}>{r}</Typography>
                        </Box>
                      ))}
                    </Stack>
                    <Divider sx={{ my: 1.5 }} />
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                      {[
                        { label: "Neg. weeks", val: fmtPct(risk.negativeWeeksRatio) },
                        { label: "Volatility",  val: fmtUSD(risk.weeklyNetVolatility) },
                      ].map(({ label, val }) => (
                        <Box key={label} sx={{ p: 1, borderRadius: 1.5, bgcolor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                          <Typography variant="caption" sx={{ color: "#334155", display: "block" }}>{label}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: "#94a3b8" }}>{val}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </SectionCard>
                )}
              </Box>

              {/* ── AI Insights ── */}
              <Card sx={{
                background: "linear-gradient(145deg, rgba(99,102,241,0.05) 0%, rgba(10,16,28,0.7) 60%)",
                border: "1px solid rgba(129,140,248,0.15)",
                boxShadow: "0 0 40px rgba(99,102,241,0.06), 0 8px 32px rgba(0,0,0,0.5)",
              }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
                    <Typography variant="caption" sx={{ color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
                      AI Insights
                    </Typography>
                    <Chip label="gpt-4.1-mini" size="small" sx={{ fontSize: 9, height: 17, bgcolor: alpha("#818cf8", 0.1), color: "#818cf8" }} />
                    <Chip label="cached" size="small" sx={{ fontSize: 9, height: 17, bgcolor: alpha("#34d399", 0.1), color: "#34d399" }} />
                  </Box>

                  {!ai && !aiLoading && (
                    <Paper sx={{
                      p: 4, textAlign: "center",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 2,
                    }}>
                      <Typography sx={{ color: "#334155", fontSize: 14 }}>
                        Click{" "}
                        <Box component="span" sx={{
                          px: 1, py: 0.25, borderRadius: 1, fontSize: 12,
                          bgcolor: alpha("#818cf8", 0.12), color: "#818cf8", fontWeight: 600,
                        }}>
                          ✦ AI Insights
                        </Box>
                        {" "}to generate a grounded executive summary, key drivers & strategic recommendations.
                      </Typography>
                    </Paper>
                  )}

                  {aiLoading && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 4, justifyContent: "center" }}>
                      <CircularProgress size={18} sx={{ color: "#818cf8" }} />
                      <Typography sx={{ color: "#475569", fontSize: 14 }}>Analyzing cashflow data…</Typography>
                    </Box>
                  )}

                  {ai && (
                    <Box sx={{ display: "grid", gap: 3 }}>

                      {/* Executive Summary */}
                      <Box sx={{
                        p: 2.5, borderRadius: 2,
                        background: "linear-gradient(135deg, rgba(129,140,248,0.08), rgba(99,102,241,0.04))",
                        border: "1px solid rgba(129,140,248,0.15)",
                      }}>
                        <Typography variant="caption" sx={{ color: "#818cf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                          Executive Summary
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1.25, lineHeight: 1.8, color: "#cbd5e1" }}>
                          {ai.executiveSummary}
                        </Typography>
                      </Box>

                      {/* Key Drivers */}
                      <Box>
                        <Typography variant="caption" sx={{ color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                          Key Drivers
                        </Typography>
                        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1.25 }}>
                          {ai.keyDrivers.map((d, i) => (
                            <Chip key={i} label={d} size="small" sx={{
                              bgcolor: alpha("#34d399", 0.08), color: "#34d399",
                              border: "1px solid", borderColor: alpha("#34d399", 0.2), fontSize: 12,
                            }} />
                          ))}
                        </Stack>
                      </Box>

                      {/* Recommendations */}
                      <Box>
                        <Typography variant="caption" sx={{ color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                          Recommendations
                        </Typography>
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 1.5, mt: 1.5 }}>
                          {ai.recommendations.map((r, i) => (
                            <Box key={i} sx={{
                              p: 2.25, borderRadius: 2,
                              background: "rgba(255,255,255,0.025)",
                              border: "1px solid rgba(255,255,255,0.07)",
                              transition: "border-color 0.2s",
                              "&:hover": { borderColor: "rgba(255,255,255,0.14)" },
                            }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75, color: "#e2e8f0" }}>{r.action}</Typography>
                              <Typography variant="caption" sx={{ color: "#475569", display: "block", mb: 1.5, lineHeight: 1.6 }}>{r.impact}</Typography>
                              <Stack direction="row" spacing={0.75}>
                                <Chip label={`Effort: ${r.effort}`} size="small"
                                  sx={{ fontSize: 9, height: 18, bgcolor: alpha("#fbbf24", 0.1), color: "#fbbf24", border: "1px solid", borderColor: alpha("#fbbf24", 0.2) }} />
                                <Chip label={r.timeframe} size="small"
                                  sx={{ fontSize: 9, height: 18, bgcolor: alpha("#818cf8", 0.1), color: "#818cf8", border: "1px solid", borderColor: alpha("#818cf8", 0.2) }} />
                              </Stack>
                            </Box>
                          ))}
                        </Box>
                      </Box>

                      {/* Confidence */}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Typography variant="caption" sx={{ color: "#334155", minWidth: 116 }}>Model confidence</Typography>
                        <Box sx={{ flex: 1, maxWidth: 200 }}>
                          <LinearProgress variant="determinate" value={ai.confidence * 100}
                            sx={{ "& .MuiLinearProgress-bar": { background: "linear-gradient(90deg, #34d399, #6ee7b7)", borderRadius: 99 } }} />
                        </Box>
                        <Typography variant="caption" sx={{ color: "#34d399", fontWeight: 700 }}>
                          {(ai.confidence * 100).toFixed(0)}%
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
