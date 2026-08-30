import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the Lane Lines relay optimizer with the complete optimizer shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Relay Optimizer · Lane Lines/);
  assert.match(html, /Build the right relay/);
  assert.match(html, /Women[\s\S]{0,20}’s roster/);
  assert.match(html, /Optimize full meet/);
  assert.match(html, /Optimization name/);
  assert.match(html, /Import CSV/);
  assert.match(html, /Open setup/);
  assert.match(html, />Save</);
  assert.match(html, /Save As/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});
