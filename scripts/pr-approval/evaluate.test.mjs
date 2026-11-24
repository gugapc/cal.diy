// Run with: node --test scripts/pr-approval/*.test.mjs

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { evaluate, expandCommand, gitAccess, globToRegExp, matchesAny, parseDiff } from "./evaluate.mjs";
import { makeRepos, movePr, POLICY, POLICY_PATH, runNode } from "./test-helpers.mjs";

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const BASE = "c".repeat(40);
const DOCS = [{ path: "docs/guide.md", status: "M", additions: 10, deletions: 2, binary: false }];

function stubGit({ heads = [HEAD], mergeBase = BASE, files = DOCS } = {}) {
  let call = 0;
  return {
    resolveHead() {
      const h = heads[Math.min(call++, heads.length - 1)];
      if (h instanceof Error) throw h;
      return h;
    },
    mergeBase: () => mergeBase,
    diff() {
      if (files instanceof Error) throw files;
      return structuredClone(files);
    },
  };
}

function passingChecks(files, sha = HEAD, policy = POLICY) {
  return policy.requiredChecks.map((c) => ({
    id: c.id,
    command: expandCommand(c.command, files),
    exitCode: 0,
    stdout: "ok",
    stderr: "",
    sha,
    treeClean: true,
  }));
}

function makeEvidence({ files = DOCS, head = HEAD, checks } = {}) {
  return {
    schemaVersion: 1,
    pr: { number: 7, remote: "origin", headSha: head },
    diff: { baseRef: "origin/main", baseSha: BASE, headSha: head, files: structuredClone(files) },
    checks: checks ?? passingChecks(files, head),
  };
}

function run({ evidence = makeEvidence(), git = stubGit(), policy = POLICY, evidenceError } = {}) {
  return evaluate({ policy, evidence, evidenceError, git });
}

const failed = (r) => r.conditions.filter((c) => !c.passed).map((c) => c.id);
const cond = (r, id) => r.conditions.find((c) => c.id === id);

