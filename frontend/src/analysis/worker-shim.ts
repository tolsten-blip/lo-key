// TensorFlow.js 3.x reads a bare `window` (e.g. `if (!window || …)`), which
// throws in a worker. Defining it as undefined makes those checks take their
// non-browser path. Imported first so it runs before TensorFlow does.
(globalThis as { window?: unknown }).window ??= undefined;
