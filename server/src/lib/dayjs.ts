import dayjsBase from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

import { env } from '../config/env';

dayjsBase.extend(utc);
dayjsBase.extend(timezone);

dayjsBase.tz.setDefault(env.TZ);

export const dayjs = dayjsBase;
