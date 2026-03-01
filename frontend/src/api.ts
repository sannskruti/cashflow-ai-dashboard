import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:8080",
});

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
