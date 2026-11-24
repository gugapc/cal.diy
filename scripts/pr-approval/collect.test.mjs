// Run with: node --test scripts/pr-approval/*.test.mjs

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { afterEach, describe, test } from "node:test";
import { DIR, ENV, git, makeRepos, POLICY, runNode, writeFiles } from "./test-helpers.mjs";

let repos;
afterEach(() => repos?.cleanup());

/** Same rules as the real policy, with cheap checks. */
function writePolicy(checks) {
  const path = join(repos.root, "policy.json");
  writeFileSync(path, JSON.stringify({ ...POLICY, requiredChecks: checks }));
  return path;
}

function collect(args) {
  return runNode("collect.mjs", [...args, "--repo", repos.work]);
}

function initEvidence(policy) {
  const evidence = join(repos.root, "evidence.json");
  const r = collect(["init", "--pr", String(repos.pr), "--evidence", evidence, "--policy", policy]);
  assert.equal(r.status, 0, r.stderr);
  return evidence;
}

describe("collect.mjs", () => {
  test("init records the PR head, merge-base and git diff", () => {
    repos = makeRepos();
    git(repos.work, "switch", "--quiet", "main");
    const evidence = JSON.parse(readFileSync(initEvidence(writePolicy(POLICY.requiredChecks)), "utf8"));
    assert.equal(evidence.pr.number, repos.pr);
    assert.equal(evidence.pr.headSha, repos.head);
    assert.equal(evidence.pr.source.command, `git ls-remote origin refs/pull/${repos.pr}/head`);
    assert.equal(evidence.diff.baseSha, repos.baseSha);
    assert.deepEqual(evidence.diff.files, [
      { path: "docs/guide.md", status: "A", additions: 1, deletions: 0, binary: false },
    ]);
    assert.deepEqual(evidence.checks, []);
  });

  test("run-checks runs every check even after a failure, records them, and switches back", () => {
    repos = makeRepos();
    git(repos.work, "switch", "--quiet", "main");
    const policy = writePolicy([
      { id: "fails", command: "echo boom >&2; exit 3 # {changedFiles}" },
      { id: "lists", command: "ls {changedFiles}" },
    ]);
    const evidencePath = initEvidence(policy);
    const r = collect(["run-checks", "--evidence", evidencePath, "--policy", policy]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /started: branch main\nrestored: branch main\n/);
    assert.equal(git(repos.work, "branch", "--show-current"), "main");

    const { checks } = JSON.parse(readFileSync(evidencePath, "utf8"));
    assert.deepEqual(
      checks.map((c) => [c.id, c.exitCode]),
      [
        ["fails", 3],
        ["lists", 0],
      ]
    );
    assert.equal(checks[0].command, "echo boom >&2; exit 3 # 'docs/guide.md'");
    assert.match(checks[0].stderr, /boom/);
    assert.match(checks[1].stdout, /docs\/guide\.md/); // the file only exists at the PR head
    for (const c of checks) {
      assert.equal(c.sha, repos.head);
      assert.equal(c.treeClean, true);
    }

    // The controller turns that evidence into a rejection naming the failed check.
    const ev = runNode("evaluate.mjs", [
      "--evidence",
      evidencePath,
      "--policy",
      policy,
      "--decisions-dir",
      join(repos.root, "decisions"),
      "--repo",
      repos.work,
    ]);
    assert.equal(ev.status, 1);
    assert.match(ev.stdout, /FAIL {2}check:fails: exit code 3/);
    assert.match(ev.stdout, /PASS {2}check:lists: /);
  });

  test("an approved run end to end: init, run-checks, evaluate", () => {
    repos = makeRepos();
    git(repos.work, "switch", "--quiet", "main");
    const policy = writePolicy([{ id: "lists", command: "ls {changedFiles}" }]);
    const evidencePath = initEvidence(policy);
    assert.equal(collect(["run-checks", "--evidence", evidencePath, "--policy", policy]).status, 0);
    const ev = runNode("evaluate.mjs", [
      "--evidence",
      evidencePath,
      "--policy",
      policy,
      "--decisions-dir",
      join(repos.root, "decisions"),
      "--repo",
      repos.work,
    ]);
    assert.equal(ev.status, 0, ev.stdout);
    assert.match(ev.stdout, /Decision: APPROVED/);
  });

  test("returns to a detached starting point", () => {
    repos = makeRepos();
    git(repos.work, "switch", "--quiet", "--detach", "main");
    const policy = writePolicy([{ id: "ok", command: "true {changedFiles}" }]);
    const r = collect(["run-checks", "--evidence", initEvidence(policy), "--policy", policy]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(
      r.stdout,
      new RegExp(`started: detached HEAD at ${repos.baseSha}\nrestored: detached HEAD at ${repos.baseSha}\n`)
    );
    assert.equal(git(repos.work, "rev-parse", "HEAD"), repos.baseSha);
  });

  test("switches back when interrupted with SIGINT", async () => {
    repos = makeRepos();
    git(repos.work, "switch", "--quiet", "main");
    const policy = writePolicy([
      { id: "slow", command: "sleep 30 # {changedFiles}" },
      { id: "never", command: "true {changedFiles}" },
    ]);
    const evidencePath = initEvidence(policy);
    const child = spawn(
      process.execPath,
      [
        join(DIR, "collect.mjs"),
        "run-checks",
        "--evidence",
        evidencePath,
        "--policy",
        policy,
        "--repo",
        repos.work,
      ],
      { env: ENV }
    );
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    await new Promise((res) => {
      child.stderr.on("data", (d) => {
        if (String(d).includes("running slow")) setTimeout(() => child.kill("SIGINT"), 200);
      });
      child.on("close", (code) => {
        assert.equal(code, 130);
        res();
      });
    });
    assert.match(stdout, /started: branch main\nrestored: branch main\n/);
    assert.equal(git(repos.work, "branch", "--show-current"), "main");
    const { checks } = JSON.parse(readFileSync(evidencePath, "utf8"));
    assert.ok(!checks.some((c) => c.id === "never"), "no check may start after the interrupt");
    assert.ok(checks.every((c) => c.exitCode !== 0));
  });

  test("refuses to start on a dirty tree and leaves HEAD alone", () => {
    repos = makeRepos();
    git(repos.work, "switch", "--quiet", "main");
    const policy = writePolicy([{ id: "ok", command: "true {changedFiles}" }]);
    const evidencePath = initEvidence(policy);
    writeFiles(repos.work, { "README.md": "dirty\n" });
    const r = collect(["run-checks", "--evidence", evidencePath, "--policy", policy]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /uncommitted changes/);
    assert.equal(git(repos.work, "branch", "--show-current"), "main");
    assert.equal(readFileSync(join(repos.work, "README.md"), "utf8"), "dirty\n");
  });
});
