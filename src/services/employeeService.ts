import { Employee } from '@/types/timeClock';
import { apiClient } from './apiClient';

interface CreateEmployeePayload {
  identifier: string;
  name: string;
  email?: string;
}

interface EnrollmentPayload {
  embeddings: number[][];
  algorithm?: string;
  version?: string;
  sourcePhotoUrl?: string;
}

export const employeeService = {
  list: () => apiClient.get<Employee[]>('/api/employees'),
  create: (payload: CreateEmployeePayload) => apiClient.post<Employee>('/api/employees', payload),
  enroll: (employeeId: string, payload: EnrollmentPayload) =>
    apiClient.post(`/api/employees/${employeeId}/enrollments`, payload),
  clearEnrollments: (employeeId: string) =>
    apiClient.delete(`/api/employees/${employeeId}/enrollments`),
  remove: (employeeId: string) => apiClient.delete(`/api/employees/${employeeId}`),
  export: (employeeId: string) => apiClient.get(`/api/employees/${employeeId}/export`),
};
