#!/usr/bin/env bash
# Exits 0 only when a plan.md carries exactly one status line and it reads
# `Status: approved`. The implement skill runs this before touching any file.
#
# Only the user writes `approved`, by editing plan.md; the plan skill always
# writes `Status: awaiting-approval`. Reading the file — instead of trusting an
# "ok" in the conversation — is what makes the approval checkable.
#
# Usage: check-plan-approved.sh <specs/<slug> | specs/<slug>/plan.md>
set -euo pipefail

target="${1:?Usage: check-plan-approved.sh <specs/<slug> | path/to/plan.md>}"
plan="$target"
[ -d "$target" ] && plan="${target%/}/plan.md"

if [ ! -f "$plan" ]; then
  echo "NOT APPROVED: $plan does not exist — run the plan step first." >&2
  exit 1
fi

status_lines="$(grep -E '^Status:' "$plan" || true)"
count="$(printf '%s' "$status_lines" | grep -c '^Status:' || true)"

if [ "$count" -ne 1 ]; then
  echo "NOT APPROVED: $plan must have exactly one 'Status:' line, found $count." >&2
  exit 1
fi

value="$(printf '%s' "$status_lines" | sed -E 's/^Status:[[:space:]]*//; s/[[:space:]]+$//')"

if [ "$value" != "approved" ]; then
  echo "NOT APPROVED: $plan has 'Status: $value'. Edit that line to 'Status: approved' to approve it." >&2
  exit 1
fi

echo "APPROVED: $plan"
