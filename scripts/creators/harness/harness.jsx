// DEV-ONLY harness: mounts the Creator Workbench without login, without Supabase, on a throw-away localStorage prefix.
// Open via the Vite dev server:  /scripts/creators/harness/workbench.html   (never shipped: not part of the app bundle)
import { createRoot } from 'react-dom/client';
import '../../../src/styles/theme.css';
import '../../../src/styles/globals.css';
import CreatorWorkbench from '../../../src/components/creators/CreatorWorkbench.jsx';
import { createLocalStore } from '../../../src/services/creatorReviewStore.js';

const store = createLocalStore(window.localStorage, 'harness:creators:');
window.__store = store;
createRoot(document.getElementById('root')).render(
  <div className="p-4 max-w-3xl mx-auto"><CreatorWorkbench reviewer="Rana" store={store} reviewers={['Rana', 'Dima', 'Sami']} /></div>
);
