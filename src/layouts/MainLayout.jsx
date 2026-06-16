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
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import CommandPalette from '@components/ui/CommandPalette';
import { ToastContainer } from './ToastContainer';
import { ToastContainer as NotifToastContainer } from '@modules/notifications';
import { useOnline }             from '@hooks/useOnline';
import { useCelebrations }        from '@hooks/useCelebrations';
import { usePushNotifications }      from '@hooks/usePushNotifications';
import { useTaskDueSoonAlerts }      from '@hooks/useTaskDueSoonAlerts';
import { useKpiMonthReminder }           from '@hooks/useKpiMonthReminder';
import { useAutoAttendanceReminder }     from '@hooks/useAutoAttendanceReminder';
import { InstallPrompt }             from '@components/ui/InstallPrompt';
import { PushPermissionPrompt }      from '@components/ui/PushPermissionPrompt';
import { AIAssistantWidget }         from '@components/ai/AIAssistantWidget';

export function MainLayout() {
  // attach online listeners once for the whole app
  useOnline();
  // auto-post birthday / anniversary announcements (admin + manager only)
  useCelebrations();
  // browser push notifications for chat messages + announcements
  usePushNotifications();
  // in-app alerts for tasks due in 1–3 days
  useTaskDueSoonAlerts();
  // remind managers to enter last month's KPI on days 1–5
  useKpiMonthReminder();
  // remind all users to check in if they haven't after 90s
  useAutoAttendanceReminder();

  // مشغّل البحث السريع (Command Palette) — يُفتح بزر الهيدر أو Ctrl/Cmd+K.
  const [cmdOpen, setCmdOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCmdOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen bg-cream text-text flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header onOpenSearch={() => setCmdOpen(true)} />
        <main className="flex-1 px-3 sm:px-5 py-4 pb-28 md:pb-8 max-w-screen-xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <BottomNav />
      <ToastContainer />
      <NotifToastContainer />
      <InstallPrompt />
      <PushPermissionPrompt />
      <AIAssistantWidget />
    </div>
  );
}

export default MainLayout;
