// ESLint, with Next.js's own recommended rules (React, hooks, accessibility, Core Web Vitals).
// Run it with:  npm run lint
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([...nextVitals, globalIgnores(['.next/**', 'out/**', 'build/**', 'node_modules/**'])]);
