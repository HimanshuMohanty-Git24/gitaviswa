// Deployment safety: keys in the server's environment serve this machine only, unless the owner opts in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { serverKeysAllowed } from "../src/lib/server/guard.ts";

const req = (host: string, headers: Record<string, string> = {}) => new Request(`http://${host}/api/chat`, { headers: { host, ...headers } });

test("the app on your own computer uses the keys in .env", () => {
  delete process.env.GITAVISWA_SHARE_SERVER_KEYS;
  assert.equal(serverKeysAllowed(req("localhost:3000")), true);
  assert.equal(serverKeysAllowed(req("127.0.0.1:3000", { origin: "http://127.0.0.1:3000" })), true);
});

test("visitors to a deployment never use the owner's keys by default", () => {
  delete process.env.GITAVISWA_SHARE_SERVER_KEYS;
  assert.equal(serverKeysAllowed(req("gitaviswa.example")), false);
  // a proxy that forwards to localhost still reveals the real client
  assert.equal(serverKeysAllowed(req("localhost:3000", { "x-forwarded-for": "203.0.113.7" })), false);
  assert.equal(serverKeysAllowed(req("localhost:3000", { origin: "https://evil.example" })), false);
});

test("an owner can deliberately share the server's keys", () => {
  process.env.GITAVISWA_SHARE_SERVER_KEYS = "true";
  try {
    assert.equal(serverKeysAllowed(req("gitaviswa.example")), true);
  } finally {
    delete process.env.GITAVISWA_SHARE_SERVER_KEYS;
  }
});
