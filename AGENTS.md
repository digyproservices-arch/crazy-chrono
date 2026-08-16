# AGENTS.md — Crazy Chrono

## Source of truth

This repository is the technical source of truth for Crazy Chrono.

Before making any change, read:
1. `AGENTS.md`
2. `AI_CONTEXT.md`
3. `DEVIN_HANDOFF.md` if present
4. Relevant documentation under `docs/`

Do not rely only on memory from a previous ChatGPT, Devin, or other AI session.

## Project

- Product: Crazy Chrono
- Repository: `digyproservices-arch/crazy-chrono`
- Production: `crazy-chrono.vercel.app`
- Default branch: `main`

## Operating model

The project is managed with the following separation of responsibilities:

- **User / Product owner:** final business decisions and explicit approval for sensitive production actions.
- **ChatGPT / CTO:** technical direction, architecture, prioritization, mission definition, risk assessment, review and acceptance criteria.
- **Devin:** implementation, investigation, tests, fixes and pull requests.
- **GitHub:** durable and versioned technical memory / source of truth.

A new AI session must reconstruct project context from the repository rather than assuming previous conversational memory.

## Engineering principles

Prefer:
- small, surgical changes;
- evidence before conclusions;
- reproducible tests;
- explicit acceptance criteria;
- minimal regression risk;
- existing project conventions;
- documenting important architectural or operational decisions.

Avoid:
- unrelated refactors;
- speculative rewrites;
- broad changes without evidence;
- silently changing product behavior;
- weakening tests merely to make CI pass.

## Production safety

Never perform a production deployment, destructive database operation, irreversible migration, secret rotation, security-policy relaxation, or equivalent high-impact action without explicit authorization.

Do not expose secrets, tokens, credentials, private keys or sensitive environment values in:
- commits;
- logs;
- pull requests;
- Slack;
- documentation;
- AI responses.

When working with secrets, identify them by variable name and purpose only.

## Git workflow

Unless explicitly instructed otherwise:

1. Start from an up-to-date `main`.
2. Work on a dedicated branch.
3. Keep scope limited to the mission.
4. Run relevant checks and tests.
5. Report failures honestly.
6. Open a PR rather than merging directly.
7. Do not merge or deploy solely because implementation is complete.

Every substantial mission should leave enough evidence for CTO review.

## Mission completion format

For engineering missions, report:

- diagnosis;
- files/areas changed;
- tests/checks executed;
- results;
- known risks or remaining uncertainty;
- PR number/link when applicable;
- commit SHA when applicable;
- exact blocker if blocked.

Finish with exactly one of:

`READY FOR CTO REVIEW`

or

`BLOCKED: <exact blocker>`

## Continuity / handoff

`DEVIN_HANDOFF.md` is the durable operational handoff between AI sessions/accounts.

Update it when a mission materially changes:
- architecture;
- current project state;
- important constraints;
- unresolved blockers;
- operational procedures;
- major technical decisions.

Do not turn it into a transcript. Preserve concise, actionable project knowledge.

## Conflict rule

If instructions conflict, use this priority:

1. Explicit current instruction from the user.
2. Security and production-safety requirements.
3. `AGENTS.md`.
4. Current mission specification.
5. `DEVIN_HANDOFF.md`.
6. Other repository documentation.
7. Assumptions from previous AI conversations.

When uncertain about a potentially destructive or production-impacting action, stop and escalate rather than guessing.
