"use strict";

// Only these Conventional Commit types are managed by the bot. Unrelated
// manually assigned labels are never removed.
const TYPE_LABELS = Object.freeze({
  feat: { color: "0E8A16", description: "A new feature" },
  fix: { color: "06EE9B", description: "A bug fix" },
  refactor: {
    color: "A2EEEF",
    description: "Code refactoring without a feature or bug fix",
  },
  docs: { color: "5B4375", description: "Documentation changes" },
  test: { color: "903073", description: "Tests and test infrastructure" },
  ci: { color: "1D76DB", description: "CI/CD configuration and workflows" },
  build: { color: "BFD4F2", description: "Build system or dependency changes" },
  perf: { color: "FBCA04", description: "Performance improvements" },
  style: {
    color: "C2E0C6",
    description: "Formatting and nonfunctional style changes",
  },
  chore: { color: "EDEDED", description: "Repository maintenance" },
  revert: { color: "B60205", description: "Reverting a previous change" },
  security: { color: "D93F0B", description: "Security hardening" },
  deps: { color: "5319E7", description: "Dependency maintenance" },
});

const REVIEW_LABEL = "needs-review";
const LABEL_DEFINITIONS = Object.freeze({
  ...TYPE_LABELS,
  [REVIEW_LABEL]: {
    color: "193F62",
    description: "Pull request ready for code review",
  },
});
const managedNames = new Set(Object.keys(LABEL_DEFINITIONS));
const commitHeader = /^([a-z][a-z0-9-]*)(?:\([^)\r\n]+\))?!?:[ \t]+\S/i;

function commitType(message) {
  if (typeof message !== "string") return null;
  const header = message.split(/\r?\n/, 1)[0];
  const matched = commitHeader.exec(header);
  const type = matched && matched[1].toLowerCase();
  return type && Object.hasOwn(TYPE_LABELS, type) ? type : null;
}

function desiredLabels(messages, isDraft) {
  const seen = new Set();
  for (const message of messages) {
    const type = commitType(message);
    if (type) seen.add(type);
  }
  const labels = Object.keys(TYPE_LABELS).filter((type) => seen.has(type));
  if (!isDraft) labels.push(REVIEW_LABEL);
  return labels;
}

function labelChanges(existing, desired) {
  const existingNames = new Set(existing.map((name) => name.toLowerCase()));
  const wanted = new Set(desired.map((name) => name.toLowerCase()));

  return {
    add: desired.filter((name) => !existingNames.has(name.toLowerCase())),
    remove: existing.filter(
      (name) =>
        managedNames.has(name.toLowerCase()) && !wanted.has(name.toLowerCase()),
    ),
  };
}

async function ensureLabelExists(github, owner, repo, name) {
  try {
    await github.rest.issues.getLabel({ owner, repo, name });
  } catch (error) {
    if (error.status !== 404) throw error;
    try {
      await github.rest.issues.createLabel({
        owner,
        repo,
        name,
        ...LABEL_DEFINITIONS[name],
      });
    } catch (createError) {
      // A concurrent PR might have created this repo-level label.
      if (createError.status !== 422) throw createError;
      await github.rest.issues.getLabel({ owner, repo, name });
    }
  }
}

async function syncPullRequestLabels(github, { owner, repo, pull_number }) {
  // Refresh PR state in case this job starts after another draft/ready event.
  const { data: pull } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number,
  });
  if (pull.state !== "open") return { skipped: true, reason: "PR is not open" };

  // github.paginate covers PRs with more than 100 commits.
  const commits = await github.paginate(github.rest.pulls.listCommits, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  const desired = desiredLabels(
    commits.map((entry) => entry.commit && entry.commit.message),
    pull.draft,
  );

  const labels = await github.paginate(github.rest.issues.listLabelsOnIssue, {
    owner,
    repo,
    issue_number: pull_number,
    per_page: 100,
  });
  const changes = labelChanges(
    labels.map((item) => item.name),
    desired,
  );

  for (const name of changes.add) {
    await ensureLabelExists(github, owner, repo, name);
  }
  if (changes.add.length > 0) {
    await github.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pull_number,
      labels: changes.add,
    });
  }
  for (const name of changes.remove) {
    try {
      await github.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: pull_number,
        name,
      });
    } catch (error) {
      // A concurrent change may have removed this already.
      if (error.status !== 404) throw error;
    }
  }

  return { skipped: false, desired, ...changes };
}

module.exports = {
  TYPE_LABELS,
  REVIEW_LABEL,
  commitType,
  desiredLabels,
  labelChanges,
  syncPullRequestLabels,
};
