# Sappy RAG production updates

## Automatic deployment

The weekly refresh proposes knowledge changes as a pull request. Once that PR
passes candidate validation, CI and Vercel and merges to protected `main`,
`SSAI RAG Production Deployment` runs automatically. It backs up the current
Cloudflare AI Search item, uploads the new candidate under the same item key,
waits for indexing, and checks live retrieval against `knowledge/qa/questions.json`.
If indexing or retrieval checks fail after the write, it restores the backed-up
content and waits for the restored item to index. A backup artifact is retained
for 90 days.

Manual dispatch is available for redeploying the current `main` version.

## One-time Cloudflare setup

1. In Cloudflare, open **My Profile → API Tokens → Create Token → Create Custom
   Token**.
2. Grant only **Account → AI Search: Edit** and **Account → AI Search: Run**.
   Use the account that owns the `sappy-knowledge` instance.
3. In this GitHub repository, open **Settings → Environments → Production**.
   Add these as environment secrets (never commit or paste them into a PR):
   - `CLOUDFLARE_API_TOKEN` — the token value
   - `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID
4. Do not add required reviewers to the Production environment if you want
   deployment to proceed without a manual approval after merge.

The first deployment run will back up the existing item ID recorded in
`scripts/rag/deploy-rag.mjs` before writing. If backup or credentials are
missing, it stops without changing production. A successful deploy is not
claimed until indexing and every retrieval QA question pass.

## Limits

Retrieval QA checks that live AI Search returns chunks containing expected
terms and excludes forbidden phrases. It does not prove every answer is
factually correct or test the Worker’s generated response. Review the candidate
PR contents and workflow logs for those limits. Automatic rollback restores
the previous file if post-write checks fail; if Cloudflare itself is
unavailable, rollback may also fail and the workflow reports that explicitly.
