import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patch, toFormError } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { BRANCHES } from '../lib/format';

/**
 * The one-time profile step (spec AUTH-06).
 *
 * Batch and branch are collected once and then SNAPSHOTTED onto every
 * experience, which is why they are asked for before posting rather than typed
 * into the submit form each time. It is also why an anonymous post can still
 * say "Anonymous · 2027" truthfully.
 */
export function Welcome() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [batch, setBatch] = useState('');
  const [branch, setBranch] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await patch('/auth/profile', { graduationBatch: Number(batch), branch });
      await refresh();
      navigate('/submit');
    } catch (err) {
      setError(toFormError(err));
    } finally {
      setSaving(false);
    }
  }

  const years = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <p className="eyebrow">// One last thing</p>
      <h1 className="display mt-4 text-[34px]">Welcome, {user?.name?.split(' ')[0]}.</h1>
      <p className="mt-4 text-[15px] text-ink-2">
        Two details, asked once. They appear on the experiences you share — and they are what lets
        an anonymous post still say which batch it came from.
      </p>

      <form onSubmit={save} className="panel mt-8 space-y-5 p-6">
        <div>
          <label className="field-label" htmlFor="batch">Graduation batch</label>
          <select id="batch" className="input" value={batch} onChange={(e) => setBatch(e.target.value)} required>
            <option value="">Select your batch…</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {error?.fields?.graduationBatch && (
            <p className="mt-1 text-[12.5px] text-bad">{error.fields.graduationBatch}</p>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="branch">Branch</label>
          <select id="branch" className="input" value={branch} onChange={(e) => setBranch(e.target.value)} required>
            <option value="">Select your branch…</option>
            {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {error?.fields?.branch && <p className="mt-1 text-[12.5px] text-bad">{error.fields.branch}</p>}
        </div>

        {error && !Object.keys(error.fields ?? {}).length && (
          <p className="text-[13px] text-bad">{error.message}</p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={saving || !batch || !branch}>
          {saving ? 'Saving…' : 'Continue →'}
        </button>
      </form>
    </div>
  );
}
