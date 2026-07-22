// Rolling audio-clip capture for the night's loudest snores — the "wow"
// feature. Runs a MediaRecorder on the *same* getUserMedia stream the
// detector already opened (never a second mic session), chunking into a
// small ring buffer. When the detector reports an event whose peakDb is
// competitive with the night's top 5, the surrounding ~8-12s of audio
// (previous chunk + the chunk the event happened in + the next chunk) is
// frozen into a Blob and kept.
//
// Privacy is product-critical here: clips are stored ONLY in IndexedDB, on
// this device. Nothing here ever touches Supabase or any network call —
// there is no upload path in this file, full stop.
//
// Storage: IndexedDB db `dns-sessions` (shared with sessionRecorder.ts),
// store `clips`, keyPath `id`. Blobs live inside the stored record and never
// enter React state — playback consumers call `clipBlob(id)` and manage
// their own `URL.createObjectURL` lifecycle.
//
// Ownership scoping: IndexedDB is per-*browser*, not per-account — on a
// shared device, signing out of one account and into another does not clear
// it. Every stored clip is stamped with the identity active when it was
// captured (`ownerId`, see currentOwnerId() below) and every read filters to
// the identity active right now, so a real captured clip can never surface
// as "your" audio under a different signed-in account (or under local-demo
// mode) than the one that recorded it.

import { store } from '../store';

/** Public clip metadata — no Blob here by design (see file header). */
export interface SnoreClip {
  id: string;            // `${sessionId}:${ts}`
  sessionId: string;
  nightDate?: string;    // stamped at finalize()
  ts: number;            // event time, unix ms
  peakDb: number;
  durationMs: number;    // clip audio length
  mime: string;          // actual MediaRecorder mime used
  /** True only for the offline-rendered public/samples/*.wav clips returned
   *  by demoClips() below — never set on a real captured clip. Every
   *  consumer that plays back a clip with this flag set MUST show a "sample
   *  audio" caption; see PLAN3.md Lane C, the non-negotiable honesty rule. */
  isSample?: true;
}

/** What's actually persisted — the public shape plus the Blob and the
 *  identity that captured it. `ownerId` is internal (never part of the
 *  public `SnoreClip` shape callers see) — see the "Ownership scoping" note
 *  above. */
interface StoredClip extends SnoreClip {
  blob: Blob;
  ownerId: string;
}

/** The identity clips are scoped to on this device: the signed-in account's
 *  user id, or a `'local-demo'` sentinel when signed out. Read at capture
 *  start (stamped once per session, not re-read per clip) and at every read
 *  path, so switching accounts on a shared device never surfaces another
 *  account's real captured audio as "yours." */
function currentOwnerId(): string {
  return store.get().auth?.userId ?? 'local-demo';
}

const DB_NAME = 'dns-sessions';
const DB_VERSION = 2; // v2 adds the `clips` store alongside sessionRecorder.ts's `events`
const CLIPS_STORE = 'clips';

const CHUNK_MS = 4000;   // ring-buffer timeslice
const TOP_N = 5;         // loudest clips kept per night (== per session)
const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

// ---------- feature detection ----------

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

export function isClipCaptureSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!pickMime()
    && typeof window !== 'undefined' && 'indexedDB' in window;
}

// ---------- IndexedDB (shared db with sessionRecorder.ts's `events` store) ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('indexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Idempotent regardless of which module (this one or
      // sessionRecorder.ts) happens to run the upgrade first.
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'sessionId' });
      if (!db.objectStoreNames.contains(CLIPS_STORE)) {
        const store = db.createObjectStore(CLIPS_STORE, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId');
        store.createIndex('nightDate', 'nightDate');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbPutClip(clip: StoredClip): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(CLIPS_STORE, 'readwrite');
    tx.objectStore(CLIPS_STORE).put(clip);
    await txDone(tx);
    db.close();
  } catch {
    // Private mode / storage full — the clip just doesn't persist.
  }
}

async function idbDeleteClip(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(CLIPS_STORE, 'readwrite');
    tx.objectStore(CLIPS_STORE).delete(id);
    await txDone(tx);
    db.close();
  } catch { /* nothing to clean up */ }
}

