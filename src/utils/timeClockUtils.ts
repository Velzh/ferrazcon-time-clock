import { TimeRecord, TimeRecordType, RECORD_TYPE_SEQUENCE } from "@/types/timeClock";

export function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCurrentTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function formatDateBR(dateString: string): string {
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

export function getNextRecordTypeForEmployee(recordsOfDay: TimeRecord[]): TimeRecordType | null {
  if (recordsOfDay.length === 0) {
    return "ENTRADA";
  }

  if (recordsOfDay.length >= 4) {
    return null; // All records completed
  }

  const lastRecord = recordsOfDay[recordsOfDay.length - 1];
  const currentIndex = RECORD_TYPE_SEQUENCE.indexOf(lastRecord.type);
  
  if (currentIndex === -1 || currentIndex === RECORD_TYPE_SEQUENCE.length - 1) {
    return null;
  }

  return RECORD_TYPE_SEQUENCE[currentIndex + 1];
}

export function generateRecordId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
