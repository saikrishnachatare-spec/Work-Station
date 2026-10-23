# Edge functions

Planned (per the technical design, later phases):

- `ai-proxy` - LLM calls with guardrails, rate limits and cost logging.
- `vacancy-scan` - weekly opening matches per course and level.
- `daily-reads` - drafts the Top 10 for editor approval.
- `push-worker` - Expo Push delivery.

Secrets (LLM keys) live in function env vars, never in the repo.
