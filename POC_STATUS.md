# AI Code Review POC — Status

## TL;DR

A multi-agent code review pipeline runs end-to-end on every PR in this repo. A single GitHub Actions workflow installs the Claude Code CLI, invokes the `code-review` skill, the skill spawns four specialist sub-agents in parallel (security, performance, test-coverage, code-quality), an aggregator dedupes and ranks their findings, and the result is posted as a PR comment. PR #1 is the live test case. Wall time ~8 minutes, billed to our Anthropic API key. Next focus: cut latency/cost via per-specialist model selection.

---

## Goal

Reproduce the manual `/code-review` flow developers run in their own Claude Code sessions, but trigger it automatically on PRs against a shared API key — so individual developers don't burn their personal token limits, and so we can run the same pipeline org-wide without each engineer wiring it up themselves.

This repo (`psharma-jrni/ai-code-review-poc`) is a **sandbox**, not a production target. We don't have permissions to touch org repo workflows yet, so we're proving the pattern here first.

---

## What's built

### Stack

| Component | Provider | Notes |
|---|---|---|
| Runner VM | GitHub Actions (`ubuntu-latest`) | Fresh per run, ~10s setup |
| Claude Code CLI | Anthropic (`@anthropic-ai/claude-code` npm) | Installed per run, ~4s |
| Review skill + sub-agent prompts | This repo (`.claude/skills/code-review/`) | Loaded automatically by the CLI from the worktree |
| API key | GitHub Secret → process env → CLI picks it up | Repo-level secret today; will move to org-level for rollout |

### Repo layout

```
.github/workflows/ai-review.yml       ← CI harness (kicks off claude -p, posts comment)
.claude/skills/code-review/
  SKILL.md                            ← orchestrator (loads agent prompts, spawns specialists)
  agents/
    security.md                       ← specialist prompt
    performance.md                    ← specialist prompt
    test-coverage.md                  ← specialist prompt
    code-quality.md                   ← specialist prompt
    aggregator.md                     ← final synthesis prompt
src/                                  ← test fixtures with planted issues
  auth.js                             ← baseline (on main)
  user-service.js                     ← SQL injection, hardcoded secrets (on PR branch)
  data-loader.js                      ← N+1, sync I/O, O(n²)
  feature-flags.js                    ← dead code, bad naming, null derefs
  notification-service.js             ← public functions w/ no test
CLAUDE.md                             ← repo standards (review rules)
```

### How a PR review runs end-to-end

1. PR is opened or updated → GitHub fires the `pull_request` event.
2. Workflow YAML (read from the **base branch**, `main`) starts a fresh runner.
3. Runner checks out the PR head, installs Node 20 and the Claude Code CLI.
4. `git diff origin/main...HEAD` is captured (truncated to 30KB) and stuffed into a prompt.
5. `claude -p "<prompt>" --allowedTools Read,Grep,Glob,Agent --dangerously-skip-permissions` runs the orchestrator skill.
6. Orchestrator reads the four specialist prompt files (`agents/*.md`) and issues four `Agent` tool calls **in parallel**, each with that specialist's prompt + the diff.
7. Each specialist returns a JSON array of findings. They have `Read`/`Grep`/`Glob` access to the worktree, so they verify against actual files (not just the diff).
8. Orchestrator reads `agents/aggregator.md`, calls the aggregator with the four JSON outputs and the diff, and gets back a single markdown comment.
9. Workflow grabs that markdown and posts it as a PR comment via `actions/github-script`.

### Authentication path

`gh secret set ANTHROPIC_API_KEY` → encrypted at rest in GitHub → exposed to the `Run AI review` step's process env via the workflow's `env:` block → CLI picks up `ANTHROPIC_API_KEY` automatically. No `.env` file. No interactive login.

---

## What worked / didn't, and why

| Issue we hit | Root cause | Fix |
|---|---|---|
| Workflow never appeared in Actions tab | Corrupted YAML on `main` (stray shell commands appended to the file) | Cleaned the YAML |
| First run posted "Not logged in" | Repo had **zero** secrets configured despite handoff doc saying otherwise | `gh secret set ANTHROPIC_API_KEY` |
| Single-shot review missed dimensions | One pass had to balance security, perf, tests, style — diluted | Split into 4 parallel specialists + aggregator |

---

## Performance baseline

