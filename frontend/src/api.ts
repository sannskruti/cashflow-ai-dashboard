import axios from "axios";

const AUTH_TOKEN_KEY = "cashflow.authToken";

export const api = axios.create({
  baseURL: "http://localhost:8080",
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type LoginResponse = {
  token: string;
  username: string;
  expiresAt: string;
};

export type AskAnswerResponse = {
  answer: string;
  supportingPoints: string[];
  retrievedContext: string[];
  method: string;
};

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await api.post("/api/auth/login", { username, password });
  return res.data;
}

export async function whoAmI(): Promise<{ username: string }> {
  const res = await api.get("/api/auth/me");
  return res.data;
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout");
}

export async function uploadCsv(
  file: File,
): Promise<{ datasetId: number }> {
  const form = new FormData();
  form.append("file", file);

  // adjust path if your upload endpoint differs
  const res = await api.post("/api/datasets/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function getSummary(id: number) {
  return (await api.get(`/api/datasets/${id}/summary`)).data;
}

export async function getWeekly(id: number) {
  return (await api.get(`/api/datasets/${id}/weekly`)).data;
}

export async function getDrivers(id: number) {
  return (await api.get(`/api/datasets/${id}/drivers`)).data;
}

export async function getRisk(id: number) {
  return (await api.get(`/api/datasets/${id}/risk`)).data;
}

export async function getForecast(id: number, horizon = 12) {
  return (await api.get(`/api/datasets/${id}/forecast?horizon=${horizon}`))
    .data;
}

export async function explain(id: number, horizon = 12) {
  return (await api.post(`/api/datasets/${id}/explain?horizon=${horizon}`))
    .data;
}

export async function askFromInsights(id: number, question: string, horizon = 12): Promise<AskAnswerResponse> {
  try {
    return (await api.post(`/api/datasets/${id}/ask?horizon=${horizon}`, { question })).data;
  } catch (err: unknown) {
    const message = String((err as { message?: string })?.message ?? "");
    const responseMessage = String(
      ((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? "",
    );
    const combined = `${message} ${responseMessage}`.toLowerCase();

    if (combined.includes("no static resource") || combined.includes("/api/datasets/") && combined.includes("/ask")) {
      try {
        return (await api.post(`/api/datasets/${id}/chat?horizon=${horizon}`, { question })).data;
      } catch {
        throw new Error("Chat endpoint not available on backend. Please restart backend to load latest API routes.");
      }
    }
    throw err;
  }
}
