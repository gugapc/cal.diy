#!/usr/bin/env node
// Evidence collector for the PR auto-approval controller. It runs commands and
// writes what happened; it never decides anything.
//
//   node scripts/pr-approval/collect.mjs init --pr <n> [--evidence <file>] [--policy <file>] [--repo <dir>]
//     Reads the PR head with git ls-remote, fetches it and <remote>/<baseBranch>,
//     computes the merge-base and the diff, and writes a new evidence file
//     (path printed on stdout).
//
//   node scripts/pr-approval/collect.mjs run-checks --evidence <file> [--policy <file>] [--repo <dir>]
//     Checks out the PR head detached, runs every required check of the policy
//     (all of them, even after a failure), records command, output and exit code
//     after each one, and always switches back to where it started: on success,
//     on failure, on an exception and on SIGINT/SIGTERM.
//
// Exit codes: 0 done (whatever the checks returned), 1 collection error,
// 2 usage error, 130/143 interrupted (after restoring the checkout).

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_DECISIONS_DIR,
  DEFAULT_POLICY,
  expandCommand,
  gitAccess,
  sha256,
  validatePolicy,
} from "./evaluate.mjs";

const OUTPUT_LIMIT = 64 * 1024;

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

const now = () => new Date().toISOString();
const log = (msg) => process.stderr.write(`[collect] ${msg}\n`);

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function loadPolicy(path) {
  const text = readFileSync(path, "utf8");
  const policy = JSON.parse(text);
  const errors = validatePolicy(policy);
  if (errors.length) throw new Error(`invalid policy ${path}: ${errors.join("; ")}`);
  return { policy, sha: sha256(text) };
}

/** Keeps the tail of long output and says how much was cut. */
function truncate(text) {
  if (text.length <= OUTPUT_LIMIT) return { text, truncatedBytes: 0 };
  return { text: text.slice(-OUTPUT_LIMIT), truncatedBytes: text.length - OUTPUT_LIMIT };
}

/** Clean = no modified or staged tracked file. Untracked files are ignored (see README). */
function treeIsClean(repo) {
  return git(repo, ["status", "--porcelain", "--untracked-files=no"]) === "";
}

/** Where HEAD is now: a branch name, or a SHA when already detached. */
export function currentPosition(repo) {
  const branch = git(repo, ["branch", "--show-current"]);
  return branch
    ? { kind: "branch", ref: branch }
    : { kind: "detached", ref: git(repo, ["rev-parse", "HEAD"]) };
}

export function restorePosition(repo, pos) {
  if (pos.kind === "branch") git(repo, ["switch", "--quiet", pos.ref]);
  else git(repo, ["-c", "advice.detachedHead=false", "switch", "--quiet", "--detach", pos.ref]);
  return currentPosition(repo);
}

const describe = (pos) => (pos.kind === "branch" ? `branch ${pos.ref}` : `detached HEAD at ${pos.ref}`);

// ------------------------------------------------------------------ init

function init({ pr, evidence: evidencePath, policyPath, repo }) {
  const { policy, sha: policySha } = loadPolicy(policyPath);
  const g = gitAccess(repo);
  const { remote, baseBranch } = policy;

  const lsRemote = `git ls-remote ${remote} refs/pull/${pr}/head`;
  const headSha = g.resolveHead(remote, pr);
  const headAt = now();
  log(`PR #${pr} head on ${remote}: ${headSha}`);

  const fetchArgs = [
    "fetch",
    "--quiet",
    "--no-tags",
    remote,
    `+refs/pull/${pr}/head:refs/pr-approval/pull/${pr}/head`,
    `+refs/heads/${baseBranch}:refs/remotes/${remote}/${baseBranch}`,
  ];
  git(repo, fetchArgs);
  const fetched = git(repo, ["rev-parse", `refs/pr-approval/pull/${pr}/head`]);
  if (fetched !== headSha)
    throw new Error(
      `PR head moved while fetching (ls-remote ${headSha}, fetched ${fetched}); run init again`
    );

  const baseSha = g.mergeBase(remote, baseBranch, headSha);
  const files = g.diff(baseSha, headSha);
  const diffAt = now();

  const path = resolve(evidencePath ?? join(DEFAULT_DECISIONS_DIR, `pr-${pr}-${headSha}.evidence.json`));
  writeJson(path, {
    schemaVersion: 1,
    collector: "scripts/pr-approval/collect.mjs",
    policySha256: policySha,
    pr: {
      number: pr,
      remote,
      headSha,
      source: { command: lsRemote, at: headAt },
    },
    diff: {
      baseRef: `${remote}/${baseBranch}`,
      baseSha,
      headSha,
      files,
      source: {
        command: `git fetch ${fetchArgs.slice(2).join(" ")}; git merge-base refs/remotes/${remote}/${baseBranch} ${headSha}; git diff -z --numstat --no-renames ${baseSha} ${headSha}; git diff -z --name-status --no-renames ${baseSha} ${headSha}`,
        at: diffAt,
      },
    },
    checks: [],
  });
  log(`${files.length} file(s) in diff ${baseSha.slice(0, 12)}..${headSha.slice(0, 12)}`);
  process.stdout.write(`${path}\n`);
  return 0;
}

