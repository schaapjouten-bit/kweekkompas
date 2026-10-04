import service from './_shared/photos.js';
import { adapt } from './_shared/adapter.mjs';
import http from './_shared/lib/http.js';
// Authenticated control requests only. Photo bytes go directly to private Storage.
export default request => adapt(http.endpoint(service.handlePhotoAccess), request);
export const config = { path: '/api/photo-access' };
