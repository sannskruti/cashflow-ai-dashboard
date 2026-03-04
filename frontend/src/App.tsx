import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  createTheme,
  ThemeProvider,
  CssBaseline,
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
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
import {
  uploadCsv,
  getSummary,
  getWeekly,
  getDrivers,
  getRisk,
  getForecast,
  explain,
  login as loginApi,
  logout as logoutApi,
  whoAmI,
  getAuthToken,
  setAuthToken,
  askFromInsights,
} from "./api";

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
type AuthUser = { username: string };
type ChatAnswer = {
  answer: string;
  supportingPoints: string[];
  retrievedContext: string[];
  method: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

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

function buildTheme(mode: "light" | "dark") {
  const isLight = mode === "light";
  return createTheme({
    palette: {
      mode,
      background: {
        default: isLight ? "#f4f7ff" : "#060b14",
        paper: isLight ? "rgba(255,255,255,0.84)" : "rgba(12,18,30,0.8)",
      },
      primary: { main: "#6366f1" },
      success: { main: "#16a34a" },
      error:   { main: "#e11d48" },
      warning: { main: "#d97706" },
      text: {
        primary: isLight ? "#0f172a" : "#f1f5f9",
        secondary: isLight ? "#475569" : "#64748b",
      },
      divider: isLight ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.06)",
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
            border: isLight ? "1px solid rgba(15,23,42,0.08)" : "1px solid rgba(255,255,255,0.07)",
            boxShadow: isLight
              ? "0 10px 28px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.6)"
              : "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
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
        styleOverrides: { root: { borderRadius: 99, height: 6 } },
      },
    },
  });
}

// ── Recharts tooltip style ───────────────────────────────────────────────────

