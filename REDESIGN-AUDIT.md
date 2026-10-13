# SEOCheck AI — Redesign Audit (2026-10-13)

## Competitors researched
- **Semrush Site Audit** — huge "Site Health" gauge up top; issues grouped by severity (Errors / Warnings / Notices) with counts; "Why and how to fix it" expander per issue; crawled-pages breakdown; thematic reports.
- **Ahrefs Site Audit** — health score + issue severity distribution; clean white UI, blue accent, grouped issue list.
- **Search Engine Land audit guide** — mirrors the mental model: crawlability → indexability → on-page, severity-first.

## Visual gaps (current state)
1. Fix queue is one flat ranked list — Semrush/Ahrefs **group issues by severity** (Errors / Warnings / Notices) with big counts. That grouping IS the category's visual signature.
2. Score dial is small and static — competitors make the health score the hero (large gauge, color-coded red→amber→green).
3. No severity count strip — the first thing an auditor sees in Semrush is "12 errors · 8 warnings · 5 notices".
4. Header "command deck" is generic teal — sharpen into an audit-console identity: ink header, gauge hero, severity palette.
5. Section cards are uniform — competitors give each category a health state (done / needs work) visible in the header row.

## Functional gaps closed in this pass
1. **Severity-grouped fix queue**: High/Medium/Low impact groups with count headers ("Errors"-style), rank order preserved inside groups; filters still apply.
2. **Severity count strip** under the score gauge (high/medium/low open-issue counts).
3. **Section health states**: each section header shows a health pill (Complete / In progress / Not started) plus the existing bar.
4. **Score band color-coding**: gauge + band label tinted red/amber/green by band (Semrush-style).

## Identity concept (implemented)
"Audit console" — deep ink header deck with oversized health gauge, severity palette (red = high-impact errors, amber = warnings, slate = notices), severity-grouped issue list with count badges, health-pilled section cards. Teal→deep-sea accent retained for brand continuity. Sharp edges, tabular numerals, no gradients.
