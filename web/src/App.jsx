import { Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Feed } from './pages/Feed';
import { ExperienceDetail } from './pages/ExperienceDetail';
import { SignIn } from './pages/SignIn';
import { Welcome } from './pages/Welcome';
import { Submit } from './pages/Submit';
import { Mine } from './pages/Mine';
import { Admin } from './pages/Admin';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <>
      <Navbar />

      <Routes>
        {/* Public — no ProtectedRoute anywhere near these. */}
        <Route path="/" element={<Feed />} />
        <Route path="/experience/:id" element={<ExperienceDetail />} />
        <Route path="/signin" element={<SignIn />} />

        {/* Writing requires a session. */}
        <Route path="/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
        <Route path="/submit" element={<ProtectedRoute><Submit /></ProtectedRoute>} />
        <Route path="/mine" element={<ProtectedRoute><Mine /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>

      <footer className="mt-20 border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8">
          <p className="font-mono text-[11.5px] text-ink-3">
            prepLens · NST, Rishihood University · written by seniors, for juniors
          </p>
          <p className="font-mono text-[11.5px] text-ink-3">
            Experiences belong to the students who shared them.
          </p>
        </div>
      </footer>
    </>
  );
}