function chartTooltip(isLight: boolean) {
  return {
    contentStyle: {
      background: isLight ? "rgba(255,255,255,0.98)" : "rgba(10,16,28,0.95)",
      border: isLight ? "1px solid rgba(15,23,42,0.12)" : "1px solid rgba(255,255,255,0.1)",
      borderRadius: 12,
      color: isLight ? "#0f172a" : "#f1f5f9",
      fontSize: 12,
      boxShadow: isLight ? "0 8px 24px rgba(15,23,42,0.12)" : "0 8px 32px rgba(0,0,0,0.6)",
    },
    labelStyle: { color: "#64748b", marginBottom: 4 },
    formatter: (v: number | undefined) => [v !== undefined ? fmtFull(v) : "-", ""] as [string, string],
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <Card sx={(t) => ({ background: t.palette.mode === "light" ? "rgba(255,255,255,0.85)" : "rgba(10,16,28,0.6)", height: "100%" })}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
          <Typography variant="caption" sx={(t) => ({ color: t.palette.text.secondary, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 })}>
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
    <Card sx={(t) => ({
      height: "100%",
      background: t.palette.mode === "light"
        ? `linear-gradient(145deg, ${alpha(accent, 0.13)} 0%, rgba(255,255,255,0.9) 65%)`
        : `linear-gradient(145deg, ${alpha(accent, 0.09)} 0%, rgba(10,16,28,0.7) 65%)`,
      border: `1px solid ${alpha(accent, 0.22)}`,
      boxShadow: t.palette.mode === "light"
        ? `0 0 20px ${alpha(accent, 0.08)}, 0 8px 24px rgba(15,23,42,0.1)`
        : `0 0 28px ${alpha(accent, 0.07)}, 0 8px 32px rgba(0,0,0,0.45)`,
      position: "relative", overflow: "hidden",
      transition: "box-shadow 0.25s",
      "&:hover": { boxShadow: t.palette.mode === "light"
        ? `0 0 30px ${alpha(accent, 0.16)}, 0 12px 30px rgba(15,23,42,0.14)`
        : `0 0 40px ${alpha(accent, 0.15)}, 0 12px 40px rgba(0,0,0,0.5)` },
      "&::before": {
        content: '""', position: "absolute",
        top: 0, left: 0, right: 0, height: "2px",
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
      },
    })}>
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
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const [mode, setMode] = useState<"light" | "dark">(
    () => (localStorage.getItem("cashflow.themeMode") === "light" ? "light" : "dark"),
  );
  const [authReady, setAuthReady]   = useState(false);
  const [authUser, setAuthUser]     = useState<AuthUser | null>(null);
  const [showIntroWallpaper, setShowIntroWallpaper] = useState(true);
  const [loginUsername, setLoginUsername] = useState("demo@cashflow.ai");
  const [loginPassword, setLoginPassword] = useState("password123");
  const [loginLoading, setLoginLoading] = useState(false);
  const [datasetId, setDatasetId]   = useState<number | null>(null);
  const [loading,   setLoading]     = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [summary,   setSummary]     = useState<Summary | null>(null);
  const [weekly,    setWeekly]      = useState<WeeklyPoint[]>([]);
  const [drivers,   setDrivers]     = useState<DriverPoint[]>([]);
  const [risk,      setRisk]        = useState<Risk | null>(null);
  const [forecast,  setForecast]    = useState<ForecastPoint[]>([]);
  const [ai,        setAi]          = useState<AiInsights | null>(null);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatListening, setChatListening] = useState(false);
  const [chatAnswer, setChatAnswer] = useState<ChatAnswer | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [error,     setError]       = useState<string | null>(null);

  const chartWeekly   = useMemo(() => weekly.map((w) => ({ ...w })), [weekly]);
  const chartForecast = useMemo(() => forecast.map((f) => ({ ...f })), [forecast]);
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const isLight = mode === "light";
  const TOOLTIP = useMemo(() => chartTooltip(isLight), [isLight]);

  useEffect(() => {
    localStorage.setItem("cashflow.themeMode", mode);
  }, [mode]);

  useEffect(() => {
    async function initAuth() {
      const token = getAuthToken();
      if (!token) {
        setAuthReady(true);
        return;
      }

      try {
        const me = await whoAmI();
        setAuthUser({ username: me.username });
      } catch {
        setAuthToken(null);
      } finally {
        setAuthReady(true);
      }
    }

    void initAuth();
  }, []);

  function resetDashboard() {
    setShowIntroWallpaper(true);
    setDatasetId(null);
    setSummary(null);
    setWeekly([]);
    setDrivers([]);
    setRisk(null);
    setForecast([]);
    setAi(null);
    setChatQuestion("");
    setChatAnswer(null);
    setChatError(null);
    setError(null);
  }

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoginLoading(true);
    try {
      const res = await loginApi(loginUsername.trim(), loginPassword);
      setAuthToken(res.token);
      setAuthUser({ username: res.username });
    } catch (e: unknown) {
      setError(axiosMsg(e, "Login failed"));
    } finally {
      setLoginLoading(false);
    }
  }

  async function onLogout() {
    try {
      await logoutApi();
    } catch {
      // ignore logout errors
    } finally {
      setAuthToken(null);
      setAuthUser(null);
      resetDashboard();
    }
  }

  function onUploadButtonClick() {
    setShowIntroWallpaper(false);
    fileRef.current?.click();
  }

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
    try {
      setAi(await explain(datasetId, 12));
      setChatQuestion("");
      setChatAnswer(null);
      setChatError(null);
    }
    catch (e: unknown) { setError(axiosMsg(e, "AI explain failed")); }
    finally { setAiLoading(false); }
  }

  function startSpeechToText() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setChatError("Speech-to-text is not supported in this browser. Try Chrome.");
      return;
    }

    setChatError(null);
    const recognition = new Ctor();
    speechRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setChatQuestion((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.onerror = (event) => {
      setChatError(`Speech recognition error: ${event.error}`);
      setChatListening(false);
    };
    recognition.onend = () => {
      setChatListening(false);
      speechRef.current = null;
    };
    setChatListening(true);
    recognition.start();
  }

  function stopSpeechToText() {
    speechRef.current?.stop();
    setChatListening(false);
  }

  async function onAskQuestion() {
    if (!datasetId || !ai) {
      setChatError("Generate AI Insights first, then ask a question.");
      return;
    }
    const question = chatQuestion.trim();
    if (!question) {
      setChatError("Please type or speak a question.");
      return;
    }

    setChatError(null);
    setChatLoading(true);
    try {
      const answer = await askFromInsights(datasetId, question, 12);
      setChatAnswer(answer);
    } catch (e: unknown) {
      setChatError(axiosMsg(e, "Failed to get AI answer"));
    } finally {
      setChatLoading(false);
    }
  }

  const netColor = summary ? (summary.netCashflow >= 0 ? "#34d399" : "#fb7185") : "#818cf8";

  if (!authReady) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default" }}>
          <Stack spacing={2} alignItems="center">
            <CircularProgress sx={{ color: "#818cf8" }} />
            <Typography variant="body2" sx={{ color: "#475569" }}>Checking session…</Typography>
          </Stack>
        </Box>
      </ThemeProvider>
    );
  }

  if (!authUser) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          display: "grid",
          placeItems: "center",
          px: 2,
          position: "relative",
          overflow: "hidden",
          "@keyframes floatA": {
            "0%, 100%": { transform: "translateY(0px) scale(1)" },
            "50%": { transform: "translateY(-18px) scale(1.06)" },
          },
          "@keyframes floatB": {
            "0%, 100%": { transform: "translateY(0px) scale(1)" },
            "50%": { transform: "translateY(12px) scale(0.96)" },
          },
          "@keyframes fadeInUp": {
            "0%": { opacity: 0, transform: "translateY(18px)" },
            "100%": { opacity: 1, transform: "translateY(0)" },
          },
        }}>
          <Box sx={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('/login-wallpaper.webp')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: isLight ? 0.22 : 0.38,
            filter: "saturate(1.12) contrast(1.08)",
            pointerEvents: "none",
          }} />
          <Box sx={{
            position: "absolute",
            inset: 0,
            background: isLight
              ? "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(244,247,255,0.9) 68%)"
              : "linear-gradient(180deg, rgba(2,6,23,0.35) 0%, rgba(2,6,23,0.88) 68%)",
            pointerEvents: "none",
          }} />
          <Box sx={{
            position: "absolute",
            width: 460,
            height: 460,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.24) 0%, rgba(99,102,241,0) 68%)",
            top: -160,
            left: -120,
            filter: "blur(8px)",
            animation: "floatA 8s ease-in-out infinite",
            pointerEvents: "none",
          }} />
          <Box sx={{
            position: "absolute",
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(52,211,153,0.18) 0%, rgba(52,211,153,0) 70%)",
            bottom: -160,
            right: -120,
            filter: "blur(8px)",
            animation: "floatB 9s ease-in-out infinite",
            pointerEvents: "none",
          }} />

          <Box sx={{ width: "100%", maxWidth: 760, animation: "fadeInUp 500ms ease-out", zIndex: 1 }}>
            <Typography sx={{
              mb: 4.5,
              textAlign: "center",
              fontSize: { xs: 40, sm: 62 },
              lineHeight: 0.96,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "linear-gradient(135deg, #dbeafe 0%, #a5b4fc 55%, #6ee7b7 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: isLight ? "0 0 14px rgba(99,102,241,0.2)" : "0 0 20px rgba(99,102,241,0.35)",
            }}>
              Cashflow AI App
            </Typography>

            <Card sx={{
              width: "100%",
              maxWidth: 560,
              mx: "auto",
              background: "linear-gradient(165deg, rgba(10,16,28,0.82) 0%, rgba(7,11,22,0.74) 100%)",
              border: "1px solid rgba(129,140,248,0.2)",
              boxShadow: "0 24px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset",
              backdropFilter: "blur(20px)",
            }}>
            <CardContent sx={{ p: { xs: 3.5, sm: 4.5 } }}>
              <Typography sx={{ mt: 0.4, color: "#64748b", fontSize: 19, lineHeight: 1.55 }}>
                Sign in to continue to your executive cashflow control center.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2.25, mb: 3 }}>
                <Chip label="Enterprise-grade insights" size="small" sx={{
                  bgcolor: alpha("#818cf8", 0.14),
                  color: "#c7d2fe",
                  border: "1px solid",
                  borderColor: alpha("#818cf8", 0.35),
                }} />
                <Chip label="Built by Sanskruti Manoria" size="small" sx={{
                  bgcolor: alpha("#34d399", 0.12),
                  color: "#6ee7b7",
                  border: "1px solid",
                  borderColor: alpha("#34d399", 0.3),
                }} />
              </Stack>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <Box component="form" onSubmit={onLogin} sx={{ display: "grid", gap: 2.25 }}>
                <TextField
                  label="Username"
                  size="small"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoComplete="username"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      fontSize: 20,
                      borderRadius: 2,
                      bgcolor: "rgba(255,255,255,0.01)",
                    },
                    "& .MuiInputLabel-root": { fontSize: 17 },
                  }}
                />
                <TextField
                  label="Password"
                  size="small"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      fontSize: 20,
                      borderRadius: 2,
                      bgcolor: "rgba(255,255,255,0.01)",
                    },
                    "& .MuiInputLabel-root": { fontSize: 17 },
                  }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={loginLoading}
                  sx={{
                    mt: 1,
                    py: 1.35,
                    fontSize: 20,
                    fontWeight: 700,
                    borderRadius: 2.5,
                    letterSpacing: "0.01em",
                    background: "linear-gradient(135deg, #818cf8 0%, #6366f1 60%, #4f46e5 100%)",
                    boxShadow: "0 12px 30px rgba(99,102,241,0.4)",
                    transition: "transform 160ms ease, box-shadow 160ms ease",
                    "&:hover": {
                      transform: "translateY(-1px)",
                      boxShadow: "0 14px 36px rgba(99,102,241,0.55)",
                    },
                  }}
                >
                  {loginLoading && <CircularProgress size={14} sx={{ mr: 1, color: "inherit" }} />}
                  {loginLoading ? "Signing in…" : "Sign in"}
                </Button>
              </Box>
            </CardContent>
          </Card>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {/* Aurora background */}
      <Box sx={{
        minHeight: "100vh", bgcolor: "background.default", pb: 6, position: "relative",
        "&::before": {
          content: '""', position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          background: isLight ? `
            radial-gradient(ellipse 60% 40% at 15% 15%, rgba(99,102,241,0.1) 0%, transparent 60%),
            radial-gradient(ellipse 50% 35% at 85% 80%, rgba(52,211,153,0.08) 0%, transparent 55%),
            radial-gradient(ellipse 40% 30% at 50% 50%, rgba(251,113,133,0.06) 0%, transparent 60%)
          ` : `
            radial-gradient(ellipse 60% 40% at 15% 15%, rgba(99,102,241,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 50% 35% at 85% 80%, rgba(52,211,153,0.05) 0%, transparent 55%),
            radial-gradient(ellipse 40% 30% at 50% 50%, rgba(251,113,133,0.03) 0%, transparent 60%)
          `,
        },
      }}>
        {showIntroWallpaper && (
          <>
            <Box sx={{
              position: "fixed",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
              backgroundImage: "url('/login-wallpaper.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.26,
              filter: "saturate(1.1) contrast(1.08)",
            }} />
            <Box sx={{
              position: "fixed",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
              background: "linear-gradient(180deg, rgba(2,6,23,0.28) 0%, rgba(2,6,23,0.86) 74%)",
            }} />
          </>
        )}

        {/* ── Header ── */}
        <Box sx={{
          px: { xs: 2, md: 5 }, py: 1.75,
          borderBottom: isLight ? "1px solid rgba(15,23,42,0.12)" : "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          backdropFilter: "blur(24px)",
          background: isLight ? "rgba(255,255,255,0.82)" : "rgba(6,11,20,0.85)",
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
              <Typography variant="caption" sx={{ color: "#64748b", fontSize: 11, letterSpacing: "0.08em" }}>
                FINANCIAL INTELLIGENCE
              </Typography>
            </Box>
          </Box>

          <Typography sx={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            color: "#e2e8f0",
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "0.01em",
            display: { xs: "none", md: "block" },
            pointerEvents: "none",
          }}>
            Welcome {authUser.username}
          </Typography>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
              sx={{
                borderColor: isLight ? "rgba(15,23,42,0.2)" : "rgba(255,255,255,0.16)",
                color: isLight ? "#334155" : "#e2e8f0",
                fontSize: 14,
                fontWeight: 600,
                px: 1.8,
                py: 0.7,
                "&:hover": { borderColor: isLight ? "rgba(15,23,42,0.36)" : "rgba(255,255,255,0.3)" },
              }}
            >
              {isLight ? "Dark Mode" : "Light Mode"}
            </Button>
            {datasetId && (
              <Chip label={`Dataset #${datasetId}`} size="small" sx={{
                bgcolor: alpha("#818cf8", 0.1), color: "#818cf8",
                border: "1px solid", borderColor: alpha("#818cf8", 0.25),
              }} />
            )}
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
            <Button variant="outlined" size="small" onClick={onUploadButtonClick} disabled={loading}
              sx={{
                borderColor: "rgba(255,255,255,0.16)",
                color: "#cbd5e1",
                fontSize: 15,
                fontWeight: 600,
                px: 2.1,
                py: 0.8,
                "&:hover": { borderColor: "rgba(255,255,255,0.25)", bgcolor: "rgba(255,255,255,0.04)" },
              }}>
              {loading && <CircularProgress size={12} sx={{ mr: 1 }} />}
              Upload CSV
            </Button>
            <Button variant="contained" size="small" disabled={!datasetId || aiLoading} onClick={onExplain}
              sx={{
                fontSize: 15,
                fontWeight: 700,
                px: 2.2,
                py: 0.8,
                color: "#eef2ff",
                background: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
                boxShadow: "0 0 20px rgba(99,102,241,0.5), 0 4px 12px rgba(0,0,0,0.3)",
                "&:hover": { boxShadow: "0 0 30px rgba(99,102,241,0.65), 0 4px 16px rgba(0,0,0,0.4)" },
                "&.Mui-disabled": {
                  color: "rgba(238,242,255,0.75)",
                  background: "rgba(129,140,248,0.45)",
                },
              }}>
              {aiLoading && <CircularProgress size={12} sx={{ mr: 1, color: "inherit" }} />}
              {aiLoading ? "Analyzing…" : "✦ AI Insights"}
            </Button>
            <Button variant="text" size="small" onClick={onLogout}
              sx={{
                color: "#cbd5e1",
                fontSize: 15,
                fontWeight: 600,
                px: 1.4,
                py: 0.8,
                "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
              }}>
              Logout
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
              <Typography variant="body2" sx={{ color: "#cbd5e1", fontSize: { xs: 19, md: 36 }, lineHeight: 1.45, fontWeight: 500 }}>
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

              {/* ── AI Insights + Chatbot ── */}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3, mt: 1 }}>
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

              <Card sx={{
                background: "linear-gradient(145deg, rgba(16,24,40,0.8) 0%, rgba(10,16,28,0.72) 100%)",
                border: "1px solid rgba(129,140,248,0.16)",
              }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: "grid", gap: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap">
                      <Typography variant="caption" sx={{ color: "#818cf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Ask AI Chatbot
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Chip label="RAG" size="small" sx={{ fontSize: 9, height: 18, bgcolor: alpha("#34d399", 0.1), color: "#34d399" }} />
                        <Chip label="LLM" size="small" sx={{ fontSize: 9, height: 18, bgcolor: alpha("#818cf8", 0.12), color: "#818cf8" }} />
                      </Stack>
                    </Stack>

                    <Typography variant="caption" sx={{ color: "#64748b" }}>
                      Ask questions grounded in the generated insights. Use the mic for speech-to-text.
                    </Typography>

                    <TextField
                      multiline
                      minRows={2}
                      maxRows={4}
                      fullWidth
                      placeholder="Example: Why is our risk score high and what should we do first?"
                      value={chatQuestion}
                      onChange={(e) => setChatQuestion(e.target.value)}
                      disabled={!ai || chatLoading}
                    />

                    <Stack direction="row" spacing={1.2} alignItems="center">
                      <Button
                        variant={chatListening ? "contained" : "outlined"}
                        onClick={chatListening ? stopSpeechToText : startSpeechToText}
                        disabled={!ai || chatLoading}
                        sx={{ minWidth: 120 }}
                      >
                        {chatListening ? "Stop Mic" : "Use Mic"}
                      </Button>
                      <Button
                        variant="contained"
                        onClick={onAskQuestion}
                        disabled={!ai || chatLoading}
                        sx={{ minWidth: 130 }}
                      >
                        {chatLoading ? "Thinking…" : "Ask AI"}
                      </Button>
                    </Stack>

                    {!ai && (
                      <Typography variant="caption" sx={{ color: "#fbbf24" }}>
                        Generate AI Insights first to unlock chat.
                      </Typography>
                    )}

                    {chatError && (
                      <Alert severity="error" sx={{ mt: 0.5 }}>
                        {chatError}
                      </Alert>
                    )}

                    {chatAnswer && (
                      <Paper sx={{ mt: 0.5, p: 2, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(129,140,248,0.15)" }}>
                        <Typography variant="body2" sx={{ color: "#e2e8f0", lineHeight: 1.75 }}>
                          {chatAnswer.answer}
                        </Typography>

                        {!!chatAnswer.supportingPoints?.length && (
                          <Box sx={{ mt: 1.5 }}>
                            <Typography variant="caption" sx={{ color: "#818cf8", fontWeight: 700 }}>Supporting Points</Typography>
                            <Stack spacing={0.7} sx={{ mt: 0.7 }}>
                              {chatAnswer.supportingPoints.map((point, idx) => (
                                <Typography key={idx} variant="caption" sx={{ color: "#94a3b8", lineHeight: 1.6 }}>
                                  • {point}
                                </Typography>
                              ))}
                            </Stack>
                          </Box>
                        )}

                        {!!chatAnswer.retrievedContext?.length && (
                          <Box sx={{ mt: 1.5 }}>
                            <Typography variant="caption" sx={{ color: "#34d399", fontWeight: 700 }}>
                              Retrieved Context ({chatAnswer.method})
                            </Typography>
                            <Stack spacing={0.7} sx={{ mt: 0.7 }}>
                              {chatAnswer.retrievedContext.map((ctx, idx) => (
                                <Typography key={idx} variant="caption" sx={{ color: "#64748b", lineHeight: 1.6 }}>
                                  {idx + 1}. {ctx}
                                </Typography>
                              ))}
                            </Stack>
                          </Box>
                        )}
                      </Paper>
                    )}
                  </Box>
                </CardContent>
              </Card>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
