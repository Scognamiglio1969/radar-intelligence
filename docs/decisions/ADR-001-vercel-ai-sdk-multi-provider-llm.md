# ADR-001: Adopt Vercel AI SDK as the LLM provider boundary

## Author 
Sam Carrington <sam.carrington@frog.co>

## Status
Proposed

## Date
2026-07-13

## Context
Radar currently routes all LLM traffic through `lib/claude.ts`, which couples feature code, credentials, pricing, availability checks, and response parsing to Anthropic-specific APIs. That works today, but it blocks two goals:

- supporting more than one provider without duplicating model-call logic across features;
- preserving Radar-owned policy for budget enforcement, usage accounting, and provider selection.

The desired shape is a thin application-owned LLM service that sits above the transport layer. Feature code should call Radar interfaces, not provider SDKs directly. The service should support direct provider calls through a common abstraction, including Anthropic, OpenAI, and OpenAI-compatible endpoints. Vercel AI SDK already provides a stable TypeScript abstraction for these providers without requiring Vercel AI Gateway.

Key constraints:

- Radar must keep control of provider selection, credential handling, demo mode, spend caps, USD price calculation, usage persistence, and operational logging.
- Existing feature workflows should keep their current behavior while transport internals change.
- Structured-output migration is useful, but it should be separated from the initial provider-boundary change to reduce regression risk.

## Decision
Use Vercel AI SDK as the common implementation layer for LLM requests, behind a Radar-owned LlmService boundary. Do not introduce Vercel AI Gateway as a required dependency.

The Radar-owned service will own:

- provider and credential selection;
- mapping capability tiers such as `fast` and `capable` to provider model IDs;
- demo-mode behaviour;
- monthly spend enforcement;
- provider-aware USD price calculation;
- `api_usage` persistence;
- availability and error normalization;
- application logging and provider metadata.

The Vercel AI SDK will be an implementation detail behind that boundary. Direct provider packages such as `@ai-sdk/anthropic`, `@ai-sdk/openai`, and `@ai-sdk/openai-compatible` may be used underneath the service as needed.

## Alternatives Considered

### Keep the current Anthropic-only gateway
- Pros: Lowest immediate change, no migration work.
- Cons: Locks Radar into Anthropic-specific request/response shapes, pricing, and availability semantics; duplicates integration work if a second provider is added.
- Rejected: Does not meet the multi-provider requirement.

### Use Vercel AI Gateway as the transport layer
- Pros: Centralized routing, auth, and observability.
- Cons: Adds an extra hosted dependency that is not required for direct provider access; shifts more operational control away from Radar.
- Rejected: Radar should keep ownership of policy and transport selection.

### Build and maintain a custom provider abstraction without Vercel AI SDK
- Pros: Full control over interfaces and behavior.
- Cons: Recreates provider normalization, token accounting, and request mapping that the SDK already solves; higher maintenance burden.
- Rejected: More work, more surface area, less leverage from an established abstraction.

### Expose provider SDKs directly to feature code
- Pros: Minimal intermediate layer.
- Cons: Distributes provider-specific behavior across the app and makes model selection and budgeting harder to enforce consistently.
- Rejected: Violates the desired Radar-owned boundary.

## Consequences
- Radar gains direct access to multiple providers without Vercel AI Gateway.
- Feature code can depend on a stable application interface instead of provider-specific SDKs.
- Budget policy and usage tracking remain under Radar control.
- Migration can be incremental: one transport boundary first, structured outputs and other follow-up improvements later.
- The application still needs provider-aware pricing and normalization because SDK usage metadata does not replace Radar's billing model.
- The new boundary introduces a small amount of abstraction, but that cost is lower than maintaining provider-specific logic in each feature.

## Notes
This ADR intentionally covers the provider boundary and multi-provider support only. It does not decide on structured-output adoption, tier naming, or the final shape of every request/response type. Those decisions should follow after the boundary is in place.
