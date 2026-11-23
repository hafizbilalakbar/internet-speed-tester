import { handleRequest } from './handler';

/** Cloudflare Worker entry point. The same handler powers the Pages functions. */
export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  },
};
