import { apiClient, API_BASE_URL } from './apiClient';

export type FolhaLinha = {
  COLABORADOR: string;
  'HORAS 60%': string;
  'HORAS 100%': string;
  NOTURNO: string;
  INTERJORNADA: string;
  DESCONTO: string;
  ALOCADO: string;
  'PLANO DE SAUDE': string;
  OBSERVACAO: string;
  STATUS: string;
};

export type FolhaExportResponse = { ano: number; mes: number; linhas: FolhaLinha[] };

function exportUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, '');
  if ((base === '/api' || base.endsWith('/api')) && path.startsWith('/api/')) {
    return `${base}${path.slice(4)}`;
  }
  return `${base}${path}`;
}

export const folhaService = {
  list: (ano: number, mes: number) =>
    apiClient.get<unknown[]>(`/api/folha?ano=${ano}&mes=${mes}`),

  exportFolha: async (ano: number, mes: number, format: 'json' | 'csv') => {
    const url = exportUrl(`/api/folha/export?ano=${ano}&mes=${mes}&format=${format}`);
    const token = localStorage.getItem('fzc-auth-token');
    const empresaId = localStorage.getItem('fzc-selected-empresa-id');
    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (empresaId) headers['X-Empresa-Id'] = empresaId;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(await res.text().catch(() => 'Erro ao exportar'));
    const blob = await res.blob();
    const filename = `folha-${ano}-${String(mes).padStart(2, '0')}.${format === 'csv' ? 'csv' : 'json'}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
