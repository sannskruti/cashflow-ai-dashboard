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
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  uploadCsv,
  getSummary,
  getWeekly,
  getDrivers,
  getRisk,
  getForecast,
  explain,
} from "./api";

// ── Types ───────────────────────────────────────────────────────────────────

type Summary = {
  datasetId: number;
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  avgWeeklyNet: number;
  avgWeeklyExpense: number;
};
type WeeklyPoint = { weekStart: string; income: number; expense: number; net: number };
type DriverPoint = { category: string; totalExpense: number };
type Risk = {
  datasetId: number;
  riskScore: number;
  negativeWeeksRatio: number;
  weeklyNetVolatility: number;
  reasons: string[];
  topExpenseDrivers: DriverPoint[];
};
type ForecastPoint = { weekStart: string; projectedNet: number };
type AiInsights = {
  executiveSummary: string;
  keyDrivers: string[];
  recommendations: { action: string; impact: string; effort: string; timeframe: string }[];
  confidence: number;
  notes: string[];
};

// ── Theme ───────────────────────────────────────────────────────────────────

const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#080d18", paper: "#0f1623" },
    primary: { main: "#818cf8" },
    success: { main: "#34d399" },
    error: { main: "#fb7185" },
    warning: { main: "#fbbf24" },
    text: { primary: "#f1f5f9", secondary: "#64748b" },
    divider: "rgba(255,255,255,0.07)",
  },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
    h4: { fontWeight: 700, letterSpacing: "-0.5px" },
    h6: { fontWeight: 600 },
    subtitle2: { fontWeight: 500 },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          background: "#0f1623",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10, textTransform: "none", fontWeight: 600 },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8, fontWeight: 500 } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 99, height: 8, background: "rgba(255,255,255,0.07)" },
      },
    },
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | string): string {
  if (v === null || v === undefined || v === "-") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function axiosMsg(e: unknown, fallback: string): string {
  if (e && typeof e === "object") {
    const err = e as Record<string, unknown>;
    const data = (err.response as Record<string, unknown>)?.data as Record<string, unknown>;
    if (typeof data?.message === "string") return data.message;
    if (typeof err.message === "string") return err.message;
  }
  return fallback;
}

function riskColor(score: number) {
  if (score < 34) return "#34d399";
  if (score < 67) return "#fbbf24";
  return "#fb7185";
}

function riskLabel(score: number) {
  if (score < 34) return "Low Risk";
  if (score < 67) return "Medium Risk";
  return "High Risk";
}

const TOOLTIP = {
  contentStyle: {
    background: "#1e2a3a",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "#f1f5f9",
    fontSize: 12,
  },
  labelStyle: { color: "#94a3b8" },
};

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
        >
          {title}
        </Typography>
        <Box sx={{ mt: 2 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function KpiCard({ title, value, accent, sub }: { title: string; value: number | string; accent: string; sub?: string }) {
  return (
    <Card sx={{ borderLeft: `3px solid ${accent}`, height: "100%" }}>
      <CardContent sx={{ p: 2.5 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {title}
        </Typography>
        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700, color: accent }}>
          {fmt(value)}
        </Typography>
        {sub && (
          <Typography variant="caption" sx={{ color: accent, opacity: 0.8 }}>
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
  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [weekly, setWeekly] = useState<WeeklyPoint[]>([]);
  const [drivers, setDrivers] = useState<DriverPoint[]>([]);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [ai, setAi] = useState<AiInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chartWeekly = useMemo(() => weekly.map((w) => ({ ...w })), [weekly]);
  const chartForecast = useMemo(() => forecast.map((f) => ({ ...f })), [forecast]);

  async function loadAll(id: number) {
    setError(null);
    setLoading(true);
    try {
      const [s, w, d, r, f] = await Promise.all([
        getSummary(id), getWeekly(id), getDrivers(id), getRisk(id), getForecast(id, 12),
      ]);
      setSummary(s); setWeekly(w); setDrivers(d); setRisk(r); setForecast(f); setAi(null);
    } catch (e: unknown) {
      setError(axiosMsg(e, "Failed to load analytics"));
    } finally {
      setLoading(false);
    }
  }

  async function onUpload(file: File) {
    setError(null);
    setLoading(true);
    try {
      const ds = await uploadCsv(file);
      setDatasetId(ds.datasetId);
      await loadAll(ds.datasetId);
    } catch (e: unknown) {
      setError(axiosMsg(e, "Upload failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onExplain() {
    if (!datasetId) return;
    setError(null);
    setAiLoading(true);
    try {
      const res = await explain(datasetId, 12);
      setAi(res);
    } catch (e: unknown) {
      setError(axiosMsg(e, "AI explain failed"));
    } finally {
      setAiLoading(false);
    }
  }

  const netColor = summary ? (summary.netCashflow >= 0 ? "#34d399" : "#fb7185") : "#818cf8";

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: 6 }}>

        {/* Header */}
        <Box
          sx={{
            px: { xs: 2, md: 5 }, py: 2,
            borderBottom: "1px solid", borderColor: "divider",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            backdropFilter: "blur(12px)",
            background: alpha("#0f1623", 0.9),
            position: "sticky", top: 0, zIndex: 10,
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.main", lineHeight: 1.2 }}>
              ◈ Cashflow AI
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Financial Intelligence Dashboard
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center">
            {datasetId && (
              <Chip
                label={`Dataset #${datasetId}`}
                size="small"
                sx={{ bgcolor: alpha("#818cf8", 0.12), color: "primary.main", border: "1px solid", borderColor: alpha("#818cf8", 0.3) }}
              />
            )}
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
            <Button variant="outlined" size="small" onClick={() => fileRef.current?.click()} disabled={loading}
              sx={{ borderColor: alpha("#818cf8", 0.4), color: "text.primary" }}>
              {loading && <CircularProgress size={13} sx={{ mr: 1 }} />}
              Upload CSV
            </Button>
            <Button variant="contained" size="small" disabled={!datasetId || aiLoading} onClick={onExplain}
              sx={{ background: "linear-gradient(135deg, #818cf8, #6366f1)", boxShadow: "0 4px 14px rgba(99,102,241,0.4)" }}>
              {aiLoading && <CircularProgress size={13} sx={{ mr: 1, color: "inherit" }} />}
              {aiLoading ? "Analyzing…" : "✦ AI Insights"}
            </Button>
          </Stack>
        </Box>

        {/* Body */}
        <Box sx={{ maxWidth: 1280, mx: "auto", px: { xs: 2, md: 5 }, mt: 4 }}>

          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {loading && !summary && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 12 }}>
              <CircularProgress />
            </Box>
          )}

          {!summary && !loading && (
            <Box sx={{ textAlign: "center", mt: 14 }}>
              <Typography variant="h4" sx={{ color: "text.secondary", mb: 1 }}>Upload a CSV to get started</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", opacity: 0.6 }}>
                Transactions → Risk · Drivers · Forecast → AI Recommendations
              </Typography>
            </Box>
          )}

          {summary && (
            <>
              {/* KPI Row */}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2, mb: 3 }}>
                <KpiCard title="Total Income" value={summary.totalIncome} accent="#34d399" />
                <KpiCard title="Total Expense" value={summary.totalExpense} accent="#fb7185" />
                <KpiCard title="Net Cashflow" value={summary.netCashflow} accent={netColor} />
                <KpiCard title="Avg Weekly Net" value={summary.avgWeeklyNet} accent="#818cf8" />
                <KpiCard
                  title="Risk Score"
                  value={risk ? `${risk.riskScore} / 100` : "-"}
                  accent={risk ? riskColor(risk.riskScore) : "#64748b"}
                  sub={risk ? riskLabel(risk.riskScore) : undefined}
                />
              </Box>

              {/* Charts Row 1 */}
              <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 2, mb: 2 }}>
                <SectionCard title="Weekly Cashflow">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartWeekly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="weekStart" hide />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <ReTooltip {...TOOLTIP} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                      <Line type="monotone" dataKey="income" stroke="#34d399" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="expense" stroke="#fb7185" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="net" stroke="#818cf8" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </SectionCard>

                <SectionCard title="Top Expense Drivers">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={drivers} layout="vertical" margin={{ left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="category" type="category" tick={{ fill: "#94a3b8", fontSize: 11 }} width={85} axisLine={false} tickLine={false} />
                      <ReTooltip {...TOOLTIP} />
                      <Bar dataKey="totalExpense" fill="#fb7185" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </SectionCard>
              </Box>

              {/* Charts Row 2 */}
              <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 2, mb: 2 }}>
                <SectionCard title="12-Week Net Forecast">
                  <ResponsiveContainer width="100%" height={210}>
                    <LineChart data={chartForecast}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="weekStart" hide />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <ReTooltip {...TOOLTIP} />
                      <Line type="monotone" dataKey="projectedNet" stroke="#818cf8" dot={false} strokeWidth={2} strokeDasharray="6 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </SectionCard>

                {risk && (
                  <SectionCard title="Risk Analysis">
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>Risk Score</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: riskColor(risk.riskScore) }}>
                          {risk.riskScore}/100
                        </Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={risk.riskScore}
                        sx={{ "& .MuiLinearProgress-bar": { background: riskColor(risk.riskScore), borderRadius: 99 } }} />
                      <Typography variant="caption" sx={{ color: riskColor(risk.riskScore), fontWeight: 600, mt: 0.5, display: "block" }}>
                        {riskLabel(risk.riskScore)}
                      </Typography>
                    </Box>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={0.75}>
                      {risk.reasons.map((r, i) => (
                        <Typography key={i} variant="caption" sx={{ color: "text.secondary", display: "flex", gap: 0.75, lineHeight: 1.5 }}>
                          <span style={{ color: riskColor(risk.riskScore) }}>›</span> {r}
                        </Typography>
                      ))}
                    </Stack>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={0.25}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Neg. weeks: <b style={{ color: "#f1f5f9" }}>{(risk.negativeWeeksRatio * 100).toFixed(0)}%</b>
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Volatility: <b style={{ color: "#f1f5f9" }}>{fmt(risk.weeklyNetVolatility)}</b>
                      </Typography>
                    </Stack>
                  </SectionCard>
                )}
              </Box>

              {/* AI Insights */}
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                      AI Insights
                    </Typography>
                    <Chip label="gpt-4.1-mini · cached" size="small"
                      sx={{ fontSize: 10, height: 18, bgcolor: alpha("#818cf8", 0.1), color: "primary.main" }} />
                  </Box>

                  {!ai && !aiLoading && (
                    <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderStyle: "dashed", borderColor: "divider", background: "transparent" }}>
                      <Typography sx={{ color: "text.secondary" }}>
                        Click <b style={{ color: "#818cf8" }}>✦ AI Insights</b> to generate a grounded executive summary, key drivers, and recommendations.
                      </Typography>
                    </Paper>
                  )}

                  {aiLoading && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 3, justifyContent: "center" }}>
                      <CircularProgress size={20} />
                      <Typography sx={{ color: "text.secondary" }}>Analyzing cashflow data…</Typography>
                    </Box>
                  )}

                  {ai && (
                    <Box sx={{ display: "grid", gap: 3 }}>
                      <Box sx={{ p: 2.5, borderRadius: 2, bgcolor: alpha("#818cf8", 0.06), border: "1px solid", borderColor: alpha("#818cf8", 0.15) }}>
                        <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Executive Summary
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.75 }}>{ai.executiveSummary}</Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Key Drivers
                        </Typography>
                        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1.25 }}>
                          {ai.keyDrivers.map((d, i) => (
                            <Chip key={i} label={d} size="small"
                              sx={{ bgcolor: alpha("#34d399", 0.1), color: "#34d399", border: "1px solid", borderColor: alpha("#34d399", 0.2) }} />
                          ))}
                        </Stack>
                      </Box>

                      <Box>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Recommendations
                        </Typography>
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 1.5, mt: 1.5 }}>
                          {ai.recommendations.map((r, i) => (
                            <Paper key={i} sx={{ p: 2, borderRadius: 2, bgcolor: alpha("#0f1623", 0.6), border: "1px solid rgba(255,255,255,0.07)" }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>{r.action}</Typography>
                              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.25, lineHeight: 1.5 }}>{r.impact}</Typography>
                              <Stack direction="row" spacing={0.75}>
                                <Chip label={`Effort: ${r.effort}`} size="small"
                                  sx={{ fontSize: 10, height: 18, bgcolor: alpha("#fbbf24", 0.1), color: "#fbbf24" }} />
                                <Chip label={r.timeframe} size="small"
                                  sx={{ fontSize: 10, height: 18, bgcolor: alpha("#818cf8", 0.1), color: "#818cf8" }} />
                              </Stack>
                            </Paper>
                          ))}
                        </Box>
                      </Box>

                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 110 }}>Model confidence</Typography>
                        <Box sx={{ flex: 1, maxWidth: 180 }}>
                          <LinearProgress variant="determinate" value={ai.confidence * 100}
                            sx={{ "& .MuiLinearProgress-bar": { background: "#34d399", borderRadius: 99 } }} />
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
