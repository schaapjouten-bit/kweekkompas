import service from './_shared/admin-personal-ai.js';
import { adapt } from './_shared/adapter.mjs';
export default request => adapt(service.handler, request);
export const config = { path: '/api/admin-personal-ai' };