describe("evaluate()", () => {
  test("approves a small docs PR with passing checks on the PR head", () => {
    const r = run();
    assert.equal(r.decision, "approved");
    assert.equal(r.pr, 7);
    assert.equal(r.sha, HEAD);
    assert.deepEqual(failed(r), []);
    assert.ok(r.conditions.every((c) => typeof c.reason === "string" && c.reason.length > 0));
    for (const id of [
      "evidence.present",
      "pr.head",
      "diff.sha",
      "diff.base",
      "diff.recomputed",
      "paths.allowed",
      "paths.humanReview",
      "diff.lines",
      "diff.files",
      "check:biome",
      "check:vitest-related",
      "pr.headRecheck",
    ])
      assert.ok(cond(r, id), `missing condition ${id}`);
  });

  test("rejects a file outside allowedPaths", () => {
    const files = [
      ...DOCS,
      { path: "apps/web/pages/index.tsx", status: "M", additions: 1, deletions: 1, binary: false },
    ];
    const r = run({ evidence: makeEvidence({ files }), git: stubGit({ files }) });
    assert.equal(r.decision, "rejected");
    assert.deepEqual(failed(r), ["paths.allowed"]);
    assert.match(cond(r, "paths.allowed").reason, /apps\/web\/pages\/index\.tsx/);
  });

  for (const path of [
    ".claude/skills/research/SKILL.md",
    "CLAUDE.md",
    "specs/x/CLAUDE.md",
    "scripts/pr-approval/README.md",
  ]) {
    test(`requires human review for ${path} even though it matches allowedPaths`, () => {
      const files = [{ path, status: "M", additions: 1, deletions: 0, binary: false }];
      const r = run({ evidence: makeEvidence({ files }), git: stubGit({ files }) });
      assert.equal(r.decision, "rejected");
      assert.ok(failed(r).includes("paths.humanReview"));
      assert.match(cond(r, "paths.humanReview").reason, new RegExp(path.replace(/\./g, "\\.")));
    });
  }

  test("rejects a diff with too many lines", () => {
    const files = [
      { path: "docs/big.md", status: "A", additions: POLICY.maxDiff.lines + 1, deletions: 0, binary: false },
    ];
    const r = run({ evidence: makeEvidence({ files }), git: stubGit({ files }) });
    assert.equal(r.decision, "rejected");
    assert.deepEqual(failed(r), ["diff.lines"]);
    assert.match(cond(r, "diff.lines").reason, new RegExp(`${POLICY.maxDiff.lines + 1} changed line`));
  });

  test("accepts a diff exactly at the line limit", () => {
    const files = [
      { path: "docs/big.md", status: "A", additions: POLICY.maxDiff.lines, deletions: 0, binary: false },
    ];
    assert.equal(run({ evidence: makeEvidence({ files }), git: stubGit({ files }) }).decision, "approved");
  });

  test("rejects a diff with too many files", () => {
    const files = Array.from({ length: POLICY.maxDiff.files + 1 }, (_, i) => ({
      path: `docs/f${String(i).padStart(2, "0")}.md`,
      status: "A",
      additions: 1,
      deletions: 0,
      binary: false,
    }));
    const r = run({ evidence: makeEvidence({ files }), git: stubGit({ files }) });
    assert.equal(r.decision, "rejected");
    assert.deepEqual(failed(r), ["diff.files"]);
  });

  test("rejects a binary file, whose size cannot be measured", () => {
    const files = [{ path: "docs/diagram.png", status: "A", additions: 0, deletions: 0, binary: true }];
    const r = run({ evidence: makeEvidence({ files }), git: stubGit({ files }) });
    assert.equal(r.decision, "rejected");
    assert.ok(failed(r).includes("diff.lines"));
    assert.match(cond(r, "diff.lines").reason, /Binary/);
  });

  test("rejects a deletion-only PR (nothing left to check)", () => {
    const files = [{ path: "docs/old.md", status: "D", additions: 0, deletions: 5, binary: false }];
    const r = run({ evidence: makeEvidence({ files }), git: stubGit({ files }) });
    assert.equal(r.decision, "rejected");
    assert.deepEqual(failed(r), ["diff.files"]);
  });

  test("rejects a failed check", () => {
    const evidence = makeEvidence();
    evidence.checks[0].exitCode = 1;
    const r = run({ evidence });
    assert.equal(r.decision, "rejected");
    assert.deepEqual(failed(r), ["check:biome"]);
    assert.match(cond(r, "check:biome").reason, /exit code 1/);
  });

  test("rejects a check run with a command other than the policy's", () => {
    const evidence = makeEvidence();
    evidence.checks[1].command = "true";
    const r = run({ evidence });
    assert.deepEqual(failed(r), ["check:vitest-related"]);
    assert.match(cond(r, "check:vitest-related").reason, /policy requires/);
  });

  test("rejects a missing check", () => {
    const evidence = makeEvidence();
    evidence.checks = evidence.checks.filter((c) => c.id !== "biome");
    const r = run({ evidence });
    assert.deepEqual(failed(r), ["check:biome"]);
    assert.match(cond(r, "check:biome").reason, /No evidence/);
  });

  test("rejects a check recorded twice", () => {
    const evidence = makeEvidence();
    evidence.checks.push({ ...evidence.checks[0] });
    assert.deepEqual(failed(run({ evidence })), ["check:biome"]);
  });

  test("rejects a check run on a dirty tree", () => {
    const evidence = makeEvidence();
    evidence.checks[0].treeClean = false;
    assert.deepEqual(failed(run({ evidence })), ["check:biome"]);
  });

  test("rejects missing evidence", () => {
    const r = run({ evidence: null, evidenceError: "file not found: /x.json" });
    assert.equal(r.decision, "rejected");
    assert.equal(r.pr, null);
    assert.deepEqual(
      r.conditions.map((c) => [c.id, c.passed]),
      [["evidence.present", false]]
    );
    assert.match(r.conditions[0].reason, /file not found/);
  });

  test("rejects evidence without the checks section", () => {
    const evidence = makeEvidence();
    delete evidence.checks;
    const r = run({ evidence });
    assert.equal(r.decision, "rejected");
    assert.match(cond(r, "evidence.present").reason, /checks missing/);
  });

  test("rejects a check from another commit", () => {
    const evidence = makeEvidence();
    evidence.checks[0].sha = OTHER;
    const r = run({ evidence });
    assert.deepEqual(failed(r), ["check:biome"]);
    assert.match(cond(r, "check:biome").reason, new RegExp(`ran on ${OTHER}`));
  });

  test("rejects diff evidence from another commit", () => {
    const evidence = makeEvidence();
    evidence.diff.headSha = OTHER;
    assert.deepEqual(failed(run({ evidence })), ["diff.sha"]);
  });

  test("rejects evidence for a commit that is not the PR head", () => {
    const r = run({ evidence: makeEvidence({ head: OTHER }), git: stubGit({ heads: [HEAD] }) });
    assert.equal(r.decision, "rejected");
    assert.ok(failed(r).includes("pr.head"));
    assert.ok(failed(r).includes("pr.headRecheck"));
  });

  test("rejects when the PR head changes before the decision is recorded", () => {
    const r = run({ git: stubGit({ heads: [HEAD, OTHER] }) });
    assert.equal(r.decision, "rejected");
    assert.deepEqual(failed(r), ["pr.headRecheck"]);
    assert.match(cond(r, "pr.headRecheck").reason, /changed/);
  });

  test("rejects when the PR head cannot be read", () => {
    const r = run({ git: stubGit({ heads: [new Error("network down")] }) });
    assert.deepEqual(failed(r), ["pr.head", "pr.headRecheck"]);
  });

  test("rejects an evidence file list that differs from the recomputed git diff", () => {
    const real = [
      ...DOCS,
      { path: "apps/web/secret.ts", status: "A", additions: 3, deletions: 0, binary: false },
    ];
    const r = run({ evidence: makeEvidence({ files: DOCS }), git: stubGit({ files: real }) });
    assert.equal(r.decision, "rejected");
    assert.ok(failed(r).includes("diff.recomputed"));
    assert.match(cond(r, "diff.recomputed").reason, /missing from evidence: apps\/web\/secret\.ts/);
    // Path rules run on what git says, not on what the evidence claims.
    assert.ok(failed(r).includes("paths.allowed"));
  });

  test("rejects understated line counts in the evidence", () => {
    const claimed = [{ ...DOCS[0], additions: 1 }];
    const r = run({ evidence: makeEvidence({ files: claimed }), git: stubGit({ files: DOCS }) });
    assert.ok(failed(r).includes("diff.recomputed"));
  });

  test("rejects when the diff cannot be recomputed (commit not available)", () => {
    const r = run({ git: stubGit({ files: new Error("fatal: bad object") }) });
    assert.equal(r.decision, "rejected");
    for (const id of ["diff.recomputed", "paths.allowed", "diff.lines", "check:biome"])
      assert.ok(failed(r).includes(id), id);
  });

  test("rejects a diff base other than the merge-base", () => {
    assert.deepEqual(failed(run({ git: stubGit({ mergeBase: OTHER }) })), ["diff.base"]);
  });
});

