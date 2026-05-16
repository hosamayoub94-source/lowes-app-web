// =============================================================
// App — top-level component. Wires the router, theme bootstrap,
// and auth provider. Core layer modules are excluded from this
// build until they are fully committed to the repository.
// =============================================================
import { BrowserRouter } from 'react-router-dom';
import { ThemeBoot }     from '@context/ThemeBoot';
import { AuthBoot }      from '@context/AuthBoot';
import { AppRoutes }     from '@routes/AppRoutes';

export default function App() {
  return (
    <ThemeBoot>
      <AuthBoot>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthBoot>
    </ThemeBoot>
  );
}
