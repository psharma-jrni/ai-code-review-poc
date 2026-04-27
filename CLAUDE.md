# AI Code Review POC

This is a proof-of-concept repository for testing automated AI code review.

## Project structure
- `src/` — source code to review
- `.claude/skills/code-review/` — review rules and guidelines
- `.github/workflows/` — GitHub Actions automation

## Review standards
- All functions must have error handling
- No hardcoded secrets or API keys
- Input validation required on all public functions
- Tests required for new features