describe("helpers", () => {
  test("globToRegExp", () => {
    assert.ok(globToRegExp("**/*.md").test("README.md"));
    assert.ok(globToRegExp("**/*.md").test(".claude/skills/a/SKILL.md"));
    assert.ok(!globToRegExp("**/*.md").test("a.mdx"));
    assert.ok(globToRegExp("docs/**").test("docs/a/b.txt"));
    assert.ok(!globToRegExp("docs/**").test("docsx/a"));
    assert.ok(!globToRegExp("CLAUDE.md").test("a/CLAUDE.md"));
    assert.ok(globToRegExp("**/.env*").test(".env.local"));
    assert.ok(globToRegExp("**/package.json").test("packages/x/package.json"));
    assert.ok(matchesAny("yarn.lock", POLICY.humanReview.paths));
  });

  test("expandCommand quotes and sorts files and skips deleted ones", () => {
    const files = [
      { path: "b c.md", status: "A" },
      { path: "a'q.md", status: "M" },
      { path: "gone.md", status: "D" },
    ];
    assert.equal(expandCommand("x {changedFiles}", files), "x 'a'\\''q.md' 'b c.md'");
  });

  test("parseDiff reads -z numstat and name-status, including binaries", () => {
    const files = parseDiff("3\t1\tdocs/a.md\0-\t-\timg.png\0", "M\0docs/a.md\0A\0img.png\0");
    assert.deepEqual(files, [
      { path: "docs/a.md", status: "M", additions: 3, deletions: 1, binary: false },
      { path: "img.png", status: "A", additions: 0, deletions: 0, binary: true },
    ]);
  });
});

