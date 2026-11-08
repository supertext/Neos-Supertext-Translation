#!/usr/bin/env node
/**
 * Records the install and configuration movie (MP4 only, no GIF) from a FRESH local demo whose
 * package talks to stand-in.mjs, like movie.mjs, but without the demo's language preset (no
 * `demo:ensurelanguages`, so Administration → Supertext shows Supertext's suggestions). An
 * administrator installs the package (terminal: Composer, the API key in Settings.yaml, cache
 * flush, `supertext:check`), chooses German (Switzerland) for Deutsch under Administration →
 * Supertext and shows where editors translate. See "Demo movie" in docs/DEVELOPER.md.
 *
 *   BASE_URL=http://127.0.0.1:8097 DEMO_ADMIN_EMAIL=… DEMO_ADMIN_PASSWORD=… npm run movie:install
 *
 * The terminal shows the made-up key st-demo-0000-0000-0000 (the stand-in accepts any key).
 * MOVIE_VOICE=0 makes a silent movie. MOVIE_OUT: where the MP4 goes (default
 * Tests/Docs/movie/out/Neos-Supertext-Translation-install.mp4, git-ignored). Needs ffmpeg.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MovieKit } from './movie/movie-kit.mjs';

const B = (process.env.BASE_URL ?? 'http://127.0.0.1:8097').replace(/\/$/, '');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = process.env.MOVIE_OUT ?? here('movie/out/Neos-Supertext-Translation-install.mp4');
const need = (name) => process.env[name] ?? (() => { throw new Error(`Set ${name}`); })();
const FAKE_KEY = 'st-demo-0000-0000-0000';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' });

// Sign in as the demo administrator (not recorded): configuration is an administrator's task.
await page.goto(`${B}/neos/login`);
await page.fill('input[type=text]', need('DEMO_ADMIN_EMAIL'));
await page.fill('input[type=password]', need('DEMO_ADMIN_PASSWORD'));
await page.click('button[type=submit]');
await page.waitForURL(/\/neos\//, { timeout: 60000 });
await page.getByText('Document Tree').first().waitFor({ timeout: 60000 });

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neos-movie-install-'));
await page.goto('about:blank');
const kit = await MovieKit.start(page, { workDir, assets: here('movie/assets'), voiceCache: here('movie/voice-cache') });

/** More commands in the terminal kit.terminal() opened (same look; kit.terminal() would start a new one). */
async function typeMore(lines) {
  await page.evaluate(() => document.querySelector('#x > .p.c:last-child')?.remove());
  for (const l of lines) {
    if (l.cmd !== undefined) {
      await page.evaluate(() => { const x = document.getElementById('x');
        const p = document.createElement('span'); p.className = 'p'; p.textContent = '$ '; x.appendChild(p);
        const c = document.createElement('span'); c.className = 'c'; x.appendChild(c); });
      for (const ch of l.cmd) { await page.evaluate((ch) => { document.querySelector('#x .c').textContent += ch; }, ch); await page.waitForTimeout(38); }
      await page.waitForTimeout(450);
      await page.evaluate(() => { document.querySelector('#x .c').classList.remove('c'); document.getElementById('x').append('\n'); });
    } else {
      await page.evaluate((o) => { const s = document.createElement('span'); s.className = 'o'; s.textContent = o + '\n'; document.getElementById('x').appendChild(s); }, l.out ?? '');
      await page.waitForTimeout(l.wait ?? 180);
    }
  }
  await page.evaluate(() => { const c = document.createElement('span'); c.className = 'p c'; c.textContent = '$ '; document.getElementById('x').appendChild(c); });
}

// 1. Terminal: the commands from docs/INSTALLATION.md (output shortened).
await kit.say("First, in your Neos project, add Supertext's GitHub repository to the Composer configuration. The package isn't on Packagist yet.", {
  caption: 'Add the repository to <b>Composer</b>',
  during: () => kit.terminal({ title: 'my-site', lines: [
    { cmd: 'composer config repositories.supertext-neos vcs https://github.com/Supertext/Neos-Supertext-Translation' },
  ] }),
});
await kit.say('Then require the package. Composer installs it, with the Supertext SDK already bundled.', {
  caption: '<b>composer require</b> the package',
  during: () => typeMore([
    { cmd: 'composer require supertext/neos-translation:dev-main' },
    { out: 'Lock file operations: 1 install, 0 updates, 0 removals' },
    { out: '  - Locking supertext/neos-translation (dev-main)' },
    { out: '  - Installing supertext/neos-translation (dev-main)' },
  ]),
});
await kit.say('Generate your API key at supertext.com, under Integrations, A P I. No account yet? Create one at supertext.com.', {
  caption: 'API key: <b>supertext.com → Integrations → API</b><br>No account yet? Create one at <b>supertext.com</b>',
  during: async () => {
    await kit.hold(1200);
    await typeMore([
      { cmd: 'cat Configuration/Settings.yaml' },
      { out: 'Supertext:' },
      { out: '  NeosTranslation:' },
      { out: `    apiKey: '${FAKE_KEY}'` },
    ]);
  },
});
await kit.say('Put the key into your Settings, or set the environment variable SUPERTEXT_API_KEY. There are no database migrations: just flush the caches.', {
  caption: 'Key in <b>Settings.yaml</b> (or <b>SUPERTEXT_API_KEY</b>), then <b>flow:cache:flush</b>',
  during: () => typeMore([
    { cmd: './flow flow:cache:flush' },
    { out: 'Flushed all caches for "Production" context.' },
  ]),
});
await kit.say('Then check the setup. The connection to Supertext works.', {
  caption: '<b>supertext:check</b>: the connection to Supertext works',
  during: () => kit.terminal({ title: 'my-site', lines: [
    { cmd: './flow supertext:check' },
    { out: 'Supertext Translation for Neos dev-main' },
    { out: 'Endpoint: https://api.supertext.com/v1/' },
    { out: '' },
    { out: 'Languages (dimension value → Supertext code):' },
    { out: '  en_US → en-US' },
    { out: '  de → de-DE' },
    { out: '  fr → fr-FR' },
    { out: '  it → it-IT' },
    { out: '' },
    { out: 'API key checked: the connection to Supertext works.', wait: 600 },
  ] }),
});
await kit.hold(300);

