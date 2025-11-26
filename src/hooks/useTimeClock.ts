import { useState, useEffect } from "react";
import { Employee, TimeRecord } from "@/types/timeClock";
import { getEmployees, getTimeRecordsByEmployeeAndDate, createTimeRecord } from "@/services/timeClockService";
import { getTodayDateString, getNextRecordTypeForEmployee, generateRecordId, getCurrentTimeString } from "@/utils/timeClockUtils";

export function useTimeClock() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [todayRecords, setTodayRecords] = useState<TimeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load employees on mount
  useEffect(() => {
    loadEmployees();
  }, []);

  // Load today's records when employee changes
  useEffect(() => {
    if (selectedEmployeeId) {
      loadTodayRecords();
    } else {
      setTodayRecords([]);
    }
  }, [selectedEmployeeId]);

  async function loadEmployees() {
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error("Error loading employees:", error);
    }
  }

  async function loadTodayRecords() {
    if (!selectedEmployeeId) return;

    try {
      setIsLoading(true);
      const today = getTodayDateString();
      const records = await getTimeRecordsByEmployeeAndDate(selectedEmployeeId, today);
      setTodayRecords(records);
    } catch (error) {
      console.error("Error loading today's records:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function registerTimeRecord(): Promise<{ success: boolean; message: string; type?: string }> {
    if (!selectedEmployeeId) {
      return {
        success: false,
        message: "Selecione um colaborador antes de registrar o ponto.",
      };
    }

    const nextType = getNextRecordTypeForEmployee(todayRecords);

    if (!nextType) {
      return {
        success: false,
        message: "Você já registrou todos os horários de hoje.",
      };
    }

    try {
      setIsLoading(true);
      const newRecord: TimeRecord = {
        id: generateRecordId(),
        employeeId: selectedEmployeeId,
        date: getTodayDateString(),
        time: getCurrentTimeString(),
        type: nextType,
      };

      await createTimeRecord(newRecord);
      await loadTodayRecords();

      return {
        success: true,
        message: `${getRecordTypeLabel(nextType)} registrada às ${newRecord.time}`,
        type: nextType,
      };
    } catch (error) {
      console.error("Error registering time record:", error);
      return {
        success: false,
        message: "Erro ao registrar ponto. Tente novamente.",
      };
    } finally {
      setIsLoading(false);
    }
  }

  function getRecordTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      ENTRADA: "Entrada",
      SAIDA_ALMOCO: "Saída para Almoço",
      VOLTA_ALMOCO: "Volta do Almoço",
      SAIDA_FINAL: "Saída Final",
    };
    return labels[type] || type;
  }

  const nextRecordType = getNextRecordTypeForEmployee(todayRecords);

  return {
    employees,
    selectedEmployeeId,
    setSelectedEmployeeId,
    todayRecords,
    isLoading,
    registerTimeRecord,
    nextRecordType,
    getRecordTypeLabel,
  };
}
