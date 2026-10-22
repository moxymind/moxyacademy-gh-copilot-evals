# Agent evals workshop: manual TC → Playwright test

A small Playwright suite for https://www.saucedemo.com, plus a GitHub Copilot custom agent
(`tc-automator`) that turns manual test cases into automated tests, and a
[Waza](https://github.com/microsoft/waza) eval suite that measures how well it does that
across agent versions, models and reasoning effort.

Step-by-step guide: [GUIDE.md](GUIDE.md)

## Setup

```bash
npm ci
npx playwright install chromium
# waza v0.39.0: https://github.com/microsoft/waza#installation
copilot login            # Copilot CLI, used by waza to run the agent
export GH_TOKEN=$(gh auth token)   # used by the LLM judge
```

## Layout

| Path | What |
|------|------|
| `.github/agents/tc-automator.agent.md` | The agent under test |
| `manual-tcs/` | Manual test cases (the agent's input) |
| `tests/support/auth.ts` | `loginAs()` helper the agent must reuse |
| `evals/tc-automator/eval.yaml` | Eval config: model, effort, judge, global graders |
| `evals/tc-automator/tasks/` | One task per manual TC, with its graders |
| `evals/tc-automator/graders/` | Program grader script and LLM-judge rubric |
| `evals/tc-automator/reference/` | Hand-written reference solutions (used to validate the graders, never shown to the agent) |
| `evals/results/rehearsal/` | Recorded runs: open with `waza serve --results-dir evals/results/rehearsal` |
| `evals/baseline/` | Approved baseline that CI gates against |
| `.github/workflows/agent-evals.yml` | CI: re-run evals on agent changes, `waza gate` vs baseline |

## Run

```bash
cd evals/tc-automator
waza run eval.yaml -v                                 # whole suite
waza run eval.yaml --task tc-001                      # one task
waza run eval.yaml --tags smoke                       # by tag
waza run eval.yaml --model claude-haiku-5.5 --model gpt-6-luna -o ../results/live/models.json
waza serve --results-dir ../results                   # dashboard
```
