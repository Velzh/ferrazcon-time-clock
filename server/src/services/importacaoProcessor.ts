import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import Tesseract from 'tesseract.js';
import { z } from 'zod';
import { env } from '../config/env';

export const folhaLinhaSchema = z.object({
  colaborador: z.string().min(1),
  horas60: z.string().optional(),
  horas100: z.string().optional(),
  noturno: z.string().optional(),
  interjornada: z.string().optional(),
  desconto: z.string().optional(),
  alocado: z.string().optional(),
  planoDeSaude: z.string().optional(),
  observacao: z.string().optional(),
});

export type FolhaLinhaParsed = z.infer<typeof folhaLinhaSchema>;

export const folhaLinhasArraySchema = z.array(folhaLinhaSchema);

export function getTipoFromFilename(filename: string): 'XLSX' | 'CSV' | 'PDF' | 'IMAGEM' | 'TXT' {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') return 'XLSX';
  if (ext === '.csv') return 'CSV';
  if (ext === '.pdf') return 'PDF';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) return 'IMAGEM';
  return 'TXT';
}

export async function extractTextFromFile(
  filePath: string,
  tipo: string,
  logs: string[]
): Promise<{ text: string; rows?: Record<string, string>[] }> {
  const buffer = fs.readFileSync(filePath);

  if (tipo === 'XLSX') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const first = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(first, { header: 1, defval: '' }) as unknown[][];
    const header = (rows[0] ?? []) as string[];
    const asObjects: Record<string, string>[] = rows.slice(1)
      .filter((r) => Array.isArray(r) && (r as unknown[]).some(Boolean))
      .map((r) => {
        const arr = r as unknown[];
        const obj: Record<string, string> = {};
        header.forEach((h, i) => {
          obj[h || `col${i}`] = String(arr[i] ?? '');
        });
        return obj;
      });
    logs.push(`XLSX: ${asObjects.length} linhas lidas`);
    const text = asObjects.map((o) => Object.values(o).join(' ')).join('\n');
    return { text, rows: asObjects };
  }

  if (tipo === 'CSV') {
    const content = buffer.toString('utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
    logs.push(`CSV: ${records.length} linhas lidas`);
    const text = records.map((r) => Object.values(r).join(' ')).join('\n');
    return { text, rows: records };
  }

  if (tipo === 'PDF') {
    try {
      const data = await pdfParse(buffer);
      logs.push(`PDF: ${data.numpages} página(s), ${data.text.length} caracteres`);
      return { text: data.text };
    } catch (e) {
      logs.push(`PDF texto falhou, tentando OCR: ${(e as Error).message}`);
      const imageBuf = buffer;
      const { data } = await Tesseract.recognize(imageBuf, 'por');
      return { text: data.text };
    }
  }

  if (tipo === 'IMAGEM') {
    const { data } = await Tesseract.recognize(buffer, 'por');
    logs.push(`OCR: ${data.text.length} caracteres`);
    return { text: data.text };
  }

  const text = buffer.toString('utf-8');
  logs.push(`TXT: ${text.length} caracteres`);
  return { text };
}

const SYSTEM_PROMPT = `Você é um assistente que normaliza dados de folha de pagamento para JSON.
Receba o texto extraído de um documento (planilha, PDF ou imagem) e retorne APENAS um array JSON de objetos, um por colaborador.
Cada objeto deve ter exatamente estes campos (use string vazia ou omita se não houver):
- colaborador (string, nome do colaborador, obrigatório)
- horas60 (string)
- horas100 (string)
- noturno (string)
- interjornada (string)
- desconto (string)
- alocado (string)
- planoDeSaude (string)
- observacao (string)
Retorne somente o array JSON, sem markdown e sem texto antes ou depois. Exemplo: [{"colaborador":"João Silva","horas60":"40","horas100":""}]`;

export async function normalizeWithAI(text: string, logs: string[]): Promise<FolhaLinhaParsed[]> {
  if (!env.OPENAI_API_KEY) {
    logs.push('OPENAI_API_KEY não configurado; pulando normalização por IA');
    return [];
  }

  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text.slice(0, 12000) },
    ],
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content?.trim() ?? '';
  logs.push(`IA respondeu com ${content.length} caracteres`);

  const jsonMatch = content.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim();
  const parsed = JSON.parse(jsonMatch) as unknown[];
  const result = folhaLinhasArraySchema.parse(parsed);
  logs.push(`IA: ${result.length} linhas validadas com Zod`);
  return result;
}

/** Converte linhas brutas (objetos com chaves variadas) em FolhaLinhaParsed por heurística */
export function mapRowsToLinhas(rows: Record<string, string>[]): FolhaLinhaParsed[] {
  const linhas: FolhaLinhaParsed[] = [];
  const lower = (s: string) => s.toLowerCase().trim();

  for (const row of rows) {
    const keys = Object.keys(row);
    const colaboradorKey = keys.find((k) => lower(k).includes('colaborador') || lower(k).includes('nome') || lower(k) === 'nome' || lower(k) === 'funcionário');
    const colaborador = colaboradorKey ? String(row[colaboradorKey] ?? '').trim() : Object.values(row)[0] ?? '';
    if (!colaborador) continue;

    const get = (patterns: string[]) => {
      for (const p of patterns) {
        const k = keys.find((k) => lower(k).includes(p) || lower(k) === p);
        if (k) return String(row[k] ?? '').trim();
      }
      return '';
    };

    linhas.push({
      colaborador,
      horas60: get(['horas 60', '60%', 'horas60']),
      horas100: get(['horas 100', '100%', 'horas100']),
      noturno: get(['noturno']),
      interjornada: get(['interjornada']),
      desconto: get(['desconto']),
      alocado: get(['alocado']),
      planoDeSaude: get(['plano', 'saude', 'planoDeSaude']),
      observacao: get(['observacao', 'obs']),
    });
  }

  return linhas;
}
