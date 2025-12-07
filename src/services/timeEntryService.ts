import { TimeEntry } from '@/types/timeClock';
import { apiClient } from './apiClient';

export const timeEntryService = {
  listToday: () => apiClient.get<TimeEntry[]>('/api/time-entries/today'),
  listRecent: (limit = 20) => apiClient.get<TimeEntry[]>(`/api/time-entries/recent?limit=${limit}`),
};
