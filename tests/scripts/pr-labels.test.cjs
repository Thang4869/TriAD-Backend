"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  commitType,
  desiredLabels,
  labelChanges,
  syncPullRequestLabels,
} = require("../../scripts/pr-labels.cjs");

test("parses scoped, breaking and case-insensitive Conventional Commit headers", () => {
  assert.equal(commitType("fix(auth): handle logout"), "fix");
  assert.equal(commitType("refactor(core)!: reorganize ports"), "refactor");
  assert.equal(commitType("DOCS: describe outbox"), "docs");
  assert.equal(commitType("security(proxy): reject spoofed IPs"), "security");
  assert.equal(commitType("feat: add listing"), "feat");
});

test("ignores commit bodies, merge messages and unsupported types", () => {
  assert.equal(commitType("fix the application"), null);
  assert.equal(
    commitType("Merge pull request #12\n\nfix(auth): not a header"),
    null,
  );
  assert.equal(commitType("fix(scope):   "), null);
  assert.equal(commitType("unknown: something"), null);
  assert.equal(commitType(null), null);
});

test("deduplicates only matching types across ALL PR commits", () => {
  const labels = desiredLabels(
    [
      "fix(auth): improve tokens",
      "refactor(orders): reorganize domain",
      "docs: explain decisions",
      "fix(api): repair status",
      "chore: format\n\nfeat: mentioned only in body",
      "Merge branch 'main'",
    ],
    false,
  );
  assert.deepEqual(labels, [
    "fix",
    "refactor",
    "docs",
    "chore",
    "needs-review",
  ]);
});

test("draft PR has type labels but no needs-review", () => {
  assert.deepEqual(desiredLabels(["fix: resolve issue"], true), ["fix"]);
});

test("does not add type labels when there are no Conventional Commits", () => {
  assert.deepEqual(
    desiredLabels(["Merge upstream", "Some random title"], false),
    ["needs-review"],
  );
});

test("reconciliation removes stale types and preserves unrelated manual labels", () => {
  assert.deepEqual(
    labelChanges(
      ["fix", "refactor", "docs", "needs-review", "P0", "security-review"],
      ["fix", "docs", "needs-review"],
    ),
    { add: [], remove: ["refactor"] },
  );
  assert.deepEqual(labelChanges(["needs-review", "help wanted"], ["test"]), {
    add: ["test"],
    remove: ["needs-review"],
  });
});

test("does not duplicate labels on repeated synchronize events", () => {
  const desired = ["fix", "docs", "needs-review"];
  assert.deepEqual(labelChanges(desired, desired), { add: [], remove: [] });
  assert.deepEqual(labelChanges(["Fix", "Docs", "needs-review"], desired), {
    add: [],
    remove: [],
  });
});

function fakeGithub({
  messages,
  current = [],
  draft = false,
  open = true,
  missing = [],
}) {
  const history = [];
  const labels = new Set(current);
  const available = new Set(
    ["fix", "docs", "test", "refactor", "needs-review", "security"].filter(
      (label) => !missing.includes(label),
    ),
  );
  const listCommits = Symbol("listCommits");
  const listLabelsOnIssue = Symbol("listLabelsOnIssue");
  const github = {
    rest: {
      pulls: {
        get: async () => ({ data: { state: open ? "open" : "closed", draft } }),
        listCommits,
      },
      issues: {
        listLabelsOnIssue,
        getLabel: async ({ name }) => {
          if (!available.has(name))
            throw Object.assign(new Error("Not found"), { status: 404 });
        },
        createLabel: async ({ name }) => {
          history.push(["created", name]);
          available.add(name);
        },
        addLabels: async ({ labels: next }) => {
          history.push(["added", next]);
          next.forEach((name) => labels.add(name));
        },
        removeLabel: async ({ name }) => {
          history.push(["removed", name]);
          labels.delete(name);
        },
      },
    },
    paginate: async (method) =>
      method === listCommits
        ? messages.map((message) => ({ commit: { message } }))
        : [...labels].map((name) => ({ name })),
  };
  return { github, history, labels };
}

test("end-to-end reconciliation creates only missing type labels and removes stale ones", async () => {
  const { github, history, labels } = fakeGithub({
    messages: ["fix(api): repair", "refactor(domain): split", "docs: guide"],
    current: ["test", "needs-review", "priority: P0"],
    missing: ["refactor"],
  });
  const result = await syncPullRequestLabels(github, {
    owner: "owner",
    repo: "repo",
    pull_number: 42,
  });
  assert.deepEqual(result.desired, ["fix", "refactor", "docs", "needs-review"]);
  assert.deepEqual(result.add, ["fix", "refactor", "docs"]);
  assert.deepEqual(result.remove, ["test"]);
  assert.deepEqual(history, [
    ["created", "refactor"],
    ["added", ["fix", "refactor", "docs"]],
    ["removed", "test"],
  ]);
  assert.deepEqual([...labels].sort(), [
    "docs",
    "fix",
    "needs-review",
    "priority: P0",
    "refactor",
  ]);
});

test("closed PRs are not modified", async () => {
  const { github, history } = fakeGithub({
    messages: ["fix: issue"],
    current: [],
    open: false,
  });
  const result = await syncPullRequestLabels(github, {
    owner: "owner",
    repo: "repo",
    pull_number: 7,
  });
  assert.equal(result.skipped, true);
  assert.deepEqual(history, []);
});