async function idbGetClipsBySession(sessionId: string): Promise<StoredClip[]> {
  try {
    const db = await openDb();
    const result = await new Promise<StoredClip[]>((resolve, reject) => {
      const tx = db.transaction(CLIPS_STORE, 'readonly');
      const req = tx.objectStore(CLIPS_STORE).index('sessionId').getAll(IDBKeyRange.only(sessionId));
      req.onsuccess = () => resolve(req.result as StoredClip[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}

async function idbGetAllClips(): Promise<StoredClip[]> {
  try {
    const db = await openDb();
    const result = await new Promise<StoredClip[]>((resolve, reject) => {
      const tx = db.transaction(CLIPS_STORE, 'readonly');
      const req = tx.objectStore(CLIPS_STORE).getAll();
      req.onsuccess = () => resolve(req.result as StoredClip[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}

function stripBlob(clip: StoredClip): SnoreClip {
  const { blob: _blob, ownerId: _ownerId, ...meta } = clip;
  return meta;
}

// ---------- capture state ----------

interface ChunkRec { index: number; blob: Blob; startMs: number; endMs: number }
/** `onsetChunkIndex` is the chunk that was actively recording at the event's
 *  true onset (captured by useSnoreDetector the moment the loud spell is
 *  confirmed); `endChunkIndex` is whichever chunk was active when the event
 *  was finally reported (noteEvent's call time — the loud spell just quieted
 *  down). For a short snore these are usually the same chunk; for a
 *  sustained one they can be several chunks apart, and the frozen clip needs
 *  to span the whole range, not just chunks around wherever it happened to
 *  end. */
interface PendingEvent { ts: number; peakDb: number; onsetChunkIndex: number; endChunkIndex: number }

let mediaRecorder: MediaRecorder | null = null;
let mime = '';
let activeSessionId = '';
/** Identity active when this capture session started — stamped onto every
 *  clip it produces (see currentOwnerId()/StoredClip.ownerId above). */
let activeOwnerId = '';
let capturing = false;
let chunks = new Map<number, ChunkRec>();
let nextChunkIndex = 0;
let currentChunkStartMs = 0;
let pending: PendingEvent[] = [];
/** In-memory mirror of this session's currently-stored top-N (metadata only,
 *  no blobs) — lets us rank a new candidate without a DB round trip per
 *  event. Rehydrated from IndexedDB on start so a resumed (crash-recovered)
 *  session keeps ranking correctly against clips saved before the reload. */
let sessionClips: SnoreClip[] = [];
/** Resolves once `sessionClips` has been rehydrated from IndexedDB for the
 *  current session. Every candidate clip must wait on this before ranking —
 *  otherwise a clip arriving while the rehydrate read is still in flight
 *  sees an empty `sessionClips` and gets stored unconditionally, letting a
 *  resumed (crash-recovered) session exceed the top-N cap. */
let rehydratePromise: Promise<void> = Promise.resolve();
/** In-flight IndexedDB writes from storeClipIfTopRanked — deleteAllClips()
 *  waits for these so a delete-all always wins over a write that was
 *  already mid-flight, rather than racing it. */
let inFlightWrites: Promise<void>[] = [];

function isCompetitive(peakDb: number): boolean {
  if (sessionClips.length < TOP_N) return true;
  let min = sessionClips[0].peakDb;
  for (const c of sessionClips) if (c.peakDb < min) min = c.peakDb;
  return peakDb > min;
}

async function storeClipIfTopRanked(meta: SnoreClip, blob: Blob): Promise<void> {
  // Always rank against a fully-loaded sessionClips snapshot — otherwise a
  // clip landing while the post-resume IndexedDB read is still in flight
  // sees an (incorrectly) empty ranking array and gets stored unconditionally.
  await rehydratePromise;
  const write = (async () => {
    if (sessionClips.length < TOP_N) {
      sessionClips.push(meta);
      await idbPutClip({ ...meta, blob, ownerId: activeOwnerId });
      return;
    }
    let minIdx = 0;
    for (let i = 1; i < sessionClips.length; i++) {
      if (sessionClips[i].peakDb < sessionClips[minIdx].peakDb) minIdx = i;
    }
    if (meta.peakDb <= sessionClips[minIdx].peakDb) return; // no longer competitive
    const evicted = sessionClips[minIdx];
    sessionClips[minIdx] = meta;
    await idbDeleteClip(evicted.id);
    await idbPutClip({ ...meta, blob, ownerId: activeOwnerId });
  })();
  inFlightWrites.push(write);
  try {
    await write;
  } finally {
    inFlightWrites = inFlightWrites.filter(w => w !== write);
  }
}

function freezeAndMaybeStore(p: PendingEvent): void {
  if (!isCompetitive(p.peakDb)) return;
  // Span the clip from one chunk before the event's real onset through one
  // chunk after wherever it was reported — for a short snore that's the
  // usual prev+cur+next window; for a sustained one spanning several
  // chunks, this covers the whole thing instead of anchoring only to the
  // chunk active when the loud spell happened to end.
  const lo = p.onsetChunkIndex - 1;
  const hi = p.endChunkIndex + 1;
  const parts: Blob[] = [];
  let startMs: number | undefined;
  let endMs: number | undefined;
  for (let i = lo; i <= hi; i++) {
    const c = chunks.get(i);
    if (!c) continue; // already trimmed or never captured (e.g. capture just started) — skip, not fatal
    parts.push(c.blob);
    if (startMs === undefined) startMs = c.startMs;
    endMs = c.endMs;
  }
  if (parts.length === 0 || startMs === undefined || endMs === undefined) return; // nothing captured — drop it
  const meta: SnoreClip = {
    id: `${activeSessionId}:${p.ts}`,
    sessionId: activeSessionId,
    ts: p.ts,
    peakDb: p.peakDb,
    durationMs: Math.max(1, endMs - startMs),
    mime,
  };
  const blob = new Blob(parts, { type: mime });
  void storeClipIfTopRanked(meta, blob);
}

/** Trim chunks that no longer matter: nothing older than the oldest chunk a
 *  still-pending event might need (its onset chunk - 1), capped so a long
 *  night never grows the ring buffer unbounded. */
function trimChunks(): void {
  const oldestNeeded = pending.length > 0
    ? Math.min(...pending.map(p => p.onsetChunkIndex - 1))
    : nextChunkIndex - 1; // keep just the latest chunk as "prev" for the next event
  for (const idx of chunks.keys()) {
    if (idx < oldestNeeded) chunks.delete(idx);
  }
}

function resolvePending(): void {
  const stillPending: PendingEvent[] = [];
  for (const p of pending) {
    const next = chunks.get(p.endChunkIndex + 1);
    if (next) {
      freezeAndMaybeStore(p);
    } else {
      stillPending.push(p);
    }
  }
  pending = stillPending;
}

/** Best-effort resolution for whatever's still pending when capture stops
 *  mid-window (the night ended before a "next" chunk ever arrived). Freezes
 *  whatever chunks in the event's real span were actually captured, rather
 *  than dropping the clip. */
function finalizePendingBestEffort(): void {
  for (const p of pending) freezeAndMaybeStore(p);
  pending = [];
}

async function rehydrateSessionClips(sessionId: string): Promise<void> {
  try {
    const rows = await idbGetClipsBySession(sessionId);
    const sorted = rows.map(stripBlob).sort((a, b) => b.peakDb - a.peakDb);
    sessionClips = sorted.slice(0, TOP_N);
    // Reconcile IndexedDB itself, not just the in-memory ranking array — a
    // resumed session can have accumulated more than TOP_N rows (see the
    // rehydratePromise guard in storeClipIfTopRanked above); without this,
    // those extra rows just sit in the store forever and latestClips() would
    // surface more than the contracted top-5.
    const evicted = sorted.slice(TOP_N);
    if (evicted.length > 0) await Promise.all(evicted.map(c => idbDeleteClip(c.id)));
  } catch {
    // start fresh — worst case a pre-crash clip gets evicted incorrectly
  }
}

// ---------- public API ----------

export function startClipCapture(stream: MediaStream, sessionId: string): void {
  if (capturing) return; // idempotent — never open a second recorder
  if (!isClipCaptureSupported()) return;
  const chosenMime = pickMime();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: chosenMime });
  } catch {
    return;
  }

  mediaRecorder = recorder;
  mime = chosenMime;
  activeSessionId = sessionId;
  activeOwnerId = currentOwnerId();
  chunks = new Map();
  nextChunkIndex = 0;
  pending = [];
  sessionClips = [];
  currentChunkStartMs = Date.now();
  capturing = true;
  rehydratePromise = rehydrateSessionClips(sessionId);

  recorder.ondataavailable = (ev: BlobEvent) => {
    if (!ev.data || ev.data.size === 0) return;
    const idx = nextChunkIndex++;
    const startMs = currentChunkStartMs;
    const endMs = Date.now();
    currentChunkStartMs = endMs;
    chunks.set(idx, { index: idx, blob: ev.data, startMs, endMs });
    resolvePending();
    trimChunks();
  };

  try {
    recorder.start(CHUNK_MS);
  } catch {
    capturing = false;
    mediaRecorder = null;
  }
}

/** The chunk index clipRecorder is actively recording into right now — the
 *  one that will arrive next via ondataavailable. Exposed so the detector
 *  can snapshot it at an event's true onset (not just when the event is
 *  finally reported), which is what lets a sustained snore's clip window
 *  anchor to where it actually started. Returns 0 when capture isn't running
 *  (harmless — noteEvent no-ops in that case anyway). */
export function currentChunkIndex(): number {
  return nextChunkIndex;
}

/** Detector calls this once per confirmed snore event. No-op unless capture
 *  is currently running. `onsetChunkIndex` — the chunk active at the event's
 *  true onset, from `currentChunkIndex()` called at that moment — anchors
 *  the eventual clip window correctly for events that span more than one
 *  chunk; defaults to the chunk active right now (old single-chunk-event
 *  behavior) when the caller doesn't have it. */
export function noteEvent(e: { ts: number; peakDb: number; onsetChunkIndex?: number }): void {
  if (!capturing) return;
  const onsetChunkIndex = e.onsetChunkIndex ?? nextChunkIndex;
  pending.push({ ts: e.ts, peakDb: e.peakDb, onsetChunkIndex, endChunkIndex: nextChunkIndex });
}

export function stopClipCapture(): Promise<void> {
  return new Promise(resolve => {
    if (!capturing || !mediaRecorder) {
      capturing = false;
      mediaRecorder = null;
      resolve();
      return;
    }
    const recorder = mediaRecorder;
    const finish = () => {
      capturing = false;
      mediaRecorder = null;
      finalizePendingBestEffort();
      resolve();
    };
    recorder.onstop = finish;
    try {
      recorder.stop(); // flushes a final ondataavailable, then fires 'stop'
    } catch {
      finish();
    }
  });
}

/** Stamps `nightDate` onto every clip captured under `sessionId` — called
 *  once the night's date is known (sessionRecorder.end(), or the recovery
 *  path for an abandoned session). Best-effort; never throws. */
export async function finalizeClips(sessionId: string, nightDate: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(CLIPS_STORE, 'readwrite');
    const store = tx.objectStore(CLIPS_STORE);
    const idx = store.index('sessionId');
    await new Promise<void>((resolve, reject) => {
      const req = idx.openCursor(IDBKeyRange.only(sessionId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const rec = cursor.value as StoredClip;
          rec.nightDate = nightDate;
          cursor.update(rec);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    db.close();
  } catch {
    // Best-effort — worst case these clips never surface in latestClips().
  }
}

/** Newest night that has any finalized clips, loudest first — scoped to the
 *  identity currently signed in (or local-demo). A clip captured under a
 *  different account (or before signing out, on a shared device) is
 *  filtered out here rather than in each consumer, so every caller of
 *  latestClips()/clipsForNight() automatically gets the ownership guarantee. */
export async function latestClips(): Promise<SnoreClip[]> {
  const owner = currentOwnerId();
  const all = (await idbGetAllClips()).filter(c => c.ownerId === owner);
  let newestDate: string | null = null;
  for (const c of all) {
    if (c.nightDate && (!newestDate || c.nightDate > newestDate)) newestDate = c.nightDate;
  }
  if (!newestDate) return [];
  return all
    .filter(c => c.nightDate === newestDate)
    .sort((a, b) => b.peakDb - a.peakDb)
    .map(stripBlob);
}

export async function clipBlob(id: string): Promise<Blob | null> {
  if (id.startsWith(SAMPLE_ID_PREFIX)) return sampleClipBlob(id);
  try {
    const db = await openDb();
    const rec = await new Promise<StoredClip | undefined>((resolve, reject) => {
      const tx = db.transaction(CLIPS_STORE, 'readonly');
      const req = tx.objectStore(CLIPS_STORE).get(id);
      req.onsuccess = () => resolve(req.result as StoredClip | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteAllClips(): Promise<void> {
  // Let any writes already mid-flight land first — otherwise a
  // storeClipIfTopRanked() call whose idbPutClip() transaction commits after
  // this clear() would resurrect a clip right after "delete all" just ran.
  await Promise.allSettled(inFlightWrites);
  try {
    const db = await openDb();
    const tx = db.transaction(CLIPS_STORE, 'readwrite');
    tx.objectStore(CLIPS_STORE).clear();
    await txDone(tx);
    db.close();
  } catch {
    // nothing to clear
  }
  sessionClips = [];
}

// ---------- demo/sample clips (Lane C — PLAN3.md) ----------
//
// Real-capture behavior above is untouched by any of this. These are
// deterministic, sample-backed "clips" for demo/seed nights that never had a
// mic actually running — the WAVs come from scripts/gen-sample-snores.mjs,
// offline-rendered into public/samples/. `isSample: true` is load-bearing:
// every playback surface must show a "sample audio" caption for these (see
// SnoreClip.isSample doc above) — nothing here is presented as measured.

const SAMPLE_ID_PREFIX = 'sample:';

/** Durations/peakDb here must track scripts/gen-sample-snores.mjs's
 *  CHAR_SPECS output exactly (durationSec*1000, and the honest 58-64 dB
 *  demo range) — there's no runtime way to read a WAV's real length without
 *  decoding it, and re-running the generator regenerates byte-identical
 *  files anyway (seeded PRNG), so this manifest is safe to hand-keep. */
const SAMPLE_MANIFEST: { file: string; durationMs: number; peakDb: number }[] = [
  { file: 'snore-1.wav', durationMs: 4400, peakDb: 64 }, // palatal rumble
  { file: 'snore-2.wav', durationMs: 5000, peakDb: 58 }, // tongue-base broadband
  { file: 'snore-3.wav', durationMs: 4700, peakDb: 61 }, // nasal flutter
];

/** A plausible bedtime→wake span for a night we only know the date of (no
 *  real startedAt/endedAt exists for a sample-backed night) — 11pm the
 *  night's calendar date through 6am the next, matching the seed data's
 *  typical hours. Used only to spread demoClips()'s timestamps sensibly
 *  across the night; never presented as a measured session boundary. */
function demoNightSpanMs(nightDate: string): { startMs: number; endMs: number } | null {
  const [y, m, d] = nightDate.split('-').map(Number);
  if ([y, m, d].some((v) => Number.isNaN(v))) return null;
  const start = new Date(y, m - 1, d, 23, 0, 0, 0);
  let end = new Date(y, m - 1, d, 6, 0, 0, 0);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 3600 * 1000);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** Deterministic sample-backed clips for a demo/seed night — same 3 clips,
 *  same timestamps, every call for a given date. Loudest-first, matching
 *  latestClips()'s ordering, so consumers that assume that shape (e.g. "the
 *  first clip is the loudest") don't need a special case for the demo path. */
export function demoClips(nightDate: string): SnoreClip[] {
  const span = demoNightSpanMs(nightDate);
  const n = SAMPLE_MANIFEST.length;
  return SAMPLE_MANIFEST
    .map((spec, i) => {
      // Spread across the span at ~25/50/75% rather than clumping them.
      const frac = (i + 1) / (n + 1);
      const ts = span ? Math.round(span.startMs + frac * (span.endMs - span.startMs)) : Date.now();
      const clip: SnoreClip = {
        id: `${SAMPLE_ID_PREFIX}${nightDate}:${spec.file}`,
        sessionId: `${SAMPLE_ID_PREFIX}${nightDate}`,
        nightDate,
        ts,
        peakDb: spec.peakDb,
        durationMs: spec.durationMs,
        mime: 'audio/wav',
        isSample: true,
      };
      return clip;
    })
    .sort((a, b) => b.peakDb - a.peakDb);
}

async function sampleClipBlob(id: string): Promise<Blob | null> {
  const file = id.slice(SAMPLE_ID_PREFIX.length).split(':')[1];
  if (!file) return null;
  try {
    const res = await fetch(`/samples/${file}`);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null; // offline / fetch unsupported — playback just no-ops
  }
}

/** The lookup seam demo-aware consumers should use instead of calling
 *  latestClips() directly: real captured clips for `nightDate` if any exist
 *  (latestClips() only ever holds the newest recorded night's clips, so this
 *  naturally comes back empty for any other night — unchanged behavior),
 *  else deterministic demo-sample clips, but ONLY when the night's `source`
 *  is the server-side demo account ('demo') — a real account's recorded
 *  night with no captured clips stays honestly empty instead of getting
 *  sample audio grafted onto it. */
export async function clipsForNight(nightDate: string, isDemoSource: boolean): Promise<SnoreClip[]> {
  const real = (await latestClips()).filter((c) => c.nightDate === nightDate);
  if (real.length > 0) return real;
  return isDemoSource ? demoClips(nightDate) : [];
}
