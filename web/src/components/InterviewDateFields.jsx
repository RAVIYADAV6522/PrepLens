import { FIRST_INTERVIEW_YEAR, MONTHS } from '../lib/format';

/** Interview month and year. An interview has already happened, so this year and this month are the latest choices. */
export function InterviewDateFields({ year, month, onYear, onMonth, error }) {
  const now = new Date();
  const years = Array.from({ length: now.getFullYear() + 1 - FIRST_INTERVIEW_YEAR }, (_, i) => now.getFullYear() - i);
  const lastMonth = (y) => (Number(y) === now.getFullYear() ? now.getMonth() + 1 : 12);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="month">Interview month</label>
          <select id="month" className="input" required value={month} onChange={(e) => onMonth(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {MONTHS.slice(0, lastMonth(year)).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="year">Year</label>
          <select
            id="year"
            className="input"
            value={year}
            onChange={(e) => {
              onYear(e.target.value);
              // Going back to this year can make the chosen month a future one.
              if (Number(month) > lastMonth(e.target.value)) onMonth('');
            }}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="mt-1 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}
