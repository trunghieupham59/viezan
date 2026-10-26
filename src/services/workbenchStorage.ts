import type { WorkbenchFeature, WorkbenchRecord } from '../types/workbench'

export type WorkbenchRecords = { [K in WorkbenchFeature]?: WorkbenchRecord<K> }
export interface WorkbenchStorage {
  read: () => Promise<WorkbenchRecords>
  write: (records: WorkbenchRecords) => Promise<void>
}

const DATABASE = 'viezan-workbench'
const STORE = 'recovery'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Storage unavailable')); return }
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onerror = () => reject(new Error('Storage unavailable'))
    request.onblocked = () => reject(new Error('Storage blocked'))
    request.onsuccess = () => resolve(request.result)
  })
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = tx.onabort = () => reject(new Error('Storage transaction failed'))
    })
  } finally { db.close() }
}

export const workbenchStorage: WorkbenchStorage = {
  read: async () => (await transaction('readonly', (store) => store.get('sessions'))) ?? {},
  write: async (records) => { await transaction('readwrite', (store) => store.put(records, 'sessions')) },
}
