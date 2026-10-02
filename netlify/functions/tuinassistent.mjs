import service from './_shared/tuinassistent.js';
import { adapt } from './_shared/adapter.mjs';
export default request => adapt(service.handler, request);
export const config = { path: '/api/tuinassistent' };
