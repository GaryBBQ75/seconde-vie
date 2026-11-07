export * from './permissions.js';
import { createDemoProfiles } from './demo-profiles.js';
export const {demoPassword,demoMembers,demoAdminEmail}=createDemoProfiles(globalThis.localStorage);