// 2. The back end as administrator (loading time cut).
kit.pause();
await page.goto(`${B}/neos/content`);
await page.getByText('Document Tree').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await kit.sync();
kit.resume();
const menuButton = page.locator('#neos-MenuToggler');
const supertextModule = page.locator('a[href*="/neos/administration/supertext"]').first();
await kit.say('Now sign in to Neos as an administrator. In the menu, open Administration, Supertext.', {
  caption: 'Menu → <b>Administration → Supertext</b>',
  during: async () => {
    await kit.click(menuButton);
    await supertextModule.waitFor({ state: 'visible' });
    await kit.hold(900); // the menu slides in
    await kit.moveTo(supertextModule);
    await page.evaluate(([x, y]) => window.__stk?.ripple(x, y), [kit.cursor.x, kit.cursor.y]);
    await Promise.all([page.waitForURL(/administration\/supertext/), supertextModule.click()]);
    await page.locator('#supertext-mapping').waitFor();
    await kit.sync();
  },
});

// 3. The language mapping.
const row = (value) => page.locator(`tr.supertext-mapping-row[data-value="${value}"]`);
const german = row('de').locator('select.supertext-code');
await kit.say('Here, each language of your site gets its Supertext language. Supertext suggests one where the choice is obvious.', {
  caption: 'One <b>Supertext language</b> per language, Supertext’s suggestion preselected',
  during: async () => { await kit.hold(600); await kit.moveTo(row('en_US').locator('select.supertext-code')); await kit.hold(500); await kit.moveTo(german); },
});
await kit.say('For Deutsch, we choose German, Switzerland.', {
  caption: 'Deutsch → <b>German (Switzerland) (de-CH)</b>',
  during: async () => {
    await kit.click(german);
    await kit.hold(500);
    await german.selectOption('de-CH');
    await german.blur();
    await kit.sync();
  },
});
const review = row('de').locator('label.neos-checkbox').first();
await kit.say('Translation review can be switched on per language. We leave it off.', {
  caption: '<b>Translation review</b>: optional, per language (left off)',
  during: async () => { await kit.hold(300); await kit.moveTo(review); },
});
const save = page.locator('#supertext-mapping input[type=submit]');
await kit.say('Click Save to store the languages.', {
  caption: 'Click <b>Save</b>',
  during: async () => {
    await kit.moveTo(save);
    await page.evaluate(([x, y]) => window.__stk?.ripple(x, y), [kit.cursor.x, kit.cursor.y]);
    await Promise.all([page.waitForLoadState('load'), page.waitForResponse((r) => r.request().method() === 'POST'), save.click()]);
    await page.locator('#supertext-mapping').waitFor();
    await kit.sync();
  },
});

// 4. Where editors translate: Neos's own language menu.
kit.pause();
await page.goto(`${B}/neos/content`);
await page.getByText('Document Tree').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await kit.sync();
kit.resume();
const languageButton = page.getByRole('button', { name: /English \(US\)/ }).first();
await kit.say("That's it. Editors switch the language menu to a new language and choose Create and copy. Supertext translates the page.", {
  caption: 'Editors: <b>language menu</b> → <b>Create and copy</b>',
  during: async () => {
    await kit.hold(500);
    await kit.click(languageButton);
    await page.getByText('Italiano', { exact: true }).last().waitFor();
    await kit.hold(600);
    await kit.moveTo(page.getByText('Italiano', { exact: true }).last());
  },
  after: 200,
});
await kit.caption('');

fs.mkdirSync(path.dirname(out), { recursive: true });
await kit.finish(out, { system: 'Neos', repo: 'Neos-Supertext-Translation', kind: 'install' });
await browser.close();
fs.rmSync(workDir, { recursive: true, force: true });
console.log(`Saved ${out}`);
