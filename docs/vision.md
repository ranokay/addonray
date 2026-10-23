# Vision

Firefox and Chrome users often know that a page is broken but cannot tell which extensions might be relevant or what they should try next. AddonRay makes that investigation understandable while explaining the evidence it cannot obtain.

## Audience and first useful outcome

The first usable release serves Firefox and Chrome desktop power users. A user should be able to review the extensions their browser exposes, understand their declared access, and follow a manual comparison workflow. Developer profiling is a later option, not the initial product.

A successful investigation leaves the user with a reproducible comparison and an honest account of uncertainty. It does not promise automatic conflict detection.

## Principles

- Request access when the user asks for a related action.
- Keep diagnostics local and temporary. Provide no telemetry or cloud service.
- Explain unavailable capabilities as normal outcomes.
- Distinguish installed, enabled, potentially permitted, and observed. Each answers a different question.
- Treat page data as untrusted and minimize what enters a report.
- Make any eventual native companion optional. The extension remains useful alone.

## Success criteria

Phase 0 succeeds when a developer can reproduce the consent, inventory, and selected-page probes and see which results came from real Firefox. The first usable release succeeds when a user can complete a guided comparison without AddonRay claiming unsupported control or attribution.

Before broader distribution, usability testing must show that users understand permission denial, missing metadata, restricted pages, and the difference between correlation and causation. Quantitative performance budgets will be set when a continuous collector is proposed and measured.

The initial feasibility evidence comes from Firefox. The approved Chrome MV3 continuation reuses the same inspection-only workflow, with browser-specific capability explanations and separate qualification. Other browsers require their own scope decision.
