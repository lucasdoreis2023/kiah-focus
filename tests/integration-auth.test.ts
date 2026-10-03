import assert from "node:assert/strict";
import test from "node:test";
import { integrationAuthorized } from "../src/lib/kiah-integration-auth.server.ts";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://example.test/webhook", { method: "POST", headers });

test("unconfigured integrations fail closed", () => {
  assert.equal(integrationAuthorized(request(), undefined), false);
  assert.equal(integrationAuthorized(request({ apikey: "test-secret" }), ""), false);
});
test("missing, incorrect and prefix credentials are rejected", () => {
  for (const token of ["", "wrong", "test", "test-secret-more"]) {
    assert.equal(integrationAuthorized(request({ apikey: token }), "test-secret"), false);
  }
});
test("configured bearer and Evolution apikey credentials are accepted", () => {
  assert.equal(
    integrationAuthorized(request({ authorization: "Bearer test-secret" }), "test-secret"),
    true,
  );
  assert.equal(integrationAuthorized(request({ apikey: "test-secret" }), "test-secret"), true);
});
test("an incorrect authorization header cannot be overridden with an apikey", () => {
  assert.equal(
    integrationAuthorized(
      request({ authorization: "Bearer wrong", apikey: "test-secret" }),
      "test-secret",
    ),
    false,
  );
});
