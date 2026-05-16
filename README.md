# Lowe's Professional — Web (React + Vite)

Refactored from the monolithic `index_v4.html` (12,608 lines) into a scalable
React + Vite + Tailwind + Zustand architecture.

## Stack

- **Build:** Vite 5 + React 18
- **Styling:** Tailwind CSS + CSS variables (light/dark theme)
- **State:** Zustand (auth, ui, toast)
- **Routing:** React Router 6 with lazy-loaded routes
- **Backend:** Supabase (same schema as the legacy HTML — see `../supabase_schema.sql`)
- **Lang/Dir:** Arabic, RTL, Tajawal font

## Quick start

```bash
cp .env.example .env.local
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (copy from index_v4.html if needed)

npm install
npm run dev
```

Open http://localhost:5173.

## Project structure

```
src/
  components/
    ui/            ← Card, Button, Modal, BottomSheet, Toast, Badge, Avatar,
                    ProgressBar, StatCard, Hero, EmptyState, Loading
    feature/       ← TaskCard, EmployeeCard (composed UI)
  screens/         ← One file per route. Pure UI + service calls.
    auth/          ← RegisterScreen, LoginScreen, RoleSelectScreen
    admin/         ← AdminScreen + admin sub-screens (payroll, finance, ...)
    TasksScreen.jsx, AttendanceScreen.jsx, AccountingScreen.jsx,
    TeamScreen.jsx, HolidaysScreen.jsx
  layouts/         ← MainLayout, AuthLayout, Header, Sidebar, BottomNav,
                    ToastContainer
  services/        ← supabase.js + authService, employeeService, taskService,
                    attendanceService, accountingService, notificationService
  stores/          ← Zustand stores (auth, ui, toast)
  hooks/           ← useTheme, useToast, useAuth, useMediaQuery, useOnline
  context/         ← ThemeProvider (uses Zustand under the hood)
  utils/           ← date, format, classNames, currency
  data/            ← Static config: teams, roles, navigation, holidays
  styles/          ← theme.css (CSS variables) + globals.css
  routes/          ← AppRoutes, ProtectedRoute, route constants
  App.jsx
  main.jsx
```

## Architectural rules

1. **No business logic in UI components.** Components in `components/ui/` and
   `components/feature/` are presentational — they receive props and call
   handlers. All data fetching lives in `services/`. All shared state lives
   in `stores/`.
2. **One screen per file.** A screen orchestrates services + stores + UI; it
   does not own reusable JSX.
3. **CSS variables are the only source of color truth.** Tailwind classes
   resolve to those variables (`tailwind.config.js`), so light/dark mode is a
   single attribute toggle on `<html>`.
4. **Services are thin wrappers around Supabase.** They return plain data and
   throw on error — no UI side effects.
5. **Lazy-load every screen.** `routes/AppRoutes.jsx` uses `React.lazy` so the
   initial bundle stays small.

## Migration plan from `index_v4.html`

See `MIGRATION.md` (TODO) for a screen-by-screen porting checklist. This
phase ships:

- Project structure
- Layout + routing
- Reusable UI library
- Theme system
- Stores + service skeletons
- Screen stubs (one file per screen, ready to be filled)

Next phase: port screen logic from `index_v4.html` into the matching screen
file, replacing direct DOM mutation with React state and `services/` calls.
The HTML file remains the source of truth for behavior until each screen is
ported and verified against it.

## Future modules (folder structure already supports)

- `screens/crm/` — CRM module
- `screens/inventory/` — Inventory module
- `services/aiService.js` — AI features
- `services/notifications.js` — Real-time / push notifications
- React Native via `lowes-mobile/` (already exists alongside this folder)

## Scripts

| Command           | Effect                                 |
| ----------------- | -------------------------------------- |
| `npm run dev`     | Start Vite dev server on :5173         |
| `npm run build`   | Production build into `dist/`          |
| `npm run preview` | Preview the production build           |
| `npm run lint`    | ESLint over `src/**/*.{js,jsx}`        |
