import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { deleteGoal, nowISO, saveGoal } from '../../db/repo';
import { centsToInput, parseDollars } from '../../domain/format';
import { GOAL_META, GOAL_METRICS, type Goal, type GoalMetric } from '../../domain/insights';

const toInput = (g: Goal | undefined) => {
  if (!g) return '';
  const kind = GOAL_META[g.metric].kind;
  return kind === 'money'
    ? centsToInput(g.target)
    : kind === 'ratio'
      ? String(Math.round(g.target * 100))
      : String(g.target);
};

/** Monthly targets she sets herself; Insights shows progress against them. */
export function GoalsSection() {
  const { goals } = useData();
  const toast = useToast();
  const byMetric = (m: GoalMetric) => goals.find((g) => g.metric === m);
  const [draft, setDraft] = useState<Record<GoalMetric, string>>(
    () =>
      Object.fromEntries(GOAL_METRICS.map((m) => [m, toInput(byMetric(m))])) as Record<GoalMetric, string>,
  );
  const [error, setError] = useState('');
  const key = goals.map((g) => `${g.metric}:${g.target}`).join('|');
  useEffect(() => {
    setDraft(
      Object.fromEntries(GOAL_METRICS.map((m) => [m, toInput(byMetric(m))])) as Record<GoalMetric, string>,
    );
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    for (const m of GOAL_METRICS) {
      const raw = draft[m].trim();
      const kind = GOAL_META[m].kind;
      if (raw === '') {
        if (byMetric(m)) await deleteGoal(m);
        continue;
      }
      const target =
        kind === 'money'
          ? parseDollars(raw)
          : /^\d+(\.\d+)?$/.test(raw)
            ? kind === 'ratio'
              ? Number(raw) / 100
              : Math.round(Number(raw))
            : null;
      if (target == null || !(target > 0) || (kind === 'ratio' && target > 1)) {
        setError(
          `${GOAL_META[m].label}: enter ${kind === 'money' ? 'a dollar amount' : kind === 'ratio' ? 'a percentage from 1 to 100' : 'a whole number'}.`,
        );
        return;
      }
      await saveGoal({ metric: m, target, updatedAt: nowISO() });
    }
    setError('');
    toast.show('Goals saved');
  };

  return (
    <section className="panel" aria-labelledby="goals-title" id="goals">
      <h2 id="goals-title">Monthly goals</h2>
      <p className="small">
        Targets for every month. <Link to="/insights">Insights</Link> shows how this month is pacing. Leave a
        goal blank to skip it.
      </p>
      <form
        className="month-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {GOAL_METRICS.map((m) => {
          const kind = GOAL_META[m].kind;
          const input = (
            <input
              id={`g-${m}`}
              inputMode={kind === 'count' ? 'numeric' : 'decimal'}
              value={draft[m]}
              onChange={(e) => setDraft({ ...draft, [m]: e.target.value })}
            />
          );
          return (
            <div className="field" key={m}>
              <label htmlFor={`g-${m}`}>{GOAL_META[m].label}</label>
              {kind === 'money' ? (
                <div className="affix prefix">
                  <span aria-hidden="true">$</span>
                  {input}
                </div>
              ) : kind === 'ratio' ? (
                <div className="affix suffix">
                  {input}
                  <span aria-hidden="true">%</span>
                </div>
              ) : (
                input
              )}
            </div>
          );
        })}
        <div className="actions" style={{ gridColumn: '1 / -1' }}>
          <button type="submit" className="btn primary">
            Save goals
          </button>
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
