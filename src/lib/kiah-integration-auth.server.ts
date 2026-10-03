import { timingSafeEqual } from "node:crypto";

/** Fail closed when the deployment has not configured its integration secret. */
export function integrationAuthorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ??
    request.headers.get("apikey") ??
    "";
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
  );
}
