import { Employee, TimeRecord, RegisterWithPhotoInput } from "@/types/timeClock";

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

// Future: Replace with real storage upload (S3, Supabase Storage, Google Drive, etc.)
// and integration with Google Sheets/Excel for logging photo URLs
export async function registerWithPhoto(input: RegisterWithPhotoInput): Promise<TimeRecord> {
  // Simulate API delay for photo upload
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Generate fake storage URL - in production, this would be the actual uploaded file URL
  // Future integration points:
  // - Upload to S3/Supabase Storage/Google Drive
  // - Log photo URL to Google Sheets/Excel Online
  // - Store reference in database
  const fakePhotoUrl = `https://fake-storage.local/${input.employeeId}-${input.date}-${input.time.replace(/:/g, "-")}.jpg`;

  const record: TimeRecord = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    employeeId: input.employeeId,
    date: input.date,
    time: input.time,
    type: input.recordType,
    photoUrl: fakePhotoUrl,
  };

  mockTimeRecords.push(record);
  return record;
}
