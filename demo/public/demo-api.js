import { createBusinessAPI } from './domain.js';
export const demoRequest = createBusinessAPI({localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,origin:globalThis.location?.origin});
