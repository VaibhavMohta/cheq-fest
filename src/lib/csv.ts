/**
 * Tiny CSV parser for the admin Players tab. Handles:
 *  - quoted fields, including ""-escaped quotes
 *  - CRLF and LF line endings
 *  - a header row that maps columns by name (case-insensitive)
 *
 * Columns recognized: email, name, phone. "email" is required.
 */

export type PlayerRow = {
  email: string;
  name: string;
  phone: string | null;
};

export type PlayerRowError = {
  rowIndex: number; // 1-based, header excluded
  message: string;
  raw: string;
};

export type ParseResult = {
  rows: PlayerRow[];
  errors: PlayerRowError[];
};

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function parsePlayersCsv(text: string): ParseResult {
  const lines = splitRows(text);
  if (lines.length === 0) return { rows: [], errors: [] };

  const headerCells = lines[0]?.map((c) => c.trim().toLowerCase()) ?? [];
  const emailIdx = headerCells.indexOf('email');
  const nameIdx = headerCells.indexOf('name');
  const phoneIdx = headerCells.indexOf('phone');

  if (emailIdx === -1) {
    return {
      rows: [],
      errors: [{ rowIndex: 0, message: 'Missing required "email" column.', raw: lines[0]?.join(',') ?? '' }],
    };
  }

  const rows: PlayerRow[] = [];
  const errors: PlayerRowError[] = [];
  const seenEmails = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (!cells || cells.every((c) => c.trim() === '')) continue;

    const raw = cells.join(',');
    const email = (cells[emailIdx] ?? '').trim();
    const name = nameIdx === -1 ? '' : (cells[nameIdx] ?? '').trim();
    const phone = phoneIdx === -1 ? null : (cells[phoneIdx] ?? '').trim() || null;

    if (!email) {
      errors.push({ rowIndex: i, message: 'Empty email.', raw });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({ rowIndex: i, message: `"${email}" is not a valid email.`, raw });
      continue;
    }
    const lower = email.toLowerCase();
    if (seenEmails.has(lower)) {
      errors.push({ rowIndex: i, message: `Duplicate email "${email}" in this file.`, raw });
      continue;
    }
    seenEmails.add(lower);
    rows.push({ email: lower, name: name || lower.split('@')[0]!, phone });
  }

  return { rows, errors };
}

function splitRows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      // Treat \r\n as one terminator.
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  // Trailing cell with no newline.
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out;
}
