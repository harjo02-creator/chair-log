import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../../app/data';
import { useThemeKey } from '../../app/theme';
import { addMonths, monthOf, todayISO } from '../../domain/dates';
import { buildRecommendations } from '../../domain/insights';
import { monthPoint, monthSeries } from '../../domain/monthly';
import { Segmented } from '../../components/ui';
import { PeriodSection } from './PeriodSection';
import {
  FocusSection,
  GoalsSection,
  GrowthSection,
  LoyaltySection,
  PatternsSection,
  PipelineSection,
  scrollToSection,
} from './sections';

const SECTIONS = [
  ['focus', 'Focus'],
  ['goals', 'Goals'],
  ['period', 'This period'],
  ['loyalty', 'Loyalty'],
  ['pipeline', 'Pipeline'],
  ['patterns', 'Patterns'],
  ['growth', 'Growth'],
] as const;

/** Her own view of the business: what to focus on, goals, and the detail behind both. */
export function InsightsPage() {
  const { visits, catalogs, settings, monthRecords, goals } = useData();
  const themeKey = useThemeKey(settings.theme);
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const endYm = monthOf(today);
  const span = params.get('span') === '12' ? 12 : 6;

  const points = useMemo(
    () => monthSeries(endYm, span, visits, monthRecords, catalogs),
    [endYm, span, visits, monthRecords, catalogs],
  );
  const recs = useMemo(
    () =>
      buildRecommendations({
        visits,
        catalogs,
        recentMonths: monthSeries(endYm, 3, visits, monthRecords, catalogs),
        goals,
        today,
      }),
    [visits, catalogs, monthRecords, goals, endYm, today],
  );
  const thisMonth = points[points.length - 1]!;
  const lastMonth = monthPoint(addMonths(endYm, -1), visits, monthRecords, catalogs);

  return (
    <>
      <div className="sum-head">
        <div>
          <div className="eyebrow">Insights</div>
          <h2>Your book of business</h2>
        </div>
        <Segmented
          legend="Trends cover"
          name="span"
          value={String(span) as '6' | '12'}
          options={[
            { value: '6', label: '6 months' },
            { value: '12', label: '12 months' },
          ]}
          onChange={(v) =>
            setParams(
              (p) => {
                const n = new URLSearchParams(p);
                if (v === '12') n.set('span', '12');
                else n.delete('span');
                return n;
              },
              { replace: true },
            )
          }
        />
      </div>

      <nav className="jump" aria-label="Insights sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} type="button" className="btn small ghost" onClick={() => scrollToSection(id)}>
            {label}
          </button>
        ))}
      </nav>

      <FocusSection recs={recs} />
      <GoalsSection goals={goals} thisMonth={thisMonth} lastMonth={lastMonth} today={today} />
      <PeriodSection themeKey={themeKey} />
      <LoyaltySection visits={visits} catalogs={catalogs} endYm={endYm} span={span} themeKey={themeKey} />
      <PipelineSection visits={visits} catalogs={catalogs} today={today} themeKey={themeKey} />
      <PatternsSection visits={visits} points={points} today={today} themeKey={themeKey} />
      <GrowthSection
        visits={visits}
        catalogs={catalogs}
        points={points}
        endYm={endYm}
        span={span}
        themeKey={themeKey}
      />
    </>
  );
}
