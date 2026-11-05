# Superseded direction (kept for reference)

This Better Auth worker was the first prep direction. On 2026-11-05 he chose
**Clerk + Cloudflare free plans** instead, after the deployed CPU test showed
bcrypt password hashing (~126ms/request) exceeds the documented Workers Free
10ms CPU budget with no supported free-budget route found in this assessment.

Clerk moves password hashing to Clerk's own infrastructure; our worker only
verifies JWTs (~2ms, asymmetric), which fits the free budget.

This folder still works locally (see docs/migration-plan.md stage notes) and
is kept in case the direction is revisited - e.g. if a future Workers Paid
plan makes self-hosted auth attractive again. It is not deployed and not
maintained going forward.
