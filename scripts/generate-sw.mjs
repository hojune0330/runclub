#!/usr/bin/env node
/**
 * Build-time generator: replaces __FIREBASE_*__ placeholders in
 * public/firebase-messaging-sw.js.template with actual env var values,
 * writing the result to public/firebase-messaging-sw.js.
 *
 * Called as: node scripts/generate-sw.mjs
 * Invoked automatically by `npm run prebuild`.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const templatePath = resolve(root, 'public/firebase-messaging-sw.template.js');
const outPath = resolve(root, 'public/firebase-messaging-sw.js');

const template = readFileSync(templatePath, 'utf-8');

const replacements = {
  __FIREBASE_API_KEY__:             process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  __FIREBASE_AUTH_DOMAIN__:         process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  __FIREBASE_PROJECT_ID__:          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  __FIREBASE_STORAGE_BUCKET__:      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  __FIREBASE_MESSAGING_SENDER_ID__: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  __FIREBASE_APP_ID__:              process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

let out = template;
let missing = [];
for (const [key, val] of Object.entries(replacements)) {
  out = out.replaceAll(key, val);
  if (!val) missing.push(key);
}

if (missing.length > 0) {
  console.warn('[generate-sw] WARNING: missing env vars: ' + missing.join(', '));
  console.warn('[generate-sw] Push notifications will NOT work until these are set in Render.');
}

writeFileSync(outPath, out, 'utf-8');
console.log('[generate-sw] Generated public/firebase-messaging-sw.js');
