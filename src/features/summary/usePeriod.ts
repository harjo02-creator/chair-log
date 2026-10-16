import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isValidISODate, monthOf, todayISO } from '../../domain/dates';
import { defaultMonth, monthsWithVisits } from '../../domain/metrics';
import { customPeriod, monthPeriod, ytdPeriod, type Period, type PeriodMode } from '../../domain/summary';
import type { Visit } from '../../domain/types';

/** Period + retention window live in the URL so the report link and back button keep them. */
export function usePeriod(visits: Visit[]) {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const months = useMemo(() => monthsWithVisits(visits), [visits]);

  const mode = (
    ['month', 'ytd', 'custom'].includes(params.get('mode') ?? '') ? params.get('mode') : 'month'
  ) as PeriodMode;
  const ymParam = params.get('m');
  const ym = ymParam && /^\d{4}-\d{2}$/.test(ymParam) ? ymParam : defaultMonth(months, today);
  const startP = params.get('start');
  const endP = params.get('end');
  const start = startP && isValidISODate(startP) ? startP : `${monthOf(today)}-01`;
  const end = endP && isValidISODate(endP) ? endP : today;
  const rolling = params.get('ret') === 'rolling';

  const period: Period =
    mode === 'ytd' ? ytdPeriod(today) : mode === 'custom' ? customPeriod(start, end) : monthPeriod(ym);

  const set = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch))
          if (v == null) n.delete(k);
          else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  // The month list always includes the current month and the selected one.
  const current = monthOf(today);
  const monthOptions = [...new Set([...months, current, ym])].sort().reverse();

  return { period, mode, ym, start, end, rolling, set, monthOptions, current, query: params.toString() };
}
