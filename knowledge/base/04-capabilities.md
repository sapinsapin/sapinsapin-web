# 04 — Capabilities: Demonstrated vs. Aspirational
<!-- Durable structure and rules; the dataset/model TABLES themselves are volatile and generated separately (see 06-catalog placeholders below and generate-rag.mjs). -->

## Datasets and models — current public catalog

{{CATALOG_SUMMARY_LINE}}

{{DATASET_TABLE}}

**License rule: there is no single project-wide license.** Always name the specific dataset and its own license; if unstated, say "not stated on the public card — check huggingface.co/datasets/sapinsapin/<name>" rather than assuming MIT or "open" by default. Never tell a user a dataset can be used commercially without pointing them to that dataset's own card — commercial permission cannot be inferred from the project's existence or from other datasets' licenses.

{{MODEL_FAMILIES_SUMMARY}}

**Do not state exact parameter counts, benchmark scores, or "active"/production status for any specific model unless quoting its live model card.** A public repository existing on the Hub is not evidence of benchmarked quality or production deployment — describe what is public ("a public repository exists for X"), not what is proven.

The base models SapinSapin's fine-tunes build on (e.g. Llama 3.1, gpt-oss, Whisper, SpeechT5, Meta's OmniASR) are third-party foundation models — SapinSapin AI did not train these from scratch; it continues their training or fine-tunes them on Philippine-language data. Never imply SapinSapin AI trained a frontier foundation model from scratch.

{{INTERNETOFTIM_NOTE}}

## Demonstrated vs. aspirational capabilities

**Demonstrated / publicly confirmed:**
- Public dataset and model repositories under the `sapinsapin` Hugging Face organization (see catalog above)
- A public browser demo (the halohalo dashboard, a Gradio Space) that lets visitors test the project's speech models directly — the site itself notes that on free shared CPU hosting, responses can be slow [confirmed]
- The sapinsapin.ai website, which live-syncs its dataset/model counts from the Hugging Face org at each deploy [confirmed]

**Not established — do not state as fact:**
- Deployed healthcare, government, or emergency-response systems
- Formal legal, governance, or corporate structure
- Benchmarked accuracy or production-grade reliability of any specific model
- A single "N languages supported" figure independent of asset and modality — always describe coverage per dataset/model, never as a blanket project-wide claim

**Aspirational or proposed, attributed to individuals, not confirmed deployments:**
- Broader Philippine-language coverage beyond the currently published set
- More natural regional-language interaction with everyday technology
- Public-service, healthcare-access, or educational applications have been discussed by individual contributors as potential future use cases — these are proposals, not running services. If a user asks "does SapinSapin AI have a healthcare product," answer that no such deployment is confirmed and that this has only been discussed as a possible future application.
- Local/offline "AI box"-style deployment concepts have been discussed but are not confirmed as built or deployed.
