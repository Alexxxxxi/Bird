
import { CustomBirdConfig } from '../types';

const DB_NAME = 'HandHarmonyDB';
const STORE_NAME = 'BirdsDNA';
const DB_VERSION = 1;

// Using a unique key for the cloud bucket to avoid collisions with other users
// and a reliable anonymous KV store (kvdb.io)
const CLOUD_ID = 'hand_harmony_global_v2_stable'; 
const CLOUD_API_URL = `https://kvdb.io/6P4k1R8W8v9XvXvXvXvXvX/${CLOUD_ID}`;

export const initDB = (): Promise<IDBDatabase> => {
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
};

export const saveBirdToDB = async (bird: CustomBirdConfig) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(bird);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteBirdFromDB = async (id: string) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllBirdsFromDB = async (): Promise<CustomBirdConfig[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const syncBirdsWithCloud = async (localBirds: CustomBirdConfig[]): Promise<CustomBirdConfig[]> => {
  try {
    // 1. Fetch current cloud state
    const response = await fetch(CLOUD_API_URL);
    let cloudBirds: CustomBirdConfig[] = [];
    if (response.ok) {
      const text = await response.text();
      try {
        cloudBirds = text ? JSON.parse(text) : [];
      } catch (e) {
        console.warn("Cloud data corrupted, resetting.");
        cloudBirds = [];
      }
    }

    // 2. Deep Merge logic: Unique by ID, newer updates (local) win
    const birdMap = new Map<string, CustomBirdConfig>();
    cloudBirds.forEach(b => {
      if (b && b.id) birdMap.set(b.id, b);
    });
    localBirds.forEach(b => {
      if (b && b.id) birdMap.set(b.id, b);
    });
    
    const mergedBirds = Array.from(birdMap.values());

    // 3. Optimization: Only push if there's actual new data to save bandwidth
    const localIds = new Set(localBirds.map(b => b.id));
    const hasNewData = mergedBirds.length > cloudBirds.length || localBirds.length > cloudBirds.length;

    if (hasNewData) {
      // Note: KVDB has a 1MB limit for anonymous buckets.
      // We should ideally compress images, but for now we filter out corrupted entries
      const payload = JSON.stringify(mergedBirds);
      if (payload.length > 950000) {
        console.error("DNA Library too large for free cloud sync (1MB limit reached).");
      } else {
        await fetch(CLOUD_API_URL, {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 4. Update Local Cache
    for (const bird of mergedBirds) {
      await saveBirdToDB(bird);
    }

    return mergedBirds;
  } catch (e) {
    console.error("Cloud Link Error:", e);
    return localBirds;
  }
};
