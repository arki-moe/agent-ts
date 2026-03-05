# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.2] - 2026-03-05

### Added

- `Agent.fork()` for copying the current context into a new agent.
- Adapters fall back to env vars when `apiKey` is not in config: `OPENAI_API_KEY` for openai, `OPENROUTER_API_KEY` for openrouter. Error only when both config and env are missing.
- Optional `endCondition` callback for `Agent.run` to stop by custom condition using full context and last message.

### Removed

- `autoAppend` parameter from `Agent.step` and `Agent.run`; both now always append to context.

## [1.0.1] - 2026-02-24

### Added

- OpenRouter adapter support.

### Changed

- Tests are consolidated into integration tests and run only when the corresponding API key is set (`OPENAI_API_KEY` / `OPENROUTER_API_KEY`).

### Removed

- Mock OpenAI server test helper.

## [1.0.0] - 2026-02-23

### Added

- OpenAI adapter support.

[unreleased]: https://github.com/arki-moe/agent-ts/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/arki-moe/agent-ts/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/arki-moe/agent-ts/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/arki-moe/agent-ts/releases/tag/v1.0.0
