// Public catalogue lookups are performed on demand in catalog.js.
// No book metadata or cover derived from a user example is bundled here.
// This extension point is retained for a future verified publisher adapter.
export function publisherBook() {
  return undefined;
}
