# Sappy RAG maintenance and reliability

Audited 2026-10-11. This is the current repository procedure; older SSAI Hermes bootstrap documents describing manual-only deployment and placeholder jobs are historical.

## Automatic update path

1. **06:23 Manila daily** (`23 22 * * *` UTC): `SSAI Knowledge Refresh` reads the public Hugging Face organization catalog, personal-account context, public GitHub repository list and current website source roster/references. Requests have timeouts/retries and pagination. Incomplete critical/supporting sources fail without replacing the snapshot.
2. Source facts are compared without generation timestamps or API ordering. Unchanged facts produce no PR. Changes regenerate a candidate from `knowledge/base`, validate asset details and open/update a bot-owned candidate PR. The workflow explicitly dispatches CI because its GitHub token does not run normal push-triggered CI.
3. CI includes structural/content RAG validation and regression tests. The existing protected main branch requires CI `build` and `Vercel`. The bot merge workflow keeps existing major-dependency exclusions, matches the exact checked commit, and waits for passing checks.
4. A successfully merged bot-owned RAG PR **explicitly dispatches** production deployment. GitHub token merges do not independently cause a push-triggered deployment. Human merges changing the generated file or QA also trigger the production push workflow. Deploy checks out current `main` to avoid deploying an obsolete queued snapshot.
5. Production validates, discovers one exact stable key, downloads and hashes the old bytes, retains a **90-day backup artifact**, checks for intervening production drift, uploads, waits for indexing, verifies downloaded bytes, then runs live retrieval QA. Failed indexing/content/retrieval checks restore the exact backup and verify its bytes. Requests and indexing waits are bounded to leave rollback time. Identical candidates run QA without an upload.
6. **08:53 Manila daily** (`53 0 * * *` UTC): `SSAI RAG Health` checks a successful main source refresh within 72 hours, stalled candidate PRs over 48 hours, one completed indexed item with chunks, byte equality with main and all retrieval QA. It also calls the live Sappy team-answer path to verify retrieval, model generation and approved CORS together (one small model request daily). It is read-only and shares the deployment lock. Failures are visible in Actions and its summary; notification delivery depends on the account's GitHub Actions notification settings.

Schedules may be delayed by GitHub; these are intended start times, not uptime guarantees. No scheduled agent thread or extra paid service was added. Credentials remain Production environment secrets; values never enter the generated file or repository.

## Sources and limits

- Current official public catalog: **48 models, 9 datasets**, verified via public APIs on 2026-10-11. The snapshot stores licenses from explicit tags/card metadata, access gates and modification dates. Generated knowledge now contains a per-model table, rather than family counts alone.
- Current website roster: **Tim Santos — Founder; Marc Ocampo and JC Diamante — Core team**. Removed the contradictory blanket statement excluding every quoted contributor from the roster. Interview opinions still remain attributed, not official policy.
- Private GitHub repositories are filtered even when an authenticated request is used.
- External articles, interviews, mission framing and other durable prose in `knowledge/base` require source review and editorial changes; this system does not automatically learn every new Discord discussion or arbitrary internet news.
- Retrieval QA checks relevant text/required/forbidden terms; it does not prove every factual claim, guarantee generated-answer quality, or prevent provider/network outages.
- The public web/Discord `/ask` Worker remains separately deployed. This work updates its knowledge source and CI/CD, not the model/provider or Discord onboarding runtime.

## Audit evidence

Before repair: Cloudflare `sappy-knowledge` was enabled and unpaused, one completed item, 11 vectors, no queued/running/error/outdated items. Production bytes matched origin/main and all **14** existing live retrieval tests passed using the Worker's five-result / 0.4 threshold. Latest successful deployment was run `37556444059` (2026-10-07).

Repairs: daily cadence; explicit bot-merge deployment dispatch; safe pending-check handling; exact commit match; source pagination, scoped authentication and bounded retries; fail-closed partial roster/reference/empty catalog handling; individual model license/details; precise per-asset validation; team contradiction correction; read-only daily monitoring; hashed backups, downloaded-byte verification, drift guard and no-op deployment. QA expanded to **16** including JC membership and gpt-oss model license metadata.

Local verification: **8** RAG regression tests; **53** existing Worker tests; generated candidate validation; actionlint; catalog parity; Vite build; CSP hashes; whitespace checks. All passed before publication. Tests mocked production mutations and Discord writes. The dated pre-change production backup is in the Codex audit workspace; subsequent production runs retain their own backup artifacts in GitHub Actions.

## Diagnose a failed update

- Start with Actions logs for Knowledge Refresh, CI, Auto-merge bot PRs, Production Deployment and RAG Health. A successful source refresh is different from a successful production update.
- Source failure: preserve the previous snapshot/index; fix the source fetch or parser, then dispatch refresh on main.
- Candidate stalled: inspect its exact CI/Vercel status and changed facts; do not bypass protected branch checks.
- Deploy failure: confirm whether rollback completed. Download the run's backup artifact; never assume an old item ID still exists. Stable key: `SapinSapin-knowledge-base-rag-current.md`, instance `sappy-knowledge`, namespace `default`.
- Health mismatch: inspect main vs live bytes and latest deployment before dispatching deployment. Do not auto-replace knowledge merely because a health check failed.
- Changing AI Search configuration, secrets or manual content still needs task authorization. Preserve backups and rollback. Current automatic publishing policy was established in the existing repository workflow; do not silently restore the superseded manual-only bootstrap design.

Initial PR #23 production rollout indexed the expanded catalog but failed the unchanged leadership retrieval question; the workflow restored and byte-verified the exact previous item. The follow-up makes the generated team roster an explicit searchable sentence, retains the same leadership query and five-result/0.4 threshold, and adds bounded public-chunk failure diagnostics. This is an observed rollback, not only a mocked test.
