# Issue tracker: GitHub

Issues and specs live in private `ranokay/addonray`. Use the `gh` CLI and pass `--repo ranokay/addonray` explicitly.

`docs/status.md` remains the delivery checklist and resumption entry point. `.scratch/` holds ignored working artifacts, not canonical tickets.

## Conventions

- Create an issue with `gh issue create --repo ranokay/addonray --title "..." --body-file <file>`.
- Read an issue with `gh issue view <number> --repo ranokay/addonray --json number,title,body,labels,comments`.
- List issues with `gh issue list --repo ranokay/addonray --state open --json number,title,labels`. Add label filters as needed.
- Comment with `gh issue comment <number> --repo ranokay/addonray --body-file <file>`.
- Apply or remove labels with `gh issue edit <number> --repo ranokay/addonray --add-label "..."` or `--remove-label "..."`.
- Close with `gh issue close <number> --repo ranokay/addonray --comment "..."`.

For multiline issue bodies and comments, write the exact text to a temporary file and use `--body-file`.

## Skill routing

When an invoked workflow says "publish to the issue tracker", create a GitHub issue. When it says "fetch the relevant ticket", read the referenced issue. Create issues only within the requested workflow.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Hierarchy and dependencies

Use GitHub sub-issues for parent/child tickets and native issue dependencies for blockers. Dependency API operations use the issue's numeric database ID, not its issue number or node ID.

If those features are unavailable, put `Part of #<parent>` and `Blocked by: #<number>` in the child body and maintain the parent's task list.

When wayfinder is invoked, its map is one issue labelled `wayfinder:map`; children use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`. Create those labels only as part of that requested workflow. Choose the first open, unassigned child in map order whose blockers are all closed. Claim it before implementation, then record the outcome and link it from the map when resolving it.
