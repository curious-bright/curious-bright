import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../src/App';

const ORIGIN = 'https://curiousbright.com.ng';
const ROOT_SHELL = '<div id="root"></div>';

interface LegalPage {
  route: string;
  title: string;
  description: string;
}

// Only these two routes are prerendered: they are the pages Google and app
// stores must be able to read without executing JavaScript.
const PAGES: LegalPage[] = [
  {
    route: '/privacy',
    title: 'Privacy Policy — Curious Bright',
    description:
      'How Curious Bright collects, uses, shares and protects your personal data, including password and Google sign-in data, your privacy rights under the Nigeria Data Protection Act 2023, the GDPR and UK GDPR, and how to contact our Data Protection Officer.',
  },
  {
    route: '/terms',
    title: 'Terms of Use — Curious Bright',
    description:
      'The rules for using Curious Bright: accounts and eligibility, institutional workspaces, content ownership and licensing, acceptable use, moderation, payments, termination and liability.',
  },
];

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

const dist = resolve(process.cwd(), 'dist');
const template = readFileSync(resolve(dist, 'index.html'), 'utf8');

if (!template.includes(ROOT_SHELL)) {
  throw new Error('prerender: dist/index.html no longer contains the <div id="root"></div> shell');
}

// react-router's Link uses useLayoutEffect, which React reports as a no-op
// during server rendering. The warning is expected here and adds noise to CI.
const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
  originalError(...args);
};

try {
  for (const page of PAGES) {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={[page.route]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const html = template
      .replace(ROOT_SHELL, `<div id="root">${markup}</div>`)
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(page.title)}</title>`)
      .replace(
        /<meta name="description"[^>]*>/,
        `<meta name="description" content="${escapeAttr(page.description)}" />`,
      )
      .replace(
        /<link rel="canonical"[^>]*>/,
        `<link rel="canonical" href="${ORIGIN}${page.route}" />`,
      );

    const directory = resolve(dist, page.route.replace(/^\//, ''));
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'index.html'), html);
    console.log(`prerendered ${page.route} -> ${directory}/index.html (${html.length} bytes)`);
  }
} finally {
  console.error = originalError;
}
