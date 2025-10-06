import { api } from "../api";

async function downloadCSV(path: string, filename: string) {
  const res = await api.get(path, { responseType: "blob" });
  const blob = res.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function descargarPPP() {
  const ts = new Date().toISOString().slice(0, 10);
  return downloadCSV("/reportes/ppp.csv", `ppp_${ts}.csv`);
}

export function descargarPPPHistorico() {
  const ts = new Date().toISOString().slice(0, 10);
  return downloadCSV("/reportes/ppp_historico.csv", `ppp_historico_${ts}.csv`);
}
