// =============================================================
// AuthLayout — minimal full-screen layout for login/register.
// =============================================================
import { Outlet } from 'react-router-dom';
import { ToastContainer } from './ToastContainer';

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-surface to-surface-alt text-text">
      {/* شريط ذهبي علوي — لمسة الهوية الرسمية */}
      <div style={{ height: '4px', background: 'linear-gradient(90deg, #C9A646, #E5C97A, #C9A646)' }} />
      <main className="min-h-screen grid place-items-center px-4 py-8">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
}

export default AuthLayout;
