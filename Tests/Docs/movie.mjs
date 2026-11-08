#!/usr/bin/env node
/**
 * Records the demo movie (docs/images/demo.gif and an MP4) from a FRESH local demo whose
 * package talks to stand-in.mjs (SUPERTEXT_API_ENDPOINT=http://127.0.0.1:8765/v1/), like
 * screenshots.mjs. The editor opens "Text & images" in English, switches the language menu to
 * a language the page doesn't exist in yet, chooses "Create and copy" and checks the
 * translated page. See "Demo movie" in docs/DEVELOPER.md.
 *
 *   BASE_URL=http://127.0.0.1:8097 DEMO_EDITOR_EMAIL=… DEMO_EDITOR_PASSWORD=… npm run movie
 *
 * Voice: Piper (pip install piper-tts), voice "alba" downloaded once into movie/voice-cache/
 * (git-ignored); MOVIE_VOICE=0 makes a silent movie. MOVIE_OUT: where the MP4 goes (default
 * Tests/Docs/movie/out/Neos-Supertext-Translation.mp4, git-ignored; the MP4 is not committed).
 * Needs ffmpeg. CHROMIUM_PATH: optional Chromium binary.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MovieKit } from './movie/movie-kit.mjs';

const B = (process.env.BASE_URL ?? 'http://127.0.0.1:8097').replace(/\/$/, '');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = process.env.MOVIE_OUT ?? here('movie/out/Neos-Supertext-Translation.mp4');
const gif = here('../../docs/images/demo.gif');
const need = (name) => process.env[name] ?? (() => { throw new Error(`Set ${name}`); })();
const PAGE = 'Text & images';
const TARGET = { menu: 'Deutsch', name: 'German', title: 'Text & Bilder' };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' });
const content = () => page.frameLocator('iframe[name=neos-content-main]');

// Sign in as the demo editor and open the page (not recorded).
await page.goto(`${B}/neos/login`);
await page.fill('input[type=text]', need('DEMO_EDITOR_EMAIL'));
await page.fill('input[type=password]', need('DEMO_EDITOR_PASSWORD'));
await page.click('button[type=submit]');
await page.waitForURL(/\/neos\//, { timeout: 60000 });
await page.getByText('Document Tree').first().waitFor({ timeout: 60000 });
await page.getByText(PAGE, { exact: true }).first().click();
await content().getByRole('heading', { name: PAGE }).first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neos-movie-'));
const kit = await MovieKit.start(page, { workDir, assets: here('movie/assets'), voiceCache: here('movie/voice-cache') });

// 1. The English page in the Neos back end.
await kit.say(`Here's a page in English, “${PAGE}”, in the Neos back end.`, {
  caption: `A page in English: “${PAGE}”`,
  during: () => kit.moveTo(content().getByRole('heading', { name: PAGE }).first()),
});

// 2. The language menu: a language the page doesn't exist in yet.
const languageButton = page.getByRole('button', { name: /English \(US\)/ }).first();
await kit.say(`Supertext works through Neos's own language menu. Open it, and choose ${TARGET.name}.`, {
  caption: `Language menu → <b>${TARGET.menu}</b>`,
  during: async () => {
    await kit.click(languageButton);
    const item = page.getByText(TARGET.menu, { exact: true }).last();
    await item.waitFor();
    await kit.hold(500);
    await kit.click(item);
    await page.getByRole('button', { name: 'Create and copy' }).waitFor({ timeout: 30000 });
    await kit.sync();
  },
});

// 3. Create and copy: Neos copies the page, Supertext translates it.
const createAndCopy = page.getByRole('button', { name: 'Create and copy' });
await kit.say('The page doesn’t exist in German yet, so Neos asks how to start. Choose Create and copy.', {
  caption: 'Click <b>Create and copy</b>',
  during: () => kit.moveTo(createAndCopy),
  after: 0,
});

// The stand-in answers at once: let Neos's request (POST /neos/service/nodes, which creates the
// language version; the package translates it before the response) through only after the
// progress state has been seen.
let release;
const released = new Promise((resolve) => (release = resolve));
await page.route(/\/neos\/service\/nodes/, async (route) => {
  if (route.request().method() === 'POST') await released;
  await route.continue();
});
await page.evaluate(([x, y]) => window.__stk?.ripple(x, y), [kit.cursor.x, kit.cursor.y]);
const done = content().getByRole('heading', { name: TARGET.title }).first().waitFor({ timeout: 180000 });
await kit.say('Supertext translates the content.', {
  caption: 'Supertext translates the content…',
  during: async () => {
    await createAndCopy.click({ noWaitAfter: true });
    await kit.hold(1300);
    release();
  },
});
kit.pause();
await done;
await page.unroute(/\/neos\/service\/nodes/);
await page.waitForTimeout(1500);
kit.resume();
await kit.sync();

// 4. The result.
await kit.say(`A few seconds later, the ${TARGET.name} page is there: title, headlines and text, all translated.`, {
  caption: `The page in ${TARGET.name}: “${TARGET.title}”`,
  during: () => kit.moveTo(content().getByRole('heading', { name: TARGET.title }).first()),
});
const publish = page.locator('#neos-PublishDropDown-Publish');
await kit.say('It waits in your workspace. Review it, and publish it as usual.', {
  caption: 'Saved in your workspace – review it and <b>Publish</b>',
  during: () => kit.moveTo(publish),
});
await kit.caption('');

fs.mkdirSync(path.dirname(out), { recursive: true });
await kit.finish(out, { system: 'Neos', repo: 'Neos-Supertext-Translation', gif });
await browser.close();
fs.rmSync(workDir, { recursive: true, force: true });
console.log(`Saved ${out} and ${gif} (${(fs.statSync(gif).size / 1e6).toFixed(2)} MB)`);
