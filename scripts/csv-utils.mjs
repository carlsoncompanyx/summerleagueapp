export function parseCsvRows(text) {
  const rows = [];
  let row = [];
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
      row.push(field.trim());
      field = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((v) => v.length > 0)) rows.push(row);
  }

  return rows;
}

export function parseCsvAsObjects(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const [headers, ...body] = rows;
  return body.map((cols) => {
    const out = {};
    headers.forEach((h, idx) => {
      out[h] = cols[idx] ?? '';
    });
    return out;
  });
}
