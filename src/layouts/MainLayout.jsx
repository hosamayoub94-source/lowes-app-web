// =============================================================
// MainLayout — shell rendered for every authenticated screen.
//   ┌──────────┬─────────────────────────────┐
//   │          │  Header                     │
//   │ Sidebar  ├─────────────────────────────┤
//   │ (md+)    │  <Outlet /> (page content)  │
//   │          │  ToastContainer (overlay)   │
//   └──────────┴─────────────────────────────┘
//   BottomNav (mobile only, fixed)
// =============================================================
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { ToastContainer } from './ToastContainer';
import { ToastContainer as NotifToastContainer } from '@modules/notifications';
import { useOnline } from '@hooks/useOnline';

export function MainLayout() {
  // attach online listeners once for the whole app
  useOnline();

  return (
    <div className="min-h-screen bg-cream text-text flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header />
        <main className="flex-1 px-3 sm:px-5 py-4 pb-24 md:pb-8 max-w-screen-xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <ToastContainer />
      <NotifToastContainer />
    </div>
  );
}

export default MainLayout;
