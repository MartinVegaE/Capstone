// src/lib/csv.ts
export type CsvRow = Record<string, string | number | boolean | null | undefined>;

function escapeCsv(value: any): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  const needsQuotes = /[",\n;]|^\s|\s$/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/** Genera un CSV (string) con encabezados a partir de filas de objetos planos */
export function toCsv(rows: CsvRow[], headers?: string[]): string {
  if (!rows.length) return "";
  const keys = headers && headers.length ? headers : Object.keys(rows[0]);
  const head = keys.join(",");
  const body = rows
    .map((r) => keys.map((k) => escapeCsv(r[k])).join(","))
    .join("\n");
  return `${head}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
