import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-5 py-24 text-center">
      <p className="display text-[72px] text-brand-soft" style={{ WebkitTextStroke: '1.5px var(--color-brand)' }}>404</p>
      <h1 className="display mt-2 text-[36px]">This page is not in the archive.</h1>
      <p className="mt-3 text-[14.5px] text-ink-2">The link may be old, or slightly mistyped.</p>
      <Link to="/archive" className="btn btn-dark mt-7">Back to the archive</Link>
    </div>
  );
}
