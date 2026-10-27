// Use Node instead of POSIX shell so npm ci works on Windows and Unix.
const { execSync } = require("node:child_process");
const { existsSync } = require("node:fs");

// Git hooks are for local development only; worktrees have a .git file.
if (
  !process.env.CI &&
  process.env.NODE_ENV !== "production" &&
  existsSync(".git")
) {
  execSync("husky install", { stdio: "inherit" });
}
