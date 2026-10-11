try { delete globalThis.crypto } catch {}
if (globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
