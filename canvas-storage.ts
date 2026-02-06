import { SavedCanvas, CanvasMetadata } from './types';

const DB_NAME = 'processFlowSimulator';
const DB_VERSION = 1;
const STORE_NAME = 'canvases';
const LAST_CANVAS_KEY = 'lastCanvasId';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllCanvases(): Promise<CanvasMetadata[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const canvases = (request.result as SavedCanvas[])
        .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(canvases);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getCanvas(id: string): Promise<SavedCanvas | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as SavedCanvas | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCanvas(canvas: SavedCanvas): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(canvas);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCanvas(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function renameCanvas(id: string, name: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const canvas = request.result as SavedCanvas | undefined;
      if (!canvas) {
        reject(new Error(`Canvas ${id} not found`));
        return;
      }
      canvas.name = name;
      canvas.updatedAt = Date.now();
      store.put(canvas);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getLastCanvasId(): string | null {
  return localStorage.getItem(LAST_CANVAS_KEY);
}

export function setLastCanvasId(id: string | null): void {
  if (id) {
    localStorage.setItem(LAST_CANVAS_KEY, id);
  } else {
    localStorage.removeItem(LAST_CANVAS_KEY);
  }
}
