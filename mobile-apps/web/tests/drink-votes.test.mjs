import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDrinkVotes, mobileVoterId, setDrinkVote, voteTargetKey } from "../drink-votes.ts";

const key = "maaaaaaaaaaaaaaaaaaaaaaaa";
const cell = "u0nd9";
const voter = "11111111-1111-4111-8111-111111111111";

test("exact vote keys distinguish owner offers, customer drinks and legacy bands", () => {
  assert.equal(voteTargetKey({ kind: "offer", id: "source:123" }), "offer:source:123");
  assert.equal(
    voteTargetKey({ kind: "customer", id: `c${"a".repeat(64)}` }),
    `customer:c${"a".repeat(64)}`,
  );
  assert.notEqual(
    voteTargetKey({ kind: "legacy", drink: "spritz", band: "normal" }),
    voteTargetKey({ kind: "legacy", drink: "spritz", band: "happy_hour" }),
  );
  assert.throws(() => voteTargetKey({ kind: "legacy", drink: "unknown", band: "normal" }), Error);
});

test("one venue GET validates exact identity, count and own selected state", async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(
      JSON.stringify({
        schema_version: 1,
        venue: { key, cell, name: "Locale" },
        items: [{ target: { kind: "offer", id: "source:123" }, count: 4, recommended: true }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const items = await loadDrinkVotes(key, cell, voter);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, `/api/mobile/v2/drink-votes/venues/${key}?cell=${cell}`);
    assert.equal(requests[0].options.headers["X-DoveBevo-Voter"], voter);
    assert.deepEqual(items.get("offer:source:123"), {
      target: { kind: "offer", id: "source:123" },
      count: 4,
      recommended: true,
    });
    assert.equal(items.get("legacy:spritz:normal"), undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test("toggle request is one exact POST and rejects a mismatched authority response", async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(
      JSON.stringify({
        target: { kind: "legacy", drink: "spritz", band: "normal" },
        count: 2,
        recommended: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const target = { kind: "legacy", drink: "spritz", band: "normal" };
    const item = await setDrinkVote(key, cell, voter, target, true);
    assert.equal(item.count, 2);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.headers["X-DoveBevo-Voter"], voter);
    assert.deepEqual(JSON.parse(requests[0].options.body), { target, recommended: true });
    await assert.rejects(() =>
      setDrinkVote(key, cell, voter, { kind: "offer", id: "another" }, true),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("voter identity is generated once and retained in WebView storage", () => {
  const originalStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => {
      data.set(name, value);
    },
  };
  try {
    const first = mobileVoterId();
    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(mobileVoterId(), first);
    assert.equal(data.size, 1);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
