#!/usr/bin/env bash
# Starts one daily workflow if its time has come. Called every half hour by
# .github/workflows/scheduler.yml, which explains the variables.
#
# Usage: dispatch-due.sh VARIABLE WORKFLOW TIME [gh workflow run arguments...]
#   VARIABLE  name of the repository variable TIME came from, for messages
#   WORKFLOW  workflow file, e.g. post-bluesky.yml
#   TIME      HH:MM in UTC, or "off"
#
# Environment: GH_TOKEN and GITHUB_REPOSITORY (set on the runner); DRY_RUN to
# report without starting anything; REF (default master); NOW in epoch seconds,
# to test a particular moment.

set -euo pipefail

variable=$1
workflow=$2
time=$(printf '%s' "$3" | tr -d '[:space:]')
shift 3

if [ "${time,,}" = off ]; then
  echo "$workflow: $variable is off, so it is not started."
  exit 0
fi
if ! [[ $time =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
  echo "::error title=$variable is not a time::$variable is \"$time\". Set it to a UTC time as HH:MM (for example 05:30), or to off."
  exit 1
fi

now=${NOW:-$(date -u +%s)}

# The last moment the workflow was due: today at TIME, or yesterday at TIME if
# today's is still ahead. Looking back across midnight is what stops a late
# tick, or a time like 23:45 that the day's last tick has already passed, from
# skipping a day.
due=$(date -u -d "$(date -u -d "@$now" +%F) $time" +%s)
if [ "$due" -gt "$now" ]; then due=$((due - 86400)); fi
due_at=$(date -u -d "@$due" +%Y-%m-%dT%H:%M:%SZ)

# Any run since then counts, however it was started, except a dry run (its run
# name ends "(dry run)"). A run that failed counts too: it is tried again at the
# next due time, not every half hour.
runs=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow/runs?created=%3E%3D$due_at&per_page=100" \
  --jq '[.workflow_runs[] | select(.display_title | endswith("(dry run)") | not)] | length')

if [ "$runs" -gt 0 ]; then
  echo "$workflow: due at $due_at, and has run since."
elif [ -n "${DRY_RUN:-}" ]; then
  echo "$workflow: due at $due_at, and has not run since. Dry run, so not starting it."
else
  echo "$workflow: due at $due_at, and has not run since. Starting it."
  gh workflow run "$workflow" --ref "${REF:-master}" "$@"
fi
