import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// The docs name many files in `code spans` and links. When a file is renamed or removed and a doc is not updated, the
// doc quietly tells the next person something false (the architecture doc did for months). This test fails instead.
// Only tracked files count, so a doc cannot lean on a file that exists on one computer only.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let tracked = null;
try {
  tracked = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  /* not a git checkout (a downloaded zip): nothing to compare against */
}

const DOCS = [
  'FreshBliss_Master_Architecture.md',
  'docs/OPERATING_FRAMEWORK.md',
  'docs/ROADMAP.md',
  'docs/FEATURE_AUDIT.md',
  'docs/GO_LIVE.md',
  'docs/DEVELOPING.md',
  'firebase/README.md',
  'firebase/docs/AWS_SETUP.md',
  'firebase/docs/EXCEL_SYNC.md',
];

// Names that are real but never committed (settings, secrets, build output, files in S3 or made by a script).
const NOT_COMMITTED = /\.env(\.(local|production|test|staging))?$|\.env\.<|\.secret\.local|node_modules|\.next\b|\.xlsx$|firebase-debug\.log|\bwebmanifest$|^styles\/tokens\.css$|^web\/styles\/tokens\.css$/;
const FILE_LIKE = /\.(js|mjs|md|json|css|yml|yaml|rules|png|webmanifest)$/;

function existsInRepo(token) {
  const clean = token.replace(/^(\.\.?\/)+/, '').replace(/:\d+(-\d+)?$/, '');
  const isDir = clean.endsWith('/');
  return tracked.some((file) => {
    if (isDir) return file.startsWith(clean) || file.includes(`/${clean}`);
    return file === clean || file.endsWith(`/${clean}`);
  });
}

function pathsIn(markdown) {
  const out = new Set();
  for (const match of markdown.matchAll(/`([^`\n]+)`/g)) {
    const span = match[1];
    // A file the plan says is still to be written ("new `web/e2e/`") is not missing, it is not built yet.
    if (/\bnew\s+$/i.test(markdown.slice(Math.max(0, match.index - 8), match.index))) continue;
    if (/[\s<>*{}$=|(),;]|^https?:|^\/|^@|^#|^--/.test(span)) continue; // commands, routes (/orders/[id]), URLs, patterns
    // A single name with a slash (`refunds/`) is a Firestore collection, not a folder; only paths of two or more parts are checked.
    const isFolder = span.endsWith('/') && span.slice(0, -1).includes('/');
    if (!(FILE_LIKE.test(span) || isFolder)) continue;
    if (NOT_COMMITTED.test(span)) continue;
    out.add(span);
  }
  return out;
}

function linksIn(markdown) {
  return [...markdown.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)].map((m) => m[1]).filter((href) => !/^[a-z]+:/i.test(href));
}

describe('docs name only files that exist', { skip: tracked === null && 'not a git checkout' }, () => {
  for (const doc of DOCS) {
    it(doc, () => {
      const text = readFileSync(path.join(repo, doc), 'utf8');
      const missing = [...pathsIn(text)].filter((token) => !existsInRepo(token));
      assert.deepEqual(missing, [], `${doc} names files that are not in the repository`);

      const brokenLinks = linksIn(text).filter((href) => {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(doc), href));
        return !tracked.some((file) => file === target || file.startsWith(`${target}/`));
      });
      assert.deepEqual(brokenLinks, [], `${doc} links to files that are not in the repository`);
    });
  }
});
