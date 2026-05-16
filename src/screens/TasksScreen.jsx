// =============================================================
// TasksScreen — thin shell that mounts the Tasks module.
// All logic, state, and rendering delegated to TasksPage.
// =============================================================
import { TasksPage } from '@modules/tasks';

export default function TasksScreen() {
  return <TasksPage />;
}
