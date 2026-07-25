# Contributing

## Setup

Install backend development dependencies from `backend/requirements-dev.txt` and frontend dependencies with `npm ci`.

## Before opening a change

```bash
cd frontend
npm run check
```

```bash
cd backend
ruff check .
ruff format --check .
python -m compileall app
python -m pytest
```

## Project conventions

- Keep React memoization targeted. Stabilize callbacks passed to memoized children and memoize repeated or expensive calculations.
- Put component styles in matching `.module.scss` files.
- Keep reset, root scaling, tokens, and mixins in `frontend/src/styles`.
- Preserve local and hosted security boundaries.
- Add tests for every security-sensitive behavior.
- Do not commit secrets, generated gateway files, build output, or local environment files.
- Do not use raw HTML rendering for untrusted content.
