---
document_type: sappy-rag-knowledge-base
version: "3.0-generated"
status: CANDIDATE — NOT YET DEPLOYED. Generated automatically from knowledge/base/*.md and knowledge/snapshots/current-public-state.json. Must not be treated as production until Marc explicitly approves and deploys it via the procedure in docs/SAPPY-RAG-UPDATE-PROCEDURE.md.
predecessor: SapinSapin-knowledge-base-rag-v2.md (content-frozen candidate, 2026-09-22) — itself succeeding SapinSapin-knowledge-base-rag-ready.md (v1, production item id 87c37f86cb5c42a387e5fdaa5ec5ab09, deployed 2026-09-18)
knowledge_snapshot_date: "2026-09-22"
generated_at: "2026-09-22T15:44:27.325Z"
canonical_source_policy: ssai/docs/KNOWLEDGE-SOURCES.md (authority hierarchy: live infra/repo > live first-party site/HF/repo > canonical SSAI docs > this RAG lineage > general research snapshot > inference)
source_manifest: knowledge/rag-sources.yaml
scope: Public-facing knowledge for Sappy (Discord + web chat assistant). Contains no secrets, account IDs, Discord IDs, OAuth details, or internal deployment instructions — see ssai/docs/SAPPY-OPERATIONS.md for that internal material.
---

# SapinSapin AI — Knowledge Base for Sappy (generated candidate)
## 01 — Identity and Mission (durable)

### What SapinSapin AI is

SapinSapin AI is an open research initiative building datasets, speech-recognition models, text-to-speech models, and text-generation models for Philippine languages, plus a public website and browser demo. [confirmed — sapinsapin-web repo, huggingface.co/sapinsapin]

Its own site states its purpose as: "SapinSapin AI builds open speech and language foundations so Philippine AI can be made with — and for — the people who speak it." [confirmed — sapinsapin.ai hero copy]

The organization is also styled "Sariling AI Pilipinas" (GitHub) and "Sariling Ai PINas" (Hugging Face) — both are the same initiative under different taglines, not separate projects. [confirmed]

SapinSapin AI is a community/research initiative. Whether it has any formal legal or corporate structure is not established by available evidence — do not state it is or is not incorporated, a nonprofit, or a company. [not verified]

### The name and its meaning

"Sapin-sapin" is a layered Filipino glutinous-rice dessert; the name is used as a metaphor for the layered linguistic plurality of the Philippines — its many languages, and the different material (text, audio, speech) the project works with. This explanation is attributed to project lead Tim Santos. [attributed perspective — supplied interview transcript, not an official glossary entry]

### Origin

Tim Santos led *The Philippine AI Report 2025*, a survey of 175 Philippine organizations conducted with Swarm Technologies, before founding SapinSapin AI. Tim Santos is described as Director of Product at Graphcore and lead author of that report both by a Featherless AI partner profile and by a Manila Times press profile (linked from the official SapinSapin AI site's own reference section). [press-corroborated, partner-reported — not a SapinSapin-published primary source, but no longer partner-only]

That report found approximately 92% of surveyed organizations had used AI in some capacity, while about 65% remained at proof-of-concept stage, and roughly 10–12% used deep frameworks like PyTorch/CUDA directly. [externally reported statistic — cite as the report's finding, not a SapinSapin AI metric]

Do not state that this report proves anything about SapinSapin AI's own models or outcomes — it describes the broader Philippine AI landscape that motivated the initiative's founding, not SapinSapin's results.

### Mission and motivation

The project's recurring goals: increase representation of Philippine languages in AI datasets and models; make research artifacts inspectable and reusable, subject to each asset's own license; and let people interact with language technology in languages and varieties familiar to them. [confirmed — site framing]

Tim Santos has framed this as wanting people to "speak to their technology in their own language" and to have it "capture the nuances of the culture, of the language" — summarized in his phrase "I just want to be heard." Present this as Santos's own framing of the initiative's purpose, not a universally agreed mission statement. [attributed perspective]

## 02 — Linguistic Motivation (durable)

### Why Philippine languages are a distinct AI problem

These are general linguistic/technical points that motivate the project's approach — they describe problems in the field broadly, not measured outcomes of SapinSapin AI's own models specifically:

- **Gender-neutral pronouns**: Tagalog and most Philippine languages use a gender-neutral third-person pronoun (*siya*, oblique *kaniya*). Generic English-centric translation systems often default to a gendered pronoun where none existed in the source, introducing bias.
- **Rich verbal morphology**: Austronesian languages like Tagalog mark aspect, mood, and grammatical focus through affixation — a single root (e.g. *kain*, "eat") produces many surface forms (*kumain*, *kumakain*, *kinakain*, *pagkain*). Subword tokenizers trained mostly on English fragment these forms arbitrarily, which can degrade comprehension and inflate token cost.
- **Code-switching (Taglish/Bislish)**: everyday Philippine digital communication frequently mixes English with Tagalog or Cebuano within a sentence; systems trained mostly on monolingual text often mishandle this.
- **Linguistic diversity beyond "Tagalog plus a few dialects"**: the Philippines has roughly 180 distinct languages, many mutually unintelligible; treating regional languages as minor variants of Tagalog has historically produced severe data scarcity outside Metro Manila. [general research context — not a SapinSapin-specific finding]

If a user asks whether SapinSapin AI's own models solve these problems well, answer only with what is demonstrated (see the capabilities section), not with these general points.

## 03 — Team and Contributors

### Leadership and team

The current sapinsapin-web site’s People section lists the following team members: [confirmed — src/App.jsx, highest-authority source for roles]

| Name | Role (per live site) | Links |
|---|---|---|
| Tim Santos | Founder | [LinkedIn](https://www.linkedin.com/in/internetoftim/), [Hugging Face](https://huggingface.co/internetoftim) |
| Marc Ocampo | Core team | [Website](https://marcocampo.com), [LinkedIn](https://www.linkedin.com/in/mnco25/), [Hugging Face](https://huggingface.co/marcxxv) |
| JC Diamante | Core team | [Website](https://jcdiamante.com), [LinkedIn](https://www.linkedin.com/in/jcdiamante/), [Hugging Face](https://huggingface.co/zeraphim) |

Do not name anyone else as a current formal team member. Other individuals sometimes mentioned in project discussion (e.g. contributors quoted in interviews) may hold views about the project without being on its team roster — attribute their statements to them by name rather than to "the SapinSapin AI team." [safe-answer rule]

Sappy itself, and questions about who built Sappy specifically, are answered by Sappy's own built-in identity rules, not by this knowledge base — do not restate creator-attribution details here if they appear elsewhere in the answer; keep this document to project facts, not Sappy's own persona rules.

### Contributor perspectives (attributed, not project policy)

The following are individual perspectives on the project's motivation, drawn from a supplied interview transcript. Always attribute these by name ("[Name] has said that...") — never present them as official SapinSapin AI positions or as consensus:

- **JC Diamante**: has argued that heavy reliance on foreign frontier models can cede cultural interpretation to outside actors, and that local models support Filipino-led research and self-representation.
- **Joseph Ian Kim Vidon**: has observed that generic machine translation can sound mechanical or unnatural in regional field engagements (e.g. greetings, local talking points).
- **Michelle Alarcon**: has suggested that local-language or Taglish interfaces could improve public-service inclusion for elderly or remote communities, and has raised healthcare access as a possible application area — not a confirmed deployment.
- **Jayve Iay E. Lato**: has suggested that a stronger domestic AI ecosystem could help retain Filipino technical talent.

None of the four individuals above appear on the live site's team roster. Do not describe them as current formal team members; describe them as people who have shared perspectives on the project. (This list is static/durable — if the live site later adds a genuinely new contributor perspective as a first-party citation, add them here by hand; this is not sourced from the automated refresh.)

## 04 — Capabilities: Demonstrated vs. Aspirational

### Datasets and models — current public catalog

Catalog totals as of 2026-09-22: 9 public datasets, 51 public models on huggingface.co/sapinsapin. **This count changes as the org publishes new work — always prefer the live Hugging Face org page over this number if the user needs a current total.** [confirmed via HF public API]

| Dataset | Content | Languages (Hub tag codes) | License / access |
|---|---|---|---|
| `BantayWika` | A FineWeb-compatible pretraining text corpus derived from UP Sentro ng Wikang Filipino and the UP-DSP Bantay-Wika collection. | fil, ceb, ilo | Not stated on the public card |
| `filipinospeechcorpus` | The Filipino Speech Corpus (Sagum) as segment-level 16 kHz audio — mostly isolated word tokens rather than full sentences. | fil, tl | MIT |
| `halo-bcl` | A cleaned web-scraped Bikol text corpus for LLM pretraining. | Not stated | Not stated on the public card |
| `halo-hil` | A cleaned web-scraped Hiligaynon text corpus for LLM pretraining. | hil | MIT |
| `halo-tgl` | A cleaned web-scraped Tagalog text corpus for LLM pretraining. | tl | MIT |
| `halohalo` | A combined FineWeb-compatible web corpus merging the cleaned halo-tgl, halo-hil, and halo-bcl corpora. | Not stated | Not stated on the public card |
| `kumu-livestream-raw` | Unsegmented Taglish livestream source recordings. | tl, fil, en | Not stated on the public card — behind an automatic Hugging Face access gate (agree-to-terms, not manually reviewed) |
| `kumu-livestream-segmented` | Taglish code-switched livestream speech, segmented for ASR/TTS research. | tl, fil, en | Not stated on the public card — behind an automatic Hugging Face access gate (agree-to-terms, not manually reviewed) |
| `pld` | Prompted 16 kHz speech, the flagship collection, recorded across nine Philippine languages plus English. | bcl, ceb, eng, fil, hil, ilo, pag, pam, tsg, war | `up-dsp-research` |

**License rule: there is no single project-wide license.** Always name the specific dataset and its own license; if unstated, say "not stated on the public card — check huggingface.co/datasets/sapinsapin/<name>" rather than assuming MIT or "open" by default. Never tell a user a dataset can be used commercially without pointing them to that dataset's own card — commercial permission cannot be inferred from the project's existence or from other datasets' licenses.

51 public model repositories exist on huggingface.co/sapinsapin as of 2026-09-22, grouped by task:

- **Untagged / other** (2 repositories): Additional generation/vision-language checkpoints not yet tagged with a Hub pipeline type — check the specific model card for its actual task.
- **Text Generation** (3 repositories): Continually-pretrained or fine-tuned large language models adapted to Filipino/Philippine-language text (e.g. Llama 3.1 and gpt-oss checkpoints continued on Filipino news text, plus a Bikol-focused fine-tune).
- **Text To Speech** (21 repositories): SpeechT5-based text-to-speech fine-tunes, mostly one model per Philippine language trained on the PLD dataset, plus a Filipino Speech Corpus fine-tune with a browser-deployable ONNX export.
- **Automatic Speech Recognition** (24 repositories): Whisper- and OmniASR-based speech-recognition fine-tunes, mostly one model per Philippine language trained on the PLD dataset, plus Filipino Speech Corpus fine-tunes with browser-deployable ONNX exports.
- **Audio To Audio** (1 repository): Voice-conversion models that re-speak existing audio in a different voice while preserving words and timing.

**Do not state exact parameter counts, benchmark scores, or "active"/production status for any specific model unless quoting its live model card.** A public repository existing on the Hub is not evidence of benchmarked quality or production deployment — describe what is public ("a public repository exists for X"), not what is proven.

The base models SapinSapin's fine-tunes build on (e.g. Llama 3.1, gpt-oss, Whisper, SpeechT5, Meta's OmniASR) are third-party foundation models — SapinSapin AI did not train these from scratch; it continues their training or fine-tunes them on Philippine-language data. Never imply SapinSapin AI trained a frontier foundation model from scratch.

Tim Santos also publishes SapinSapin-related model artifacts under his own personal Hugging Face account, `huggingface.co/internetoftim` (23 repositories at last check) — the official SapinSapin AI site itself links this account as where he "also publishes." Artifacts there (e.g. training checkpoints, sweep runs, some ONNX exports) are personal publications, not part of the `sapinsapin` organization's own catalog — check the specific card for license/status before citing anything hosted there, and do not conflate his personal account with the official organization catalog above. [confirmed — live HF API + site's own reference section]

### Demonstrated vs. aspirational capabilities

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

## 05 — Web Presence and How the Pieces Relate (durable)

### Web presence and how the pieces relate

- **sapinsapin.ai** — the public website; a statically-built React/Vite site whose dataset/model counts are synced from Hugging Face at build time. [confirmed]
- **huggingface.co/sapinsapin** — the organization's Hugging Face presence; the canonical live source for current dataset/model counts, licenses, and cards. [confirmed]
- **The halohalo dashboard** (huggingface.co/spaces/sapinsapin/halohalo-dashboard) — a public Gradio Space embedded in the website that lets visitors try the project's speech models live. [confirmed]
- **GitHub org `sapinsapin`** — hosts the website/Worker source and other project repositories. [confirmed]
- **Sappy** — this assistant, answering questions about SapinSapin AI on Discord and the public website's chat widget. Sappy is a support/community tool built on top of this knowledge base; it is not itself a SapinSapin AI research model, and it does not represent every SapinSapin AI research output. [confirmed]

If asked how to reach or follow the project: point to the official site (sapinsapin.ai), the Hugging Face org, and the GitHub org as the canonical public channels, rather than guessing at social handles not confirmed here.

## 06 — Partnerships and Participation (durable, but check periodically)

### Partnerships and research grounding

The UP Diliman DSP (Digital Signal Processing) Laboratory is named on the official site as a verified contributor to underlying speech and text corpus work (e.g. the BantayWika corpus derives from UP Sentro ng Wikang Filipino / UP-DSP Bantay-Wika materials). [confirmed — site FAQ/partner section]

The site is otherwise deliberately restrained about naming partners "until there is a verified list to show" — its own words. Do not name any other organization as an official SapinSapin AI partner unless a live, first-party source confirms it. [confirmed site policy, itself a safe-answer rule worth preserving]

### How people can participate

Per the official site's own FAQ: the current public invitation to contribute is to open an issue or discussion on a SapinSapin AI GitHub repository, making proposals, improvements, and questions visible to the community. [confirmed — site FAQ] Do not describe a more formal application process, membership structure, or paid role unless a live source confirms one exists.

## 07 — Safe-Answer and Qualification Rules (durable, epistemic safeguards)

### Safe-answer and qualification rules for Sappy

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

### Retrieval and maintenance guidance

This document is chunked by Cloudflare AI Search at 1024 tokens with a 10-token overlap, retrieved by vector similarity (no keyword/hybrid), top 10 results, score threshold 0.4 (see `docs/SSAI-ARCHITECTURE.md` for the live configuration — re-check there before assuming these numbers, since AI Search config can change independently of this document). Each section is written to stand alone as a coherent chunk: the qualifying language for a claim (license caveats, "not established," attribution) sits in the same section as the claim itself, not in a separate caveats appendix — preserve this when editing any base knowledge file.

**Deployment note:** the generated file this content feeds into is a candidate only until Marc explicitly approves and deploys it. See `docs/SAPPY-RAG-UPDATE-PROCEDURE.md` for the deployment and rollback procedure.

## 08 — Static Source Register (durable portion)

### Source register (static entries)

- `sapinsapin-web` GitHub repository (live site source: People/FAQ/catalog copy, `src/App.jsx`, `src/data/catalog.js`, `src/data/hubSnapshot.js`) — highest first-party authority for team/roles/site copy
- Hugging Face organization `huggingface.co/sapinsapin` (public API) — canonical for current dataset/model counts and licenses
- Hugging Face Space `huggingface.co/spaces/sapinsapin/halohalo-dashboard`
- Featherless AI partner profile of Tim Santos, and a Manila Times press profile of Tim Santos (linked from the site's own references) — partner-reported / press-corroborated, not first-party SapinSapin sources
- Supplied interview transcript featuring Tim Santos, JC Diamante, Joseph Ian Kim Vidon, Michelle Alarcon, Jayve Iay E. Lato — attributed-perspective source only, not verified beyond the transcript itself
- Archived research snapshots (`SapinSapin-knowledge-base-rag-ready.md` v1 2026-09-18, `SapinSapin-knowledge_base.md` general research 2026-09-18) — archived at `ssai/research/source-snapshots/`; see `ssai/research/KNOWLEDGE-RECONCILIATION-2026-09-22.md` for how conflicts were resolved
- General linguistic context (gender-neutral pronouns, Austronesian morphology, code-switching, PH language count) — general field knowledge, not a SapinSapin-specific citation

Full source authority tiers, refresh strategy, and which sources may auto-update which facts are defined in `knowledge/rag-sources.yaml` and `ssai/docs/KNOWLEDGE-SOURCES.md`.
