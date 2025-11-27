export interface Employee {
  id: string;
  name: string;
}

export type TimeRecordType = "ENTRADA" | "SAIDA_ALMOCO" | "VOLTA_ALMOCO" | "SAIDA_FINAL";

export interface TimeRecord {
  id: string;
  employeeId: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm:ss"
  type: TimeRecordType;
  photoUrl?: string; // URL da foto capturada (futuramente: S3, Supabase Storage, etc.)
}

// Input para registro com foto
export interface RegisterWithPhotoInput {
  employeeId: string;
  recordType: TimeRecordType;
  date: string;
  time: string;
  photo: Blob;
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
