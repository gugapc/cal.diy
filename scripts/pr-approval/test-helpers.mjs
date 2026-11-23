// Shared fixtures for evaluate.test.mjs and collect.test.mjs: throwaway git
// repositories with a bare "origin" that serves refs/pull/<n>/head, like GitHub.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DIR = dirname(fileURLToPath(import.meta.url));
export const POLICY_PATH = join(DIR, "policy.json");
export const POLICY = JSON.parse(readFileSync(POLICY_PATH, "utf8"));

// Isolate from the user's git config (signing, hooks, aliases).
export const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

export function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    env: ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

/**
 * Creates <tmp>/origin.git (bare) and <tmp>/work (clone), with one commit on
 * main and a PR branch "feature" pushed to refs/pull/<pr>/head.
 */
export function makeRepos({
  pr = 7,
  base = { "README.md": "base\n" },
  change = { "docs/guide.md": "hello\n" },
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "pr-approval-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  git(root, "init", "--quiet", "--bare", "-b", "main", origin);
  git(root, "init", "--quiet", "-b", "main", work);
  writeFiles(work, base);
  git(work, "add", "-A");
  git(work, "commit", "--quiet", "-m", "base");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "--quiet", "origin", "main");
  git(work, "switch", "--quiet", "-c", "feature");
  writeFiles(work, change);
  git(work, "add", "-A");
  git(work, "commit", "--quiet", "-m", "change");
  git(work, "push", "--quiet", "origin", `HEAD:refs/pull/${pr}/head`);
  const head = git(work, "rev-parse", "HEAD");
  const baseSha = git(work, "rev-parse", "main");
  return {
    root,
    origin,
    work,
    pr,
    head,
    baseSha,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Pushes one more commit to the PR, as if the author updated it. */
export function movePr(repos, files = { "docs/late.md": "late\n" }) {
  writeFiles(repos.work, files);
  git(repos.work, "add", "-A");
  git(repos.work, "commit", "--quiet", "-m", "late change");
  git(repos.work, "push", "--quiet", "origin", `HEAD:refs/pull/${repos.pr}/head`);
  return git(repos.work, "rev-parse", "HEAD");
}

export function runNode(script, args, opts = {}) {
  return spawnSync(process.execPath, [join(DIR, script), ...args], { env: ENV, encoding: "utf8", ...opts });
}
