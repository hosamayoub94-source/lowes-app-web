// Guards against a JSX nesting mistake that builds fine but silently breaks routing:
// every <Route> must be a direct child of <Routes> or another <Route> (never inside ProtectedRoute/elements),
// and every path constant used by a <Route> must be unique.
import fs from 'node:fs';
import { parse } from '@babel/parser';

const file = process.argv[2] || 'src/routes/AppRoutes.jsx';
const src = fs.readFileSync(file, 'utf8');
const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
const nameOf = n => (n.openingElement.name.type === 'JSXIdentifier' ? n.openingElement.name.name : null);
const problems = [], paths = [];
let routes = 0;
(function walk(node, parentJsx) {
  if (!node || typeof node.type !== 'string') return;
  let nextParent = parentJsx;
  if (node.type === 'JSXElement') {
    const name = nameOf(node);
    if (name === 'Route') {
      routes++;
      if (parentJsx && !['Routes', 'Route'].includes(parentJsx)) problems.push(`<Route> nested inside <${parentJsx}> at line ${node.loc.start.line}`);
      const p = node.openingElement.attributes.find(a => a.name?.name === 'path');
      if (p?.value) paths.push(src.slice(p.value.start, p.value.end));
    }
    nextParent = name;
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => walk(c, nextParent)); else if (v && typeof v.type === 'string') walk(v, nextParent);
  }
})(ast.program, null);
const dup = paths.filter((p, i) => paths.indexOf(p) !== i);
if (dup.length) problems.push('duplicate route paths: ' + [...new Set(dup)].join(', '));
const need = ['ROUTES.CREATORS}', 'ROUTES.CREATORS_WORKBENCH}', 'ROUTES.SYRIA_LEADS}'];
need.forEach(n => { if (!paths.some(p => p.includes(n))) problems.push('missing route ' + n); });
console.log(`routes checked: ${routes}; problems: ${problems.length}`);
problems.forEach(p => console.log(' -', p));
process.exit(problems.length ? 1 : 0);
