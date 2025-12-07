import { google, sheets_v4 } from 'googleapis';

import { env } from '../config/env';
import { dayjs } from '../lib/dayjs';

export type TimeEntrySheetPayload = {
  employeeId: string;
  employeeName: string;
  type: string;
  deviceId?: string | null;
  timestamp: Date;
};

let sheetsClient: sheets_v4.Sheets | null = null;

function parseServiceAccountKey(): { client_email?: string; private_key?: string } | null {
  const rawKey = env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    return null;
  }

  try {
    const decoded = rawKey.trim().startsWith('{') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to parse Google Service Account key', error);
    return null;
  }
}

function getSheetsClient() {
  if (!env.ENABLE_SHEETS) {
    return null;
  }

  if (sheetsClient) {
    return sheetsClient;
  }

  const credentials = parseServiceAccountKey();
  if (!credentials?.client_email || !credentials?.private_key) {
    console.warn('Google Sheets disabled: missing credentials');
    return null;
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    subject: env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? credentials.client_email,
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

export async function appendTimeEntryToSheet(payload: TimeEntrySheetPayload) {
  const sheets = getSheetsClient();
  if (!sheets || !env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    return { skipped: true };
  }

  const formattedTimestamp = dayjs(payload.timestamp).tz(env.TZ).format('YYYY-MM-DD HH:mm:ss');

  const values = [[
    payload.employeeId,
    payload.employeeName,
    payload.type,
    formattedTimestamp,
    payload.deviceId ?? 'totem-local',
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${env.GOOGLE_SHEETS_TAB}!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values,
    },
  });

  return { success: true };
}
