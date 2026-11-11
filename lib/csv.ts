// ============================================================
// Minimal CSV parse / stringify, shared by the department console's bulk
// student upload (client) and its template + results downloads.
//
// Hand-rolled on purpose: the project has no CSV dependency, and the grammar
// needed here is small and well defined —
//   * fields separated by commas, records by \n or \r\n
//   * a quoted field may contain commas, newlines and "" (an escaped quote)
//   * a UTF-8 BOM at the start is ignored (Excel writes one)
//   * completely blank lines are skipped
// Header names are matched case-insensitively and trimmed, so "SR Code" and
// "sr_code" both work.
// ============================================================

export type CsvRecord = Record<string, string>;

/** Parse CSV text into header-keyed records. */
export function parseCsv(text: string): {
  headers: string[];
  rows: CsvRecord[];
  /** 1-based source line number for each row (header excluded). */
  lines: number[];
} {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records: string[][] = [];
  const recordLines: number[] = [];

  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let started = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    const isBlank = record.every((value) => value.trim() === "");
    if (!isBlank) {
      records.push(record);
      recordLines.push(recordStartLine);
    }
    record = [];
    started = false;
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (!started) {
      recordStartLine = line;
      started = true;
    }

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRecord();
      line++;
    } else {
      field += ch;
    }
  }

  // Final record (no trailing newline).
  if (field.length > 0 || record.length > 0) pushRecord();

  if (records.length === 0) return { headers: [], rows: [], lines: [] };

  const headers = records[0].map((h) => normaliseHeader(h));
  const rows: CsvRecord[] = [];
  const lines: number[] = [];

  for (let r = 1; r < records.length; r++) {
    const record = records[r];
    const row: CsvRecord = {};
    headers.forEach((header, index) => {
      row[header] = (record[index] ?? "").trim();
    });
    rows.push(row);
    lines.push(recordLines[r] ?? r + 1);
  }

  return { headers, rows, lines };
}

/** "SR Code" / "srCode" / "SR_CODE" → "sr_code" */
export function normaliseHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Build CSV text from rows (values are quoted when needed). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\r\n");
}

/** Trigger a browser download for CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
