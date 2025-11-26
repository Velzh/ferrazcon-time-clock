import { Employee, TimeRecord } from "@/types/timeClock";

// Mock data - In-memory storage for the MVP
// This will be replaced with API calls in the future
let mockEmployees: Employee[] = [
  { id: "emp_001", name: "Ana Silva Santos" },
  { id: "emp_002", name: "Bruno Costa Oliveira" },
  { id: "emp_003", name: "Carla Mendes Lima" },
  { id: "emp_004", name: "Daniel Ferreira Souza" },
  { id: "emp_005", name: "Eduardo Martins Rocha" },
  { id: "emp_006", name: "Fernanda Alves Pereira" },
  { id: "emp_007", name: "Gabriel Santos Cruz" },
  { id: "emp_008", name: "Helena Rodrigues Nunes" },
];

let mockTimeRecords: TimeRecord[] = [];

// Future: Replace with API call
export async function getEmployees(): Promise<Employee[]> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 100));
  return [...mockEmployees];
}

// Future: Replace with API call
export async function getTimeRecordsByEmployeeAndDate(
  employeeId: string,
  date: string
): Promise<TimeRecord[]> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockTimeRecords
    .filter((record) => record.employeeId === employeeId && record.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
}

// Future: Replace with API call
export async function createTimeRecord(record: TimeRecord): Promise<TimeRecord> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 100));
  mockTimeRecords.push(record);
  return record;
}