describe("evaluate.mjs CLI against real git repositories", () => {
  let repos;
  let dir;
  before(() => {
    repos = makeRepos();
    dir = repos.root;
  });
  after(() => repos.cleanup());

  function writeEvidence(name, mutate = (e) => e) {
    const g = gitAccess(repos.work);
    const files = g.diff(repos.baseSha, repos.head);
    const evidence = mutate({
      schemaVersion: 1,
      pr: { number: repos.pr, remote: "origin", headSha: repos.head },
      diff: { baseRef: "origin/main", baseSha: repos.baseSha, headSha: repos.head, files },
      checks: passingChecks(files, repos.head),
    });
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(evidence));
    return path;
  }

  const cli = (evidence, decisions) =>
    runNode("evaluate.mjs", [
      "--evidence",
      evidence,
      "--policy",
      POLICY_PATH,
      "--decisions-dir",
      decisions,
      "--repo",
      repos.work,
    ]);

  test("approves, prints PR, commit, decision and reasons, and records the decision", () => {
    const decisions = join(dir, "decisions-ok");
    const r = cli(writeEvidence("ok.json"), decisions);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`PR:\\s+#${repos.pr}`));
    assert.match(r.stdout, new RegExp(`Commit:\\s+${repos.head}`));
    assert.match(r.stdout, /Decision: APPROVED/);
    assert.match(r.stdout, /PASS {2}pr\.headRecheck: /);
    const recordPath = join(decisions, `pr-${repos.pr}-${repos.head}.json`);
    assert.ok(existsSync(recordPath));
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    assert.equal(record.decision, "approved");
    assert.equal(record.sha, repos.head);
    assert.match(record.policy.sha256, /^[0-9a-f]{64}$/);
  });

  test("rejects a missing evidence file with exit code 1", () => {
    const decisions = join(dir, "decisions-missing");
    const r = cli(join(dir, "does-not-exist.json"), decisions);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Decision: REJECTED/);
    assert.match(r.stdout, /FAIL {2}evidence\.present: .*file not found/);
  });

  test("rejects evidence whose file list hides a file that git shows", () => {
    const path = writeEvidence("tampered.json", (e) => ({ ...e, diff: { ...e.diff, files: [] } }));
    const r = cli(path, join(dir, "decisions-tampered"));
    assert.equal(r.status, 1);
    assert.match(r.stdout, /FAIL {2}diff\.recomputed: .*missing from evidence: docs\/guide\.md/);
  });

  test("rejects evidence collected before the PR was updated", () => {
    const path = writeEvidence("stale.json");
    const newHead = movePr(repos);
    const r = cli(path, join(dir, "decisions-stale"));
    assert.equal(r.status, 1);
    assert.match(
      r.stdout,
      new RegExp(`FAIL {2}pr\\.head: .*is ${newHead}, but the evidence is for ${repos.head}`)
    );
  });

  test("exits 2 on usage errors", () => {
    assert.equal(runNode("evaluate.mjs", []).status, 2);
  });
});
