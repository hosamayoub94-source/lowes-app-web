// =============================================================
// AuthLayout — minimal full-screen layout for login/register.
// =============================================================
import { Outlet } from 'react-router-dom';
import { ToastContainer } from './ToastContainer';

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-surface to-surface-alt text-text">
      <main className="min-h-screen grid place-items-center px-4 py-8">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
}

export default AuthLayout;
