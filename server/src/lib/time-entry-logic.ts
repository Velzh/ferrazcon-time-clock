import { TimeEntry, TimeRecordType } from '@prisma/client';

import { env } from '../config/env';
import { dayjs } from './dayjs';

export const TIME_RECORD_SEQUENCE: TimeRecordType[] = [
  TimeRecordType.ENTRADA,
  TimeRecordType.SAIDA_ALMOCO,
  TimeRecordType.VOLTA_ALMOCO,
  TimeRecordType.SAIDA_FINAL,
];

export function getStartOfToday(): Date {
  return dayjs().tz(env.TZ).startOf('day').toDate();
}

export function getEndOfToday(): Date {
  return dayjs().tz(env.TZ).endOf('day').toDate();
}

/** Parse `YYYY-MM-DD` como data civil no fuso da aplicação (evita bug de `new Date('YYYY-MM-DD')` = UTC). */
export function parseYmdToStartOfDayInTz(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error('Data inválida: use YYYY-MM-DD');
  }
  return dayjs.tz(ymd, 'YYYY-MM-DD', env.TZ).startOf('day').toDate();
}

export function parseYmdToEndOfDayInTz(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error('Data inválida: use YYYY-MM-DD');
  }
  return dayjs.tz(ymd, 'YYYY-MM-DD', env.TZ).endOf('day').toDate();
}

export function getNextRecordType(records: Pick<TimeEntry, 'type'>[]): TimeRecordType | null {
  for (const type of TIME_RECORD_SEQUENCE) {
    if (!records.some((record) => record.type === type)) {
      return type;
    }
  }
  return null;
}

export function getRecordLabel(type: TimeRecordType): string {
  switch (type) {
    case TimeRecordType.ENTRADA:
      return 'Entrada';
    case TimeRecordType.SAIDA_ALMOCO:
      return 'Saída para Almoço';
    case TimeRecordType.VOLTA_ALMOCO:
      return 'Retorno do Almoço';
    case TimeRecordType.SAIDA_FINAL:
      return 'Saída Final';
    default:
      return type;
  }
}
