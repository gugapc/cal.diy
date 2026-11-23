#!/usr/bin/env node
// PR auto-approval controller. Reads an evidence file, applies policy.json and
// records the decision. The decision is made here and nowhere else.
//
// Usage:
//   node scripts/pr-approval/evaluate.mjs --evidence <file>
//        [--policy <file>] [--decisions-dir <dir>] [--repo <dir>] [--json]
//
// Exit codes: 0 approved, 1 rejected, 2 usage or policy error.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_POLICY = join(SCRIPT_DIR, "policy.json");
export const DEFAULT_DECISIONS_DIR = join(SCRIPT_DIR, "decisions");
const SHA_RE = /^[0-9a-f]{40}$/;

// ---------------------------------------------------------------- helpers

// Minimal glob -> RegExp: "**/" (zero or more dirs), "**", "*" (no slash), "?".
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; ) {
    if (glob.startsWith("**/", i)) {
      re += "(?:.*/)?";
      i += 3;
    } else if (glob.startsWith("**", i)) {
      re += ".*";
      i += 2;
    } else if (glob[i] === "*") {
      re += "[^/]*";
      i += 1;
    } else if (glob[i] === "?") {
      re += "[^/]";
      i += 1;
    } else {
      re += glob[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs) {
  return globs.some((g) => globToRegExp(g).test(path));
}

export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** Files that still exist at head (added or modified), sorted: what the checks run on. */
export function changedFiles(files) {
  return files
    .filter((f) => f.status !== "D")
    .map((f) => f.path)
    .sort();
}

/** Expands `{changedFiles}` in a policy command template. */
export function expandCommand(template, files) {
  return template.replaceAll("{changedFiles}", changedFiles(files).map(shellQuote).join(" "));
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function validatePolicy(policy) {
  const errors = [];
  const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!policy || typeof policy !== "object") return ["policy is not an object"];
  if (typeof policy.remote !== "string" || !policy.remote) errors.push("remote must be a string");
  if (typeof policy.baseBranch !== "string" || !policy.baseBranch) errors.push("baseBranch must be a string");
  if (!isStrArray(policy.allowedPaths)) errors.push("allowedPaths must be an array of globs");
  if (!Number.isInteger(policy.maxDiff?.lines) || !Number.isInteger(policy.maxDiff?.files))
    errors.push("maxDiff.lines and maxDiff.files must be integers");
  if (
    !Array.isArray(policy.requiredChecks) ||
    !policy.requiredChecks.every((c) => typeof c?.id === "string" && typeof c?.command === "string")
  )
    errors.push("requiredChecks must be an array of {id, command}");
  if (!isStrArray(policy.humanReview?.paths)) errors.push("humanReview.paths must be an array of globs");
  return errors;
}

// ------------------------------------------------------------- git access

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Parses `git diff -z --numstat` + `git diff -z --name-status` (both --no-renames). */
export function parseDiff(numstatZ, nameStatusZ) {
  const status = new Map();
  const ns = nameStatusZ.split("\0").filter((x) => x !== "");
  for (let i = 0; i + 1 < ns.length; i += 2) status.set(ns[i + 1], ns[i]);
  const files = [];
  for (const rec of numstatZ.split("\0")) {
    if (!rec) continue;
    const [a, d, ...rest] = rec.split("\t");
    const path = rest.join("\t");
    const binary = a === "-" && d === "-";
    files.push({
      path,
      status: status.get(path) ?? "?",
      additions: binary ? 0 : Number(a),
      deletions: binary ? 0 : Number(d),
      binary,
    });
  }
  return files.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
}

/** Real git access. Tests inject a stub with the same shape. */
export function gitAccess(repo) {
  return {
    resolveHead(remote, prNumber) {
      const out = git(repo, ["ls-remote", remote, `refs/pull/${prNumber}/head`]).trim();
      const sha = out.split(/\s+/)[0];
      if (!SHA_RE.test(sha ?? "")) throw new Error(`no refs/pull/${prNumber}/head on ${remote}`);
      return sha;
    },
    mergeBase(remote, baseBranch, head) {
      return git(repo, ["merge-base", `refs/remotes/${remote}/${baseBranch}`, head]).trim();
    },
    diff(base, head) {
      for (const sha of [base, head]) git(repo, ["cat-file", "-e", `${sha}^{commit}`]);
      const numstat = git(repo, ["diff", "-z", "--numstat", "--no-renames", base, head]);
      const nameStatus = git(repo, ["diff", "-z", "--name-status", "--no-renames", base, head]);
      return parseDiff(numstat, nameStatus);
    },
  };
}

// ---------------------------------------------------------------- core

function errMsg(e) {
  return (e?.stderr?.toString().trim() || e?.message || String(e)).split("\n")[0];
}

function normalizeFiles(files) {
  return files
    .map((f) => ({
      path: f.path,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      binary: Boolean(f.binary),
    }))
    .sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
}

function describeFileMismatch(claimed, actual) {
  const key = (f) => JSON.stringify(f);
  const byPath = (list) => new Map(list.map((f) => [f.path, f]));
  const c = byPath(claimed);
  const a = byPath(actual);
  const issues = [];
  for (const [p, f] of a) {
    if (!c.has(p)) issues.push(`missing from evidence: ${p}`);
    else if (key(c.get(p)) !== key(f))
      issues.push(
        `differs: ${p} (evidence ${c.get(p).status} +${c.get(p).additions}/-${c.get(p).deletions}, git ${f.status} +${f.additions}/-${f.deletions})`
      );
  }
  for (const p of c.keys()) if (!a.has(p)) issues.push(`not in git diff: ${p}`);
  return issues;
}

/**
 * Applies the policy to the evidence. Every condition is evaluated and
 * reported; the decision is "approved" only if all of them pass.
 *
 * @param {object} args
 * @param {object} args.policy
 * @param {object|null} args.evidence  parsed evidence, or null when missing/unreadable
 * @param {string} [args.evidenceError] why the evidence could not be read
 * @param {{resolveHead: Function, mergeBase: Function, diff: Function}} args.git
 */
export function evaluate({ policy, evidence, evidenceError, git: g }) {
  const conditions = [];
  const add = (id, passed, reason) => conditions.push({ id, passed: Boolean(passed), reason });
  const result = (pr, sha) => ({
    pr,
    sha,
    decision: conditions.every((c) => c.passed) ? "approved" : "rejected",
    conditions,
  });

  // 1. Evidence present and well-formed. Without it nothing else can be judged.
  const shapeErrors = [];
  if (!evidence) shapeErrors.push(evidenceError || "no evidence");
  else {
    if (!Number.isInteger(evidence.pr?.number) || evidence.pr.number <= 0)
      shapeErrors.push("pr.number missing");
    if (!SHA_RE.test(evidence.pr?.headSha ?? "")) shapeErrors.push("pr.headSha missing");
    if (!SHA_RE.test(evidence.diff?.baseSha ?? "")) shapeErrors.push("diff.baseSha missing");
    if (!SHA_RE.test(evidence.diff?.headSha ?? "")) shapeErrors.push("diff.headSha missing");
    if (!Array.isArray(evidence.diff?.files)) shapeErrors.push("diff.files missing");
    if (!Array.isArray(evidence.checks)) shapeErrors.push("checks missing");
  }
  if (shapeErrors.length) {
    add("evidence.present", false, `Evidence missing or malformed: ${shapeErrors.join("; ")}.`);
    return result(evidence?.pr?.number ?? null, evidence?.pr?.headSha ?? null);
  }
  add("evidence.present", true, "Evidence file read; pr, diff and checks sections present.");

  const prNumber = evidence.pr.number;
  const claimedHead = evidence.pr.headSha;

  // 2. Live PR head equals the head the evidence was collected for.
  let liveHead = null;
  try {
    liveHead = g.resolveHead(policy.remote, prNumber);
    add(
      "pr.head",
      liveHead === claimedHead,
      liveHead === claimedHead
        ? `PR #${prNumber} head on ${policy.remote} is ${liveHead}, as in the evidence.`
        : `PR #${prNumber} head on ${policy.remote} is ${liveHead}, but the evidence is for ${claimedHead}.`
    );
  } catch (e) {
    add("pr.head", false, `Could not read the head of PR #${prNumber} on ${policy.remote}: ${errMsg(e)}.`);
  }
  const head = claimedHead;

  // 3. Diff evidence is for the same head.
  add(
    "diff.sha",
    evidence.diff.headSha === head,
    evidence.diff.headSha === head
      ? `Diff evidence is for ${head}.`
      : `Diff evidence is for ${evidence.diff.headSha}, not the PR head ${head}.`
  );

  // 4. Diff base is the merge-base with <remote>/<baseBranch>.
  try {
    const mb = g.mergeBase(policy.remote, policy.baseBranch, head);
    add(
      "diff.base",
      mb === evidence.diff.baseSha,
      mb === evidence.diff.baseSha
        ? `Diff base ${mb} is the merge-base with ${policy.remote}/${policy.baseBranch}.`
        : `Diff base in evidence is ${evidence.diff.baseSha}, but the merge-base with ${policy.remote}/${policy.baseBranch} is ${mb}.`
    );
  } catch (e) {
    add(
      "diff.base",
      false,
      `Could not compute the merge-base with ${policy.remote}/${policy.baseBranch}: ${errMsg(e)}.`
    );
  }

  // 5. Recompute the diff from git; never trust the evidence's file list.
  let files = null;
  try {
    files = normalizeFiles(g.diff(evidence.diff.baseSha, head));
    const issues = describeFileMismatch(normalizeFiles(evidence.diff.files), files);
    add(
      "diff.recomputed",
      issues.length === 0,
      issues.length === 0
        ? `git diff ${evidence.diff.baseSha.slice(0, 12)}..${head.slice(0, 12)} matches the evidence (${files.length} file(s)).`
        : `Evidence file list does not match git: ${issues.slice(0, 10).join("; ")}${issues.length > 10 ? `; … ${issues.length - 10} more` : ""}.`
    );
  } catch (e) {
    add("diff.recomputed", false, `Could not recompute the diff from git: ${errMsg(e)}.`);
  }

  // 6–9. Path and size rules, on the recomputed list.
  if (files) {
    const outside = files.filter((f) => !matchesAny(f.path, policy.allowedPaths)).map((f) => f.path);
    add(
      "paths.allowed",
      outside.length === 0,
      outside.length === 0
        ? "All changed files are within allowedPaths."
        : `Outside allowedPaths: ${outside.join(", ")}.`
    );

    const human = files.filter((f) => matchesAny(f.path, policy.humanReview.paths)).map((f) => f.path);
    add(
      "paths.humanReview",
      human.length === 0,
      human.length === 0
        ? "No changed file requires human review."
        : `Require human review: ${human.join(", ")}.`
    );

    const lines = files.reduce((n, f) => n + f.additions + f.deletions, 0);
    const binaries = files.filter((f) => f.binary).map((f) => f.path);
    const linesOk = lines <= policy.maxDiff.lines && binaries.length === 0;
    add(
      "diff.lines",
      linesOk,
      binaries.length
        ? `Binary file(s) cannot be measured: ${binaries.join(", ")}.`
        : `${lines} changed line(s); limit ${policy.maxDiff.lines}.`
    );

    const remaining = changedFiles(files).length;
    const filesOk = files.length <= policy.maxDiff.files && remaining > 0;
    add(
      "diff.files",
      filesOk,
      remaining === 0
        ? `${files.length} file(s), none added or modified: nothing for the checks to run on.`
        : `${files.length} changed file(s); limit ${policy.maxDiff.files}.`
    );
  } else {
    for (const id of ["paths.allowed", "paths.humanReview", "diff.lines", "diff.files"])
      add(id, false, "Not evaluated: the diff could not be recomputed from git.");
  }

  // 10. Required checks.
  for (const check of policy.requiredChecks) {
    const id = `check:${check.id}`;
    const runs = evidence.checks.filter((c) => c?.id === check.id);
    if (runs.length === 0) {
      add(id, false, `No evidence for required check "${check.id}".`);
      continue;
    }
    if (runs.length > 1) {
      add(id, false, `${runs.length} evidence entries for "${check.id}"; expected exactly one.`);
      continue;
    }
    const run = runs[0];
    const problems = [];
    if (run.sha !== head) problems.push(`ran on ${run.sha ?? "unknown commit"}, not the PR head ${head}`);
    if (run.treeClean !== true) problems.push("working tree was not clean when it ran");
    if (files) {
      const expected = expandCommand(check.command, files);
      if (run.command !== expected)
        problems.push(`command was \`${run.command}\`, policy requires \`${expected}\``);
    } else problems.push("command not verifiable: the diff could not be recomputed");
    if (run.exitCode !== 0) problems.push(`exit code ${run.exitCode ?? "missing"}`);
    add(
      id,
      problems.length === 0,
      problems.length === 0 ? `Ran \`${run.command}\` on ${head}: exit code 0.` : `${problems.join("; ")}.`
    );
  }

  // 11. Right before recording, re-read the PR head.
  try {
    const again = g.resolveHead(policy.remote, prNumber);
    add(
      "pr.headRecheck",
      again === head,
      again === head
        ? `PR #${prNumber} head re-read before recording: still ${again}.`
        : `PR #${prNumber} head changed to ${again} while evaluating ${head}.`
    );
  } catch (e) {
    add("pr.headRecheck", false, `Could not re-read the head of PR #${prNumber}: ${errMsg(e)}.`);
  }

  return result(prNumber, head);
}

// ----------------------------------------------------------------- CLI

export function formatText(record) {
  const lines = [
    `PR:       ${record.pr === null ? "unknown" : `#${record.pr}`}`,
    `Commit:   ${record.sha ?? "unknown"}`,
    `Decision: ${record.decision.toUpperCase()}`,
    "Conditions:",
    ...record.conditions.map((c) => `  ${c.passed ? "PASS" : "FAIL"}  ${c.id}: ${c.reason}`),
    `Policy:   ${record.policy.path} (sha256 ${record.policy.sha256.slice(0, 16)}…)`,
    `Evidence: ${record.evidence.path}${record.evidence.sha256 ? ` (sha256 ${record.evidence.sha256.slice(0, 16)}…)` : ""}`,
  ];
  if (record.recordPath) lines.push(`Record:   ${record.recordPath}`);
  return lines.join("\n");
}

function parseArgs(argv) {
  const opts = { json: false };
  const valued = {
    "--evidence": "evidence",
    "--policy": "policy",
    "--decisions-dir": "decisionsDir",
    "--repo": "repo",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (valued[a] && i + 1 < argv.length) opts[valued[a]] = argv[++i];
    else throw new Error(`unknown or incomplete argument: ${a}`);
  }
  if (!opts.evidence) throw new Error("--evidence <file> is required");
  return opts;
}

export function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(
      `evaluate: ${e.message}\nusage: evaluate.mjs --evidence <file> [--policy <file>] [--decisions-dir <dir>] [--repo <dir>] [--json]\n`
    );
    return 2;
  }

  const policyPath = resolve(opts.policy ?? DEFAULT_POLICY);
  let policyText;
  let policy;
  try {
    policyText = readFileSync(policyPath, "utf8");
    policy = JSON.parse(policyText);
  } catch (e) {
    process.stderr.write(`evaluate: cannot read policy ${policyPath}: ${e.message}\n`);
    return 2;
  }
  const policyErrors = validatePolicy(policy);
  if (policyErrors.length) {
    process.stderr.write(`evaluate: invalid policy ${policyPath}: ${policyErrors.join("; ")}\n`);
    return 2;
  }

  const evidencePath = resolve(opts.evidence);
  let evidence = null;
  let evidenceError;
  let evidenceText = null;
  if (!existsSync(evidencePath)) evidenceError = `file not found: ${evidencePath}`;
  else {
    try {
      evidenceText = readFileSync(evidencePath, "utf8");
      evidence = JSON.parse(evidenceText);
    } catch (e) {
      evidenceError = `cannot parse ${evidencePath}: ${e.message}`;
    }
  }

  const repo = resolve(opts.repo ?? process.cwd());
  const outcome = evaluate({ policy, evidence, evidenceError, git: gitAccess(repo) });
  const evaluatedAt = new Date().toISOString();
  const record = {
    ...outcome,
    evaluatedAt,
    remote: policy.remote,
    policy: { path: relative(repo, policyPath) || policyPath, sha256: sha256(policyText) },
    evidence: {
      path: relative(repo, evidencePath) || evidencePath,
      sha256: evidenceText === null ? null : sha256(evidenceText),
    },
  };

  const decisionsDir = resolve(opts.decisionsDir ?? DEFAULT_DECISIONS_DIR);
  const name =
    record.pr !== null && record.sha
      ? `pr-${record.pr}-${record.sha}.json`
      : `pr-unknown-${evaluatedAt.replace(/[:.]/g, "-")}.json`;
  const recordPath = join(decisionsDir, name);
  try {
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    record.recordPath = relative(repo, recordPath) || recordPath;
  } catch (e) {
    // A decision that cannot be recorded is not an approval.
    record.conditions.push({
      id: "record.write",
      passed: false,
      reason: `Could not write ${recordPath}: ${e.message}.`,
    });
    record.decision = "rejected";
  }

  process.stdout.write(`${opts.json ? JSON.stringify(record, null, 2) : formatText(record)}\n`);
  return record.decision === "approved" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
