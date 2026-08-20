/*
 * repertoire.js — the only way in to the repertoire data.
 *
 * WHY THIS EXISTS
 * ---------------
 * The app used to talk to the Firebase Realtime Database straight from the
 * browser, with the database URL sitting in the page source and no credential
 * of any kind. Google's own alert put it plainly: any user could read the
 * entire database, and any user could write to it. 136 routines with method
 * notes, 77 gigs with client names and dates, and 22 chargeables were readable
 * by anyone who viewed source, and deletable by anyone who cared to.
 *
 * So the database is now closed to the public entirely (rules deny read and
 * write) and this function is the only thing holding a credential. It checks a
 * password, hands back a token, and proxies the reads and writes the app needs.
 * The browser never sees a Firebase credential, because it never has one.
 *
 * Same shape as shine-booking's api/get-booking.js on purpose: one POST
 * endpoint, action-dispatched, token = a one-way hash of the password and the
 * server secret. Nothing new to learn, and one function rather than several,
 * which matters on Vercel Hobby's 12-function cap.
 *
 * CREDENTIALS — set on the Vercel project, never in the repo:
 *   REPERTOIRE_PASSWORD   what you type to get in
 *   FIREBASE_DB_SECRET    legacy database secret, if the project still offers one
 *   FIREBASE_SERVICE_ACCOUNT   the service-account JSON, as the modern alternative
 *
 * Either Firebase credential works. The legacy secret is one env var and is
 * simplest, but Firebase hides it on newer projects, so the service-account
 * path is implemented too -- as a plain JWT signed with node:crypto, so this
 * file keeps its zero dependencies and needs no package.json.
 */
import crypto from 'node:crypto';

const DB = 'https://my-repertoire-76b4b-default-rtdb.firebaseio.com';

// Only these paths are reachable. The app loads and saves whole collections,
// and '/' because both load() and save() work on the root, so nothing finer
// needs exposing -- and an allowlist means a bug in the client cannot ask for
// something unexpected.
const ALLOWED = ['/', '/routines', '/gigs', '/chargeables'];

/* Session token: a one-way hash of the password and the server-side secret.
 * Worth nothing if intercepted -- it cannot be turned back into the password --
 * and only matches for someone who logged in with the real one.
 */
function serverSalt() {
  return String(process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_SERVICE_ACCOUNT || '');
}
function makeToken() {
  return crypto.createHash('sha256')
    .update(String(process.env.REPERTOIRE_PASSWORD || '') + '|' + serverSalt() + '|repertoire')
    .digest('hex');
}
function tokenValid(t) {
  if (!t || typeof t !== 'string' || !process.env.REPERTOIRE_PASSWORD) return false;
  const a = Buffer.from(t);
  const b = Buffer.from(makeToken());
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, which would turn a wrong-length token into a 500.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* Firebase credential.
 *
 * The legacy secret is appended as ?auth= and is all a request needs. Failing
 * that, a service account is exchanged for a short-lived OAuth token, cached in
 * module scope so a warm function does not re-mint one on every call.
 */
let cachedToken = null;
let cachedUntil = 0;

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function accessToken() {
  if (process.env.FIREBASE_DB_SECRET) return { auth: process.env.FIREBASE_DB_SECRET };

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('No Firebase credential: set FIREBASE_DB_SECRET or FIREBASE_SERVICE_ACCOUNT.');

  if (cachedToken && Date.now() < cachedUntil) return { access_token: cachedToken };

  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(claim));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key));

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${body}.${sig}`,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Could not get a Google access token: ' + JSON.stringify(j));
  cachedToken = j.access_token;
  // A minute short of the real expiry, so a token cannot go stale mid-request.
  cachedUntil = Date.now() + ((j.expires_in || 3600) - 60) * 1000;
  return { access_token: cachedToken };
}

async function firebase(path, method, data) {
  const cred = await accessToken();
  const qs = cred.auth
    ? '?auth=' + encodeURIComponent(cred.auth)
    : '?access_token=' + encodeURIComponent(cred.access_token);
  const r = await fetch(DB + path + '.json' + qs, {
    method,
    headers: method === 'PUT' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'PUT' ? JSON.stringify(data) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Firebase ${method} ${path} failed (${r.status}): ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch (e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  try {
    if (body.action === 'login') {
      if (!process.env.REPERTOIRE_PASSWORD) {
        res.status(500).json({ error: 'REPERTOIRE_PASSWORD is not set on the server.' });
        return;
      }
      const supplied = Buffer.from(String(body.password || ''));
      const real = Buffer.from(String(process.env.REPERTOIRE_PASSWORD));
      const ok = supplied.length === real.length && crypto.timingSafeEqual(supplied, real);
      // A deliberate pause on failure. This endpoint is public and the password
      // is the only thing in front of the data, so guessing should be slow.
      if (!ok) {
        await new Promise((r2) => setTimeout(r2, 400));
        res.status(401).json({ error: 'Wrong password.' });
        return;
      }
      res.status(200).json({ token: makeToken() });
      return;
    }

    if (!tokenValid(body.token)) { res.status(401).json({ error: 'Not signed in.' }); return; }

    const path = String(body.path || '');
    if (!ALLOWED.includes(path)) { res.status(400).json({ error: 'Path not allowed.' }); return; }

    if (body.action === 'get') { res.status(200).json({ data: await firebase(path, 'GET') }); return; }
    if (body.action === 'put') {
      await firebase(path, 'PUT', body.data);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error('repertoire error:', e);
    res.status(500).json({ error: e.message });
  }
}
