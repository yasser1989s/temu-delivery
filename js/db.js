const DB_NAME = "pro_delivery_db";
const DB_VERSION = 1;

let dbPromise;

export function db() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("parcels")) {
        database.createObjectStore("parcels", { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains("meta")) {
        database.createObjectStore("meta", { keyPath: "key" });
      }

      if (!database.objectStoreNames.contains("notes")) {
        database.createObjectStore("notes", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function all(store) {
  return transaction(store, "readonly", s => s.getAll());
}

export async function get(store, key) {
  return transaction(store, "readonly", s => s.get(key));
}

export async function put(store, value) {
  return transaction(store, "readwrite", s => s.put(value));
}

export async function del(store, key) {
  return transaction(store, "readwrite", s => s.delete(key));
}

export async function clear(store) {
  return transaction(store, "readwrite", s => s.clear());
}

function transaction(store, mode, operation) {
  return db().then(database => {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(store, mode);
      const objectStore = tx.objectStore(store);
      const request = operation(objectStore);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}
