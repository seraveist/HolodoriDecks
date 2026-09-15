# Public site operations

## Languages and search

- Canonical app URLs: `https://holosims.net/ko/`, `/en/`, `/ja/`.
- Root `/` provides the Korean default and points canonically to `/ko/`; it is the `x-default` alternate.
- URL language wins over stored preferences. Switching language keeps owned cards and settings because all pages share the same origin.
- Run `python scripts/build-localized-pages.py` before a local preview. Pages runs it after deployment revision rewriting so language pages share the deployed JavaScript and image revision.
- The builder uses the app's translations and escapes them into HTML. Do not edit the generated language directories by hand.
- `robots.txt` allows crawling. `sitemap.xml` contains the three canonical app URLs.
- Add the `holosims.net` Domain property in Google Search Console, complete DNS ownership verification, and submit `https://holosims.net/sitemap.xml`. Existing verified owners can grant access instead. Inspect each language URL after deployment. Search Console account/DNS configuration is separate from a repository deployment.

## Security

- Dynamic text inserted into HTML attributes must pass through `escapeHtml`, or be assigned with DOM `setAttribute` / `textContent`.
- The HTML CSP permits local scripts/workers, the existing font CDN, and the pinned raw GitHub data fallback. Inline styles remain allowed because the score UI uses dynamic style attributes; inline scripts are not allowed.
- The theme bootstrap is an external local script so first-paint theme selection works with the CSP.
- HTML meta CSP cannot enforce `frame-ancestors`, and `X-Content-Type-Options` must be an HTTP response header. This deployment uses GitHub Pages: adding an arbitrary `_headers` file does not configure response headers. Full header control requires configuration on a fronting proxy or a host that supports response headers; do not assume the meta policy supplies those protections.
- External GitHub Actions are pinned to verified official repository commit SHAs. Review pins and Python dependencies periodically before updating them.
- Keep account multifactor authentication and recovery methods current. Never add API secrets to frontend files or generated data.

## Branch maintenance

- Enable **Settings → General → Pull Requests → Automatically delete head branches** for future merges.
- Preserve `main` and the three fixed `automation/` branches. The candidate branch is not a pull-request head and is reused between sync runs.
- For existing development branches, first compare the current branch tip with a merged PR's head SHA. A matching merged tip is a cleanup candidate; a closed PR alone does not prove its changes were merged. Squash merges may not appear in `git branch --merged`.
- Before deletion, save branch names and SHAs and retain a Git bundle or another recoverable backup. Recheck tips before deleting so newly pushed work is not lost.
- Protect main against force pushes/deletion and require PRs plus a passing `validate` check from GitHub Actions. Require up-to-date branches, and apply the rules to administrators too. A solo-maintainer repository can require a PR with zero additional approving reviews.
- Generated-sync GITHUB_TOKEN pushes do not trigger ordinary push/PR workflows. Before automatic merge, Master sync records `validate` on the exact generated commit after full reusable validation; card sync records it after the asset validation and anomaly gate. Both recheck the PR head before publishing the status and use `--match-head-commit` when merging. A changed base can block strict branch protection; regenerate and revalidate the sync branch rather than bypassing the rule.

No ad integration is included in this release.
