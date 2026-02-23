import { TimeEntry } from '@/types/timeClock';
import { apiClient } from './apiClient';

export type TimeEntriesPeriodParams = {
  from?: string; // YYYY-MM-DD
  to?: string;
  limit?: number;
};

export const timeEntryService = {
  listToday: () => apiClient.get<TimeEntry[]>('/api/time-entries/today'),
  listRecent: (limit = 20) => apiClient.get<TimeEntry[]>(`/api/time-entries/recent?limit=${limit}`),
  listByPeriod: (params: TimeEntriesPeriodParams) => {
    const sp = new URLSearchParams();
    if (params.from) sp.set('from', params.from);
    if (params.to) sp.set('to', params.to);
    if (params.limit) sp.set('limit', String(params.limit));
    return apiClient.get<TimeEntry[]>(`/api/time-entries?${sp.toString()}`);
  },
};
