# Branch Strategy

## Branches

- `main`: production-ready releases.
- `develop`: integrated staging branch.
- `feature/*`: feature work.
- `fix/*`: bug fixes.
- `docs/*`: documentation-only changes.

## Flow

```text
feature/* or fix/*
        |
        v
      develop
        |
        v
       main
```

## Rules

- Pull requests should target `develop` by default.
- `main` should receive only release or hotfix pull requests.
- Core business rules, data contracts, and state machines require a documented change request before implementation.
- Secrets must never be committed.
- CI must pass before merge.

## Recommended GitHub Settings

Enable branch protection for `main` and `develop`:

- Require pull request before merging.
- Require status checks to pass.
- Require conversation resolution.
- Restrict force pushes.
- Restrict deletions.
- Require linear history if the team prefers a clean release history.
