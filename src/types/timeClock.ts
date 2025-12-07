export type TimeRecordType = "ENTRADA" | "SAIDA_ALMOCO" | "VOLTA_ALMOCO" | "SAIDA_FINAL";

export interface Employee {
  id: string;
  identifier: string;
  name: string;
  email?: string | null;
  embeddingsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  type: TimeRecordType;
  timestamp: string;
  confidence?: number | null;
  deviceId?: string | null;
  photoUrl?: string | null;
  employee?: Pick<Employee, "id" | "name" | "identifier">;
}

export interface RecognitionResponse {
  matched: boolean;
  employee?: Pick<Employee, "id" | "name" | "identifier">;
  canRegister?: boolean;
  message?: string;
  nextType?: TimeRecordType;
  nextTypeLabel?: string;
  similarity?: number;
  timeEntry?: TimeEntry;
}

export const RECORD_TYPE_LABELS: Record<TimeRecordType, string> = {
  ENTRADA: "Entrada",
  SAIDA_ALMOCO: "Saída para Almoço",
  VOLTA_ALMOCO: "Volta do Almoço",
  SAIDA_FINAL: "Saída Final",
};

export const RECORD_TYPE_SEQUENCE: TimeRecordType[] = [
  "ENTRADA",
  "SAIDA_ALMOCO",
  "VOLTA_ALMOCO",
  "SAIDA_FINAL",
];
