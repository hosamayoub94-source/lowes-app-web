// =============================================================
// App — top-level component. Wires the router, theme bootstrap,
// and auth provider. Core layer modules are excluded from this
// build until they are fully committed to the repository.
// =============================================================
import { BrowserRouter } from 'react-router-dom';
import { ThemeBoot }     from '@context/ThemeBoot';
import { AuthBoot }      from '@context/AuthBoot';
import { AppRoutes }     from '@routes/AppRoutes';
import { MockModeBanner } from '@components/dev/MockModeBanner';
import { ErrorBoundary } from '@components/ui/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeBoot>
        <AuthBoot>
          <BrowserRouter>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
            <MockModeBanner />
          </BrowserRouter>
        </AuthBoot>
      </ThemeBoot>
    </ErrorBoundary>
  );
}
