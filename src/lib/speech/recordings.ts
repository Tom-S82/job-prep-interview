// Recordings live in IndexedDB in this browser only: they are never uploaded.
// Falls back to memory (lost on reload) if IndexedDB is unavailable.

const DB = 'speak-practice';
const STORE = 'recordings';
export const MAX_RECORDINGS = 30;

const memory = new Map<string, Blob>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === 'undefined') return Promise.resolve(null);
	dbPromise ??= new Promise((resolve) => {
		try {
			const req = indexedDB.open(DB, 1);
			req.onupgradeneeded = () => req.result.createObjectStore(STORE);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
	return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
	return db().then(
		(d) =>
			new Promise((resolve) => {
				if (!d) return resolve(null);
				try {
					const req = fn(d.transaction(STORE, mode).objectStore(STORE));
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => resolve(null);
				} catch {
					resolve(null);
				}
			})
	);
}

export async function saveRecording(id: string, blob: Blob) {
	memory.set(id, blob);
	await run('readwrite', (s) => s.put(blob, id));
}

export async function getRecording(id: string): Promise<Blob | null> {
	return memory.get(id) ?? ((await run<Blob>('readonly', (s) => s.get(id))) as Blob | null);
}

export async function deleteRecording(id: string) {
	memory.delete(id);
	await run('readwrite', (s) => s.delete(id));
}

/** Keep only the given attempt recordings (plus all "ref:" Lead-reading references). */
export async function pruneRecordings(keep: Set<string>) {
	const keys = ((await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? []) as string[];
	await Promise.all(keys.filter((k) => !k.startsWith('ref:') && !keep.has(k)).map(deleteRecording));
}

export const referenceId = (scenarioId: string) => `ref:${scenarioId}`;
