import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

// Resolve the actual production dependency edges, not a separate test dependency.
const apiRequire = createRequire(import.meta.url);
const expressRequire = createRequire(apiRequire.resolve("express"));
const blobRequire = createRequire(apiRequire.resolve("@vercel/blob"));
const ocrRequire = createRequire(apiRequire.resolve("@gutenye/ocr-node"));
const onnxRequire = createRequire(ocrRequire.resolve("onnxruntime-node"));
const qs = expressRequire("qs");

test("qs rejects bracketed comma arrays beyond the configured limit", () => {
  // GHSA-x5fp-wj9c-mxmx: four values are enough; no resource-exhaustion payload.
  for (const key of ["a", "a[]"]) {
    assert.throws(() => qs.parse(`${key}=1,2,3,4`, {
      comma: true, arrayLimit: 3, throwOnLimitExceeded: true,
    }), RangeError);
  }
});

test("qs safely serializes parsed non-callable constructor.isBuffer properties", () => {
  // GHSA-4mjr-xmp4-gh2g. Exercise both documented parser configurations.
  for (const options of [{ plainObjects: true }, { allowPrototypes: true }]) {
    const parsed = qs.parse("x[constructor][isBuffer]=y", options);
    assert.doesNotThrow(() => qs.stringify(parsed));
  }
});

test("qs preserves ordinary nested form values including explicit zero and empty", () => {
  const value = { project: { name: "Kitchen & bath", allowance: "0", notes: "" },
    selection: ["one", "two"] };
  assert.deepEqual(qs.parse(qs.stringify(value)), value);
});

function assertPatched(version: string, major: number, minor: number, patch: number) {
  const [actualMajor, actualMinor, actualPatch] = version.split(".").map(Number);
  assert.ok(actualMajor === major &&
    (actualMinor > minor || (actualMinor === minor && actualPatch >= patch)),
  `Expected reviewed ${major}.x patch floor ${major}.${minor}.${patch}; received ${version}`);
}

test("Blob's undici dependency is patched and preserves HTTP response behavior", async () => {
  assertPatched(blobRequire("undici/package.json").version, 6, 28, 1);
  const { MockAgent, request } = blobRequire("undici");
  const agent = new MockAgent();
  agent.disableNetConnect();
  try {
    agent.get("https://storage.example").intercept({ path: "/fixture", method: "GET" })
      .reply(200, "synthetic upload");
    const result = await request("https://storage.example/fixture", { dispatcher: agent });
    assert.equal(result.statusCode, 200);
    assert.equal(await result.body.text(), "synthetic upload");
    agent.assertNoPendingInterceptors();
  } finally {
    await agent.close();
  }
});

test("ONNX installer ZIP dependency is patched and preserves in-memory archive round trips", () => {
  assertPatched(onnxRequire("adm-zip/package.json").version, 0, 6, 1);
  const AdmZip = onnxRequire("adm-zip");
  const archive = new AdmZip();
  archive.addFile("model-fixture.txt", Buffer.from("synthetic model fixture"));
  const reopened = new AdmZip(archive.toBuffer());
  assert.equal(reopened.readAsText("model-fixture.txt"), "synthetic model fixture");
  assert.deepEqual(reopened.getEntries().map((entry: { entryName: string }) => entry.entryName),
    ["model-fixture.txt"]);
});
