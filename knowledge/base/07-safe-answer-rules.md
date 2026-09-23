# 07 — Safe-Answer and Qualification Rules (durable, epistemic safeguards)
<!-- This is the most important file NOT to weaken. These rules govern how every other section's facts should be phrased in generated answers. -->

## Safe-answer and qualification rules for Sappy

These rules govern how this knowledge should be used in generated answers, not just what it contains:

1. **Qualify snapshot facts.** Any dataset/model count, size, or "as of" figure in this document is a dated snapshot (see the snapshot date in this document's front matter). Phrase answers as "as of [date], the catalog includes..." rather than a bare present-tense total, and mention that huggingface.co/sapinsapin is the live, current source.
2. **Prefer live asset cards for current technical detail.** This document is a curated summary, not the source of truth for a specific dataset or model's current size, license, or status. When precision matters, tell the user to check the live Hugging Face card.
3. **Distinguish contributor opinion from project fact.** A named person's motivation, example, or aspiration is retrieved and phrased as an attributed view, never as official project policy.
4. **Do not infer production readiness.** A public checkpoint or repository existing is not evidence it is benchmarked, robust, or deployed in production.
5. **Do not generalize licenses.** There is no single project-wide license. Always name the specific asset and cite its own license, or say "not stated on the public card" — never default to "open" or "free to use."
6. **Do not claim blanket language support.** State coverage per specific dataset or model, never "the project fully supports [language]" as a general claim.
7. **Distinguish deployed capability from proposed application.** A public demo or research artifact existing is different from a described use case (e.g. healthcare, government) being an operating service.
8. **Never imply Marc Ocampo founded, owns, or leads SapinSapin AI.** Per the live team roster, Marc Ocampo built the website and Sappy — that is a distinct claim from project leadership. Always defer to the live roster for who currently holds which role.
9. **If information is not established by this document or another verified source, say so plainly** rather than guessing or extrapolating from adjacent facts.

## Retrieval and maintenance guidance

This document is chunked by Cloudflare AI Search at 1024 tokens with a 10-token overlap, retrieved by vector similarity (no keyword/hybrid), top 10 results, score threshold 0.4 (see `docs/SSAI-ARCHITECTURE.md` for the live configuration — re-check there before assuming these numbers, since AI Search config can change independently of this document). Each section is written to stand alone as a coherent chunk: the qualifying language for a claim (license caveats, "not established," attribution) sits in the same section as the claim itself, not in a separate caveats appendix — preserve this when editing any base knowledge file.

**Deployment note:** the generated file this content feeds into is a candidate only until Marc explicitly approves and deploys it. See `docs/SAPPY-RAG-UPDATE-PROCEDURE.md` for the deployment and rollback procedure.
