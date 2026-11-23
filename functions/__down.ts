import { handleRequest } from '../worker/src/handler';

export async function onRequest({ request }: { request: Request }): Promise<Response> {
  return handleRequest(request);
}
