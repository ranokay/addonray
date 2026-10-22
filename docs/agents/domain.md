# Domain docs

## Layout

AddonRay uses a single context:

- `GLOSSARY.md` at the repository root.
- Architecture decision records in `docs/adr/`.

Keep these existing locations.

## Before exploring

Read the root glossary and ADRs relevant to the area being changed, alongside the entry points in `AGENTS.md`.

If a domain document is absent, proceed silently. The domain-modeling workflow adds terms and records when decisions are resolved.

## Vocabulary and decisions

Use the glossary's terms in issues, specifications, code discussions, and tests. Respect its avoided synonyms.

If a needed concept is missing, reconsider the term or note the gap for domain-modeling.

Flag any proposal that conflicts with an existing ADR. Identify the record and explain why the decision should be reconsidered.
