export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ',') {
      current.push(field.trim());
      field = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      current.push(field.trim());
      field = '';
      if (current.some((v) => v.length > 0)) rows.push(current);
      current = [];
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field.trim());
    if (current.some((v) => v.length > 0)) rows.push(current);
  }

  if (!rows.length) return { headers: [], rows: [] };
  const [headers, ...body] = rows;
  return { headers, rows: body.map((r) => headers.map((_, idx) => r[idx] ?? '')) };
}
