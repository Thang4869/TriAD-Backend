# PR labels — Conventional Commits

The GitHub Actions workflow [`label_pr.yml`](workflows/label_pr.yml) labels PRs based on **the first line of every commit message in the PR**, not the PR title, changed file paths or text in commit bodies.

For example, a PR with these commit subjects:

```text
fix(auth): preserve verification links
refactor(orders): split read adapter
docs: describe retry contract
```

gets exactly the **type labels** `fix`, `refactor`, `docs`. If the PR is ready to be reviewed, `needs-review` is also applied; Draft PRs do not get `needs-review`.

## Supported types

`feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `build`, `perf`, `style`, `chore`, `revert`, `security`, `deps`.

Scopes and breaking-change markers work: `fix(api): ...`, `refactor(core)!: ...`, `DOCS: ...`.

The bot creates a repository label **only when a matching commit first requires it**, reusing existing labels otherwise. Unknown/non-Conventional Commit subjects do not add a type label. Repeated commit types add one label.

## Synchronization policy

- On PR `opened`, `synchronize`, `reopened`, `ready_for_review`, `converted_to_draft`: fetch current PR status and paginate through **all** its commits.
- Add missing type labels; **remove obsolete type labels** when commits are amended, squashed or force-pushed. When a PR becomes Draft, remove only `needs-review`; restore it once ready.
- Preserve unrelated manually assigned labels such as `P0`, `bug`, `help wanted` or team-specific labels. A manual label with the same name as a managed commit type **will** be reconciled.
- Do not create every supported type label in advance. Type names and their colors live in `scripts/pr-labels.cjs`.
- The action may label fork PRs via `pull_request_target`, but **never checks out the fork/PR head**. It loads its helper from the trusted repository default branch only and executes no commit-message contents. Permissions are limited to reading PRs and writing issue labels.

## Tests and maintenance

```powershell
node --test tests/scripts/pr-labels.test.cjs
```

The existing CI lint/typecheck job runs these tests. Coverage includes multiple commit types, duplicates, body-text false positives, Draft/Ready transitions, stale labels, manual labels, dynamically created labels, and a closed PR.

**Deployment note:** `pull_request_target` uses the base repository workflow definition and checks out the default branch helper. A PR changing this labeling automation can be unit-tested by CI, but the new automated behavior only becomes active **after that PR is merged** into the default branch.

Reference: [GitHub Actions security guidance for pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).
