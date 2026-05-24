import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onUserCreate } from './onUserCreate';
export { recomputeMatchState } from './recomputeMatchState';
export { awardPoints } from './awardPoints';
export { parseRulebook } from './parseRulebook';
