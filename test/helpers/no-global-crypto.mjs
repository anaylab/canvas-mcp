// Simulates Node 18, which has no global `crypto`. Preloaded via NODE_OPTIONS=--import.
try { delete globalThis.crypto } catch {}
if (globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