- **Wall time:** ~8 minutes per PR review (multi-agent pipeline, 4 parallel specialists + aggregator)
- **CLI install:** ~4 seconds (don't bother optimizing — not the bottleneck)
- **Single-shot prior baseline:** ~21–47 seconds, but lower review quality

The 8 minutes is almost entirely model inference time. Pre-baking the CLI on a self-hosted runner would save seconds, not minutes.

---

## Architecture decisions worth remembering

1. **Orchestration lives inside the skill, not the workflow.** Workflow stays a dumb harness — install CLI, run one `claude -p`, post the output. This means consuming repos can vary their specialist count/types without touching CI.
2. **Bundled markdown prompts** under `.claude/skills/code-review/agents/`, read at runtime by the orchestrator and stuffed into `Agent` calls. Mirrors the pattern already used in our org repos.
3. **GitHub-hosted runners**, not self-hosted. The infra cost isn't justified at this scale. Revisit only if we hit Action-minute limits or a private-network requirement.
4. **API key billing is on us** (Anthropic account), not GitHub. That's the whole point — it removes the burn from individual developers' personal token budgets.

---

## Open decisions / known limits

- **`Agent` in `--allowedTools` is unbounded.** Specialists are told via prompt not to spawn further sub-agents, but there's no hard cap. For prod, move to `.claude/agents/` definitions with locked-down per-agent tool lists.
- **Aggregator is the most prompt-fragile piece.** It owns dedup, severity normalization, and verdict. Watch its output as we iterate.
- **No prompt-caching telemetry yet.** Caching is mostly automatic in Claude Code, but we haven't verified `cache_read_input_tokens` is non-zero in our runs.
- **Diff truncation at 30KB.** Will hide context on large PRs. Acceptable for POC; revisit before rollout.
- **Model is whatever the CLI defaults to** (currently the same model for all sub-agents). Per-specialist model selection is the obvious next optimization.

---

## Next steps (prioritized)

### 1. Per-specialist model selection (high impact, small change)

Update `SKILL.md` so the orchestrator passes `model: "haiku"` on each specialist `Agent` call and `model: "sonnet"` on the aggregator call. Specialists do narrow pattern-matching work; Haiku is plenty. Aggregator stays on Sonnet because mistakes propagate.

**Verify first:** the `Agent` tool's `model` parameter actually pipes through in `claude -p` headless mode. Quick smoke test before committing.

**Expected impact:** roughly halve cost and wall time.

### 2. Verify prompt caching is active (telemetry, not optimization)

Check the run output / Anthropic logs for `cache_read_input_tokens > 0`. If yes, we're already getting the benefit. If no, investigate whether the CLI exposes a flag.

Don't expect a big win — there's no shared prefix across the four specialists, so cross-specialist caching doesn't apply. Within-specialist tool-loop caching is automatic.

### 3. Reusable workflow split (in this repo first)

Restructure `ai-review.yml` so the heavy-lifting steps live in a *reusable* workflow (`workflow_call`) and a thin caller wrapper exists in the same repo. Proves the indirection works before we lift it into our org's `.github` repo.

This is a prerequisite for org rollout — without it, every consuming repo needs ~90 lines of YAML, and every fix becomes N PRs.

### 4. Org rollout (when permissions land)

- Move the reusable workflow into `org-name/.github/.github/workflows/ai-review.yml`
- Add an **org-level** `ANTHROPIC_API_KEY` secret with "Selected repositories" visibility
- Onboard each consuming repo with a ~10-line caller workflow
- Each repo continues to provide its own `.claude/skills/code-review/` (specialists vary per repo — the harness doesn't care)

### 5. Quality iteration (ongoing)

Tune specialist prompts based on real PR runs. Watch for:
- False positives from any single specialist
- Aggregator over-promoting or under-promoting severity
- Specialists straying out of their lane (test-coverage commenting on style, etc.)

### Maybe later, definitely not now

- Self-hosted runners
- Drop one specialist (test-coverage and code-quality overlap a bit)
- Switch to GitHub App for cross-repo aggregation / custom UI
- Explicit `cache_control` markers (would require dropping to raw Anthropic SDK and writing our own orchestrator — big rewrite)

---

## Test artifacts

- **Live PR:** https://github.com/psharma-jrni/ai-code-review-poc/pull/1
- **Multi-agent run:** https://github.com/psharma-jrni/ai-code-review-poc/actions/runs/25042237400
- **Test branch:** `test/bad-code-for-review` (contains the planted bug fixtures)
