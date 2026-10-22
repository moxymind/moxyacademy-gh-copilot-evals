# Step-by-step guide: evaluate your Copilot agent with Waza

This guide walks you through the whole loop on your own machine:

1. Pick a workflow that an AI agent does for you repeatedly.
2. Define what a *good* result looks like.
3. Measure the agent against it with [Waza](https://github.com/microsoft/waza).
4. Use the numbers to improve the agent, pick a cheaper model or reasoning effort, and gate changes in CI.

The example agent turns a **manual test case** (markdown) into an **automated Playwright test** for https://www.saucedemo.com.

**Time:** about 2 hours. **Cost:** every full eval run uses Copilot AI credits (roughly 20–50 per run, see [Costs](#costs)). The repo contains recorded results of every run in this guide, so you can follow along without running everything yourself.

---

## 0. Setup

### Prerequisites

| Tool | Check | Install |
|---|---|---|
| GitHub Copilot license with CLI access | — | ask your org admin |
| Node.js 22+ | `node --version` | https://nodejs.org |
| Git + bash (macOS, Linux or WSL) | `bash --version` | on Windows use WSL |
| GitHub CLI | `gh auth status` | https://cli.github.com |
| Copilot CLI | `copilot --version` | `npm install -g @github/copilot`, then `copilot login` |
| Waza **v0.39.0** | `waza --version` | `curl -fsSL https://raw.githubusercontent.com/microsoft/waza/main/install.sh \| bash` |
| VS Code + GitHub Copilot extension | — | for step 2 only |

> Waza bundles its own copy of the Copilot runtime, but it uses your Copilot login and its model access.
> This guide was verified with Waza v0.39.0. Newer versions may differ slightly.

### Get the repo

```bash
git clone https://github.com/moxymind/moxyacademy-gh-copilot-evals.git
cd moxyacademy-gh-copilot-evals
npm ci
npx playwright install chromium
npm test                      # 2 passed → the app under test is reachable
```

### Every new terminal

```bash
export GH_TOKEN=$(gh auth token)   # the LLM judge needs a token in the environment
```

Check that Waza can see your models:

```bash
waza models | head -20
```

Pick model IDs from this list. If you request a model that isn't enabled for you, Copilot may **silently run a different model** (see [Troubleshooting](#troubleshooting)).

### Start from agent v1

The `main` branch contains the *finished* state: agent v2 and the model decision. To experience the journey, put agent v1 and the original eval config back:

```bash
git checkout step-1-agent-v1 -- .github/agents/tc-automator.agent.md evals/tc-automator/eval.yaml
```

The tags `step-1-agent-v1`, `step-2-agent-v2`, `step-3-model-decision` and `step-4-ci` mark each stage. You can restore any file from them at any point. To go back to the finished state:

```bash
git restore --source=HEAD --staged --worktree .github/agents evals/tc-automator/eval.yaml
```

---

## 1. Pick the workflow and meet the agent

The workflow: *"A tester gives the agent a manual TC. The agent writes the automated test."*

Look at these files:

| File | What it is |
|---|---|
| `manual-tcs/TC-002.md` | A manual test case: preconditions plus a table of actions and expected results |
| `tests/support/auth.ts` | The team's `loginAs()` helper |
| `tests/saucedemo.spec.ts` | Existing tests, which show the team's conventions |
| `.github/agents/tc-automator.agent.md` | The agent. Right now it's v1: two sentences |

v1 is how most agents look on day one:

```markdown
You are a QA automation engineer. Convert the manual test case you are given into a Playwright test.

Save the test as `tests/generated/<TC-ID>.spec.ts` (for example `tests/generated/TC-001.spec.ts`).
```

---

## 2. Try it by hand (the "vibe check")

1. Open the repo in VS Code. In Copilot Chat, open the agent picker and choose **tc-automator**.
   If it isn't listed, run `Developer: Reload Window`. You need to reload after every change to an `.agent.md` file.
2. Send: `Automate the manual test case in manual-tcs/TC-002.md`
3. Run what it produced:
   ```bash
   npx playwright test tests/generated/TC-002.spec.ts
   ```

Now review it the way you'd review a colleague's work:

- [ ] **Does it run?** Is the test green?
- [ ] **Does it test what the TC says?** Every step is an action, and every expected result is a real assertion.
- [ ] **Does it follow our conventions?** It uses `loginAs()`, `data-test` selectors and `"should …"` test names, with no `waitForTimeout`, hardcoded URLs or passwords.

It probably looks fine. But you checked one TC, once, by eye. Would you notice if a new model or a prompt edit broke one of these points next month? That's the problem the rest of this guide solves.

`tests/generated/` is git-ignored, so you can delete it whenever you like.

---

## 3. Define the expected outcome

Turn your review checklist into four layers. Each layer becomes a grader in Waza:

| # | Layer | How it's checked | Waza grader |
|---|---|---|---|
| 1 | The test **runs green** against the app | run it | `program`: `graders/run-generated-test.sh` |
| 2 | It follows **team conventions** | regex over the file | `file` (`content_patterns`) |
| 3 | It's **faithful to the manual TC**: nothing missing, changed or invented | needs judgment | `prompt`: an LLM judge with rubric `graders/tc-fidelity.md` |
| 4 | **Cost and speed** | tokens, AI credits, duration, tool calls | `behavior`, plus the usage section of the report |

Rule of thumb: use **deterministic graders first**, because they're cheap, stable and noise-free. Use an LLM judge only for what code can't decide.

### Exercise: decide your team's policy

Open `manual-tcs/TC-005.md`. The TC expects `Total: $35.39`, but the app shows `$32.39` ($29.99 + $2.40 tax). The TC is wrong, or the app is.

**What should the agent do?** Decide before you read on.

<details>
<summary>The policy used in this repo</summary>

The manual TC is the source of truth. The assertion stays `35.39`, so the test fails, and the agent reports the mismatch as a possible defect.

The worst outcome is a green test that quietly asserts `32.39`. That hides exactly the bug the TC was written to catch. If you don't write the policy down, the model decides for you.
</details>

---

## 4. Encode it as a Waza eval

```bash
cd evals/tc-automator
find . -path ./fixtures -prune -o -type f -print | sort
```

| File | What to look for |
|---|---|
| `eval.yaml` | `skill: tc-automator` plus `skill_directories`, which is how Waza finds the `.agent.md`. Also `executor: copilot-sdk`, `model`, a **fixed** `judge_model` (otherwise you'd be comparing judges, not agents), `parallel: true`, `hooks.before_run`, a global `behavior` grader and `tasks: tasks/*.yaml` |
| `tasks/tc-00X.yaml` | One task per TC. `inputs.prompt` is what a human would type, `context.fixture` is a copy of the project, and `files` holds only this TC. Then the graders for layers 1–3 |
| `tasks/tc-005.yaml` | Also `golden: true`, meaning non-negotiable: `waza gate` fails with exit 2 when it fails |
| `graders/tc-fidelity.md` | The judge rubric: 5 criteria, ending with `set_waza_grade_pass` / `set_waza_grade_fail` |
| `graders/run-generated-test.sh` | Layer 1. It also fails if the test was skipped or disabled |
| `sync-fixtures.sh` | Runs before every eval. Builds `fixtures/` from the repo, so each task runs in a **fresh copy of the project** in `/tmp` and the agent never sees the other TCs or the reference solutions |
| `reference/` | Hand-written correct solutions, used to test the graders. They are never shown to the agent |

### Test your graders before you trust them

A grader that always passes, or always fails, is worse than none. Check layer 1 against a reference solution:

```bash
bash sync-fixtures.sh
rm -rf /tmp/grader-check && cp -r fixtures/project /tmp/grader-check
mkdir -p /tmp/grader-check/tests/generated && cp reference/TC-002.spec.ts /tmp/grader-check/tests/generated/
WAZA_WORKSPACE_DIR=/tmp/grader-check bash graders/run-generated-test.sh TC-002; echo "exit=$?"   # exit=0
```

Try breaking it: edit `/tmp/grader-check/tests/generated/TC-002.spec.ts` (change an expected value, or add `test.skip(`) and run it again. It should now exit non-zero.

### Validate the eval offline (free)

```bash
bash sync-fixtures.sh && waza preflight eval.yaml | grep -c '\[error\]'   # 0
```

`preflight` doesn't run hooks, so run `sync-fixtures.sh` first. `waza run` does that itself.

---

## 5. First run: agent v1

```bash
mkdir -p ../results/live          # Waza won't create the output folder for -o
waza run eval.yaml --task tc-001 -v                       # one task, verbose: ~3–4 min
waza run eval.yaml -o ../results/live/01-v1-sonnet.json   # all 5 tasks in parallel: ~4 min
```

What we got (`evals/results/rehearsal/01-v1-sonnet.json`):

| Run | Pass | What failed |
|---|---|---|
| v1 · Sonnet 5.5 | **1/5** | 4× naming (`"should …"`, even though the existing spec uses it). TC-005: assertion **rewritten to `$32.39`**, so the test passes and the mismatch isn't reported |

Notice that **every generated test ran green**. A vibe check would have said "works". Your numbers may differ slightly: with 1 trial per task, results vary from run to run.

---

## 6. Read the results

**Terminal:** the summary lists each failed task and the grader that failed it.

**Dashboard:**

```bash
waza serve --results-dir ../results --port 3000 --no-browser   # run from evals/tc-automator
```

Open http://localhost:3000. It shows your live runs next to the recorded rehearsal runs. Click a run, then a task, to see each grader's verdict, the **judge's reasoning** and the transcript.

If the dashboard is empty, check your working directory: `../results` is relative to it. From the repo root, use `--results-dir evals/results`.

**Digging deeper:**

```bash
waza run eval.yaml --task tc-005 --keep-workspace --transcript-dir ../results/live/tr
```

`--keep-workspace` leaves the task's `/tmp/waza-*` folder in place so you can open the generated spec. The transcript JSON has the full conversation, and `final_output` is the agent's last message.

### Exercise: map failures to instructions

For each failure in your v1 run, write down the instruction the agent was missing. Most failures aren't caused by a "weak model". The agent simply didn't know what you never told it.

---

## 7. Improve the agent: v2

Edit `.github/agents/tc-automator.agent.md` and add sections that address your failure list. Then compare your version with the one in this repo:

```bash
git diff step-2-agent-v2 -- ../../.github/agents/tc-automator.agent.md
```

Or take the repo's v2 directly:

```bash
git checkout step-2-agent-v2 -- ../../.github/agents/tc-automator.agent.md
```

v2 adds four sections:
- **Output:** file name and test naming.
- **Mapping rules:** one action per step and one specific assertion per expected result. Nothing invented. **The TC is the source of truth.**
- **Project conventions:** `loginAs()`, `data-test`, relative URLs, web-first assertions.
- **Verify:** run the test once, fix selectors, never "fix" an expected value. Report mismatches.

Run the suite again and compare:

```bash
waza run eval.yaml -o ../results/live/02-v2-sonnet.json
waza compare ../results/live/01-v1-sonnet.json ../results/live/02-v2-sonnet.json
```

| Run | Pass | AI credits (whole run, including judge) | Tokens |
|---|---|---|---|
| v1 · Sonnet 5.5 | 1/5 | 52.7 | 778k |
| v2 · Sonnet 5.5 | **4/5** | **44.8** | **511k** |

Better instructions gave **higher quality and lower cost**, because the agent wanders less.

### Exercise: is it the agent or the judge?

The remaining v2 failure (TC-003) came from the judge: the spec asserts all six prices, but the TC only says "ascending". Is that an agent mistake or an over-strict judge? A rubric is code too. If you decide supporting assertions are fine, relax criterion 4 in `graders/tc-fidelity.md`, bump its `version`, and run `--task tc-003` again.

This is the continuous loop: a problem shows up in real use → add a task → improve the agent → re-run everything to catch regressions.

---

## 8. Is a cheaper model enough?

Try models with `--model`. The flag is repeatable, the models run **one after another**, and each writes its own `<name>_<model>.json`:

```bash
waza run eval.yaml --model claude-haiku-5.5 -o ../results/live/03-v2-haiku.json            # ~4 min
waza run eval.yaml --model claude-haiku-5.5 --model gpt-6-luna -o ../results/live/models.json   # ~8 min
```

Reasoning effort has no CLI flag. Set it in `eval.yaml` under `config` (`low`, `medium`, `high`, `xhigh`, `max`), run, then put it back:

```yaml
config:
  reasoning_effort: high
```

Recorded results (agent v2; agent-only credits come from `usage.model_metrics` in the results JSON):

| Model | Effort | Pass | Agent AI credits | Duration |
|---|---|---|---|---|
| Sonnet 5.5 | default | 4/5 | ≈ 26 | 3m44 |
| **Haiku 5.5** | default | **4/5** | **2.7** | 4m00 |
| Haiku 5.5 | low | 4/5 | 2.2 | 4m00 |
| Haiku 5.5 | high | 5/5 | 2.6 | 4m37 |
| GPT-6 Luna | default | 3/5 | 1.8 | 4m22 |
| MAI-Code 1.1 Flash | default | 2/5 | 7.3 | 8m30 |

Also from the recordings: with agent **v1**, Haiku 5.5 scored **0/5**. Good instructions are what make the cheap model usable.

Before you decide:
- **Check which model actually ran.** Look at "Usage by model" in the dashboard or `usage.model_metrics` in the JSON. A model that isn't enabled for you can be silently replaced.
- **Five tasks × one trial is noisy.** 5/5 vs 4/5 is a single task. For a real decision use `--trials 3`. The report then includes pass^k and confidence intervals.
- **The judge costs money too.** Here the Sonnet judge (~19 credits per run) costs more than the cheap agent. Keep as much as possible deterministic.

The decision recorded in this repo is Haiku 5.5 with agent v2: the same pass rate as Sonnet at about a tenth of the agent cost. See it in `step-3-model-decision`:

```bash
git diff step-2-agent-v2 step-3-model-decision -- eval.yaml
```

---

## 9. Lock it in: baseline, gate, CI

A **baseline** is an approved results file (`evals/baseline/tc-automator.json`). `waza gate` compares a new run against it and returns a CI-friendly exit code. It's free to try, because no models run:

```bash
waza gate --baseline ../results/rehearsal/03-v2-sonnet.json --current ../results/rehearsal/01-v1-sonnet.json; echo "exit=$?"
# exit=2: the golden task TC-005 failed (this takes precedence over a plain regression, exit=1)
waza gate --baseline ../results/rehearsal/01-v1-sonnet.json --current ../results/rehearsal/03-v2-sonnet.json; echo "exit=$?"
# exit=0: no regression
```

`.github/workflows/agent-evals.yml` runs this on every PR that touches `.github/agents/**`, `evals/**`, `manual-tcs/**` or `tests/support/**`:
1. Install Node, Playwright and a **pinned** Waza version.
2. `waza run eval.yaml` → `results.json`
3. `waza gate --baseline ../baseline/tc-automator.json --max-regression-pct 20`. That's one task out of five, to tolerate single-trial noise; a failed golden task still fails the build.

To enable it in your copy, add a repository secret `COPILOT_GITHUB_TOKEN`: a fine-grained PAT of a Copilot-licensed user with the **Copilot Requests** permission.

**When a new model comes out**, use the workflow's *Run workflow* button with the `model` input, or locally:

```bash
waza run eval.yaml --model <new-model> -o ../results/live/new.json
waza compare ../baseline/tc-automator.json ../results/live/new.json
```

If the pass rate is the same or better and the cost is lower, switch `model` in `eval.yaml` and in your team's agent setup, then commit the new run as the baseline in the same PR.

---

## 10. Make it yours

Exercises:
- **Starter:** write your own manual TC (`manual-tcs/TC-006.md`), copy `tasks/tc-002.yaml` to `tasks/tc-006.yaml`, adjust the IDs, then run `waza run eval.yaml --task tc-006`.
- **Core:** add a grader. For example, a `behavior` or `tool_calls` grader that forbids editing `tests/support/`, a `file` grader with `must_not_exist`, or a new rubric criterion for readability. Prove it works with a reference solution first.
- **Extras:** take an agent from your own project and build 3–5 tasks plus graders for it. Compare 2 models × 2 reasoning efforts.

Checklist for your own project:
1. Choose **one workflow** the agent does often, with a clear input and output.
2. Collect **3–10 real inputs**, including at least one nasty edge case (like TC-005).
3. Write down "good" as layers, **deterministic first**, with an LLM judge only for judgment calls.
4. Write a reference solution and **test the graders** against it.
5. Run on your current model, then improve the instructions, then try cheaper models and efforts.
6. Commit the evals **next to the agent**, record a baseline and gate PRs.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `evidence judge requires an explicit copilot_github_token…` | `export GH_TOKEN=$(gh auth token)` in that terminal |
| `failed to save output … no such file or directory` | create the folder first: `mkdir -p ../results/live` |
| `waza preflight`: `inputs.context.fixture cannot be loaded` | run `bash sync-fixtures.sh` first; preflight doesn't run hooks |
| Empty dashboard | `--results-dir` is relative to your working directory; use `../results` from `evals/tc-automator` |
| A task shows `error` with `waiting for session.idle: context deadline exceeded` | harness timeout, not a wrong answer (`error` ≠ `failed`). Re-run that task with `--task` |
| Results show a different model than you asked for | the model isn't enabled for you; pick one from `waza models` |
| `npx playwright` fails inside a task workspace | Waza drops exec bits when copying fixtures; `npm test -- <spec>` works (`sync-fixtures.sh` points it at Playwright's JS entry point) |
| Agent changes don't show in VS Code | `Developer: Reload Window` |
| A file appears in your real repo after a run | Waza is **not a sandbox**: an agent can write outside its workspace through absolute paths. Check `git status` after runs and prefer CI or containers |
| `waza update` → `Text file busy` | re-run the install script instead |
| Hook commands with `$(...)`, `;` or `>` do nothing | hooks aren't run through a shell; call a script (`bash sync-fixtures.sh`) |

## Costs

From the recorded runs: one full run (5 tasks) costs about **20–50 AI credits**. The Sonnet judge accounts for roughly 19 of those, and the agent for 2–33 depending on the model. A single `--task` run costs about a fifth of that. All recorded runs are in `evals/results/rehearsal/` and you can browse them for free with `waza serve`.

## Cheat sheet

```bash
cd evals/tc-automator && export GH_TOKEN=$(gh auth token)
bash sync-fixtures.sh && waza preflight eval.yaml          # validate, free
waza run eval.yaml -v                                      # whole suite
waza run eval.yaml --task tc-005                           # one task
waza run eval.yaml --tags smoke                            # by tag
waza run eval.yaml --model A --model B -o ../results/live/m.json   # compare models
waza run eval.yaml --trials 3                              # variance, pass^k
waza run eval.yaml --keep-workspace --transcript-dir ../results/live/tr   # debug
waza compare a.json b.json                                 # score / pass rate / tool call deltas
waza gate --baseline base.json --current new.json          # CI decision (exit 0/1/2)
waza serve --results-dir ../results                        # dashboard
```
