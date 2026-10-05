import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { LensMark, Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Feed } from './pages/Feed';
import { ExperienceDetail } from './pages/ExperienceDetail';
import { SignIn } from './pages/SignIn';
import { Welcome } from './pages/Welcome';
import { Landing } from './pages/Landing';
import { Privacy } from './pages/Privacy';
import { Submit } from './pages/Submit';
import { Profile } from './pages/Profile';
import { Admin } from './pages/Admin';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <>
      <Navbar />

      <Routes>
        {/* Public — no ProtectedRoute anywhere near these. */}
        <Route path="/" element={<Landing />} />
        <Route path="/archive" element={<Feed />} />
        <Route path="/experience/:id" element={<ExperienceDetail />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/privacy" element={<Privacy />} />

        {/* Writing requires a session. */}
        <Route path="/welcome" element={<ProtectedRoute studentOnly><Welcome /></ProtectedRoute>} />
        <Route path="/submit" element={<ProtectedRoute studentOnly><Submit /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute studentOnly><Profile /></ProtectedRoute>} />
        {/* The old path, kept so any link already shared still works. */}
        <Route path="/mine" element={<Navigate to="/profile" replace />} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>

      <footer className="mt-20 border-t border-rule bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8">
          <p className="flex items-center gap-2.5 text-[13px] text-ink-3">
            <LensMark size={22} />
            <span><span className="font-semibold text-ink-2">prepLens</span>, NST at Rishihood University. Written by seniors, for juniors.</span>
          </p>
          <p className="text-[12.5px] text-ink-3">
            Experiences belong to the students who shared them.{' '}
            <Link to="/privacy" className="font-medium text-ink-2 underline underline-offset-2 hover:text-brand">Privacy</Link>
          </p>
        </div>
      </footer>
    </>
  );
}
