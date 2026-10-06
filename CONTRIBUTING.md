# Contributing to Ironbolt

Ironbolt is a personal API template. Bug reports and small fixes are welcome. For anything larger, please open an issue first so we can agree on the approach before you spend time on it.

## Setup

```bash
nvm use
npm ci
cp .env.example .env   # then fill in the values
npm run db:generate && npm run db:push
```

## Before opening a pull request

Run the same checks CI runs:

```bash
npm run lint && npm run build && npm run openapi:check && npm run test:run
```

If you change a route or schema, run `npm run openapi:dump` and commit the updated `openapi.snapshot.json`.

## Conventions

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`).
- Keep pull requests focused on one change. They are squash-merged.
- Add or update tests for any behavior change.

## Security

Please don't report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).