// ------------------------------------------------------------ run-checks

function runCommand(command, cwd, onChild) {
  return new Promise((resolvePromise) => {
    const child = spawn("bash", ["-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    onChild(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
      process.stderr.write(d);
    });
    child.stderr.on("data", (d) => {
      stderr += d;
      process.stderr.write(d);
    });
    child.on("error", (e) => {
      stderr += `\n[collect] spawn error: ${e.message}`;
    });
    child.on("close", (code, signal) => resolvePromise({ exitCode: code, signal, stdout, stderr }));
  });
}

async function runChecks({ evidence: evidencePath, policyPath, repo }) {
  const { policy } = loadPolicy(policyPath);
  const path = resolve(evidencePath);
  const evidence = JSON.parse(readFileSync(path, "utf8"));
  const headSha = evidence?.pr?.headSha;
  if (!headSha || !Array.isArray(evidence?.diff?.files))
    throw new Error(`${path} has no pr.headSha / diff.files; run init first`);
  if (!treeIsClean(repo))
    throw new Error("working tree has uncommitted changes to tracked files; commit or stash them first");

  const start = currentPosition(repo);
  log(`starting on ${describe(start)}`);

  let interrupted = null;
  let child = null;
  const onSignal = (sig) => {
    interrupted = sig;
    log(`${sig} received; stopping and restoring ${describe(start)}`);
    child?.kill(sig);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  evidence.checks = [];
  try {
    git(repo, ["-c", "advice.detachedHead=false", "switch", "--quiet", "--detach", headSha]);
    for (const check of policy.requiredChecks) {
      if (interrupted) break;
      const command = expandCommand(check.command, evidence.diff.files);
      const sha = git(repo, ["rev-parse", "HEAD"]);
      const treeClean = treeIsClean(repo);
      const startedAt = now();
      log(`running ${check.id}: ${command}`);
      const r = await runCommand(command, repo, (c) => {
        child = c;
      });
      child = null;
      const out = truncate(r.stdout);
      const err = truncate(r.stderr);
      evidence.checks.push({
        id: check.id,
        command,
        exitCode: r.exitCode,
        signal: r.signal,
        stdout: out.text,
        stderr: err.text,
        truncatedBytes: { stdout: out.truncatedBytes, stderr: err.truncatedBytes },
        sha,
        treeClean,
        startedAt,
        finishedAt: now(),
        source: `bash -c <command>, run by scripts/pr-approval/collect.mjs in ${repo} on a detached checkout of ${sha}`,
      });
      // Written after every check, so an interrupted run still leaves what it did.
      writeJson(path, evidence);
      log(`${check.id}: exit code ${r.exitCode}${r.signal ? ` (signal ${r.signal})` : ""}`);
    }
  } finally {
    let after;
    try {
      after = restorePosition(repo, start);
    } catch (e) {
      log(`COULD NOT RESTORE ${describe(start)}: ${e.message}`);
      process.stdout.write(`started: ${describe(start)}\nrestored: FAILED\n`);
      process.exitCode = 1;
    }
    if (after) {
      const same = after.kind === start.kind && after.ref === start.ref;
      process.stdout.write(
        `started: ${describe(start)}\nrestored: ${describe(after)}${same ? "" : " (DIFFERENT)"}\n`
      );
      if (!same) process.exitCode = 1;
    }
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
  writeJson(path, evidence);
  if (interrupted) return interrupted === "SIGINT" ? 130 : 143;
  process.stdout.write(`${path}\n`);
  return process.exitCode ?? 0;
}

// ------------------------------------------------------------------- CLI

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd };
  const valued = { "--pr": "pr", "--evidence": "evidence", "--policy": "policy", "--repo": "repo" };
  for (let i = 0; i < rest.length; i++) {
    if (valued[rest[i]] && i + 1 < rest.length) opts[valued[rest[i]]] = rest[++i];
    else throw new Error(`unknown or incomplete argument: ${rest[i]}`);
  }
  if (cmd === "init") {
    if (!/^[1-9]\d*$/.test(opts.pr ?? "")) throw new Error("init needs --pr <number>");
    opts.pr = Number(opts.pr);
  } else if (cmd === "run-checks") {
    if (!opts.evidence) throw new Error("run-checks needs --evidence <file>");
  } else throw new Error(`unknown command: ${cmd ?? "(none)"}`);
  opts.policyPath = resolve(opts.policy ?? DEFAULT_POLICY);
  opts.repo = resolve(opts.repo ?? process.cwd());
  opts.repo = git(opts.repo, ["rev-parse", "--show-toplevel"]);
  return opts;
}

export async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(
      `collect: ${e.message}\nusage: collect.mjs init --pr <n> [--evidence <file>] | run-checks --evidence <file>  [--policy <file>] [--repo <dir>]\n`
    );
    return 2;
  }
  try {
    return opts.cmd === "init" ? init(opts) : await runChecks(opts);
  } catch (e) {
    process.stderr.write(`collect: ${(e?.stderr?.toString().trim() || e.message).split("\n")[0]}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
