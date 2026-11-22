import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 does not forward async rejections; every async route must use this wrapper. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
