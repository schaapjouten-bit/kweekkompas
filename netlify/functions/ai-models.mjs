import service from './_shared/ai-models.js';
import { adapt } from './_shared/adapter.mjs';
export default request => adapt(service.handler, request);
export const config = { path: '/api/ai-models' };
