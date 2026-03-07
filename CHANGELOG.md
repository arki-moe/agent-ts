# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `agent.run` now accepts `options.once` to treat the user message as a one-shot hint without persisting it to `context`.

## [2.2.2] - 2026-03-06

### Changed

- **BREAKING**: Streaming adapters now return `Role.ToolCall[]` when tool calls are present, matching non-streaming semantics. Streaming no longer always returns a single AI message.

## [2.2.1] - 2026-03-06

### Added

- Streaming hook `onStream` for OpenAI and OpenRouter adapters. When set, adapters use SSE streaming for AI text deltas while `agent.run` still returns the final `Message[]`.

## [2.1.1] - 2026-03-06

### Changed

- `onToolResult` now receives a `ToolResult`-typed message.

## [2.1.0] - 2026-03-06

### Changed

- **BREAKING**: `onToolCall` now receives `(message, args)` and can return `false` to skip tool execution and `onToolResult`.

## [2.0.0] - 2026-03-05

### Added

- Config hooks: `endCondition`, `onToolCall`, `onToolResult`.
- Multiple tool calls in a single model response are now executed in parallel.

### Changed

- **BREAKING**: `Agent.run` now accepts a plain string instead of a `Message` object.
- **BREAKING**: `endCondition` moved from `Agent.run` parameter to constructor config.

### Removed

- **BREAKING**: `Agent.step` method.

## [1.0.3] - 2026-03-05

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

[unreleased]: https://github.com/arki-moe/agent-ts/compare/v2.2.2...HEAD
[2.2.2]: https://github.com/arki-moe/agent-ts/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/arki-moe/agent-ts/compare/v2.1.1...v2.2.1
[2.1.1]: https://github.com/arki-moe/agent-ts/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/arki-moe/agent-ts/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/arki-moe/agent-ts/compare/v1.0.3...v2.0.0
[1.0.3]: https://github.com/arki-moe/agent-ts/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/arki-moe/agent-ts/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/arki-moe/agent-ts/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/arki-moe/agent-ts/releases/tag/v1.0.0
