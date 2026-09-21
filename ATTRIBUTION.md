# Attribution

## Map geometry

The hero’s Philippine boundary is generated from the 2023 country boundary in
[Philippines JSON Maps](https://github.com/faeldon/philippines-json-maps) by James Faeldon.

Copyright (c) James Faeldon. Licensed under the MIT License.

The boundary is simplified and reprojected by `scripts/prepare-map.mjs` (equirectangular
with a cos(midLat) correction on longitude, so proportions stay true). It is a visual
orientation layer, not a legal or navigational map. Language markers are placed at the
approximate centre of each language’s core region and are not language boundaries.

## Research citations

Cited on the page and listed in the References section:

- Joshi, Santy, Budhiraja, Bali & Choudhury. *The State and Fate of Linguistic Diversity
  and Inclusion in the NLP World.* ACL 2020. https://aclanthology.org/2020.acl-main.560/
- Blasi, Anastasopoulos & Neubig. *Systematic Inequalities in Language Technology
  Performance across the World’s Languages.* ACL 2022. https://aclanthology.org/2022.acl-long.376/
- Ethnologue (SIL International). *Languages of the Philippines.* https://www.ethnologue.com/country/PH/
- Tim Santos. *The Sapin-Sapin initiative — Sariling AI PINas.*
  https://www.linkedin.com/posts/internetoftim_currently-in-ai-engineer-singapore-will-activity-7461251671738978304-eazx/

Initiative background: Tim Santos — https://www.linkedin.com/in/internetoftim/ and
https://huggingface.co/internetoftim. Role and report authorship per The Manila Times,
24 May 2026: https://www.manilatimes.net/2026/05/24/tmt-newswire/global-ai-expert-tim-santos-leads-strategic-ai-masterclass-for-philippine-business-leaders/2350495

## Model descriptions

The hover notes in `src/data/modelNotes.js` describe each catalog entry’s base model and
training data. Facts about the base models come from their public cards and papers:

- SpeechT5 (TTS and voice conversion) — https://huggingface.co/microsoft/speecht5_tts
- Whisper Small — https://huggingface.co/openai/whisper-small
- Whisper Large-v3 — https://huggingface.co/openai/whisper-large-v3
- OmniASR W2V 1B SSL — https://huggingface.co/ylacombe/omniASR_W2V_1B_SSL
- Llama 3.1 8B — https://huggingface.co/meta-llama/Llama-3.1-8B
- gpt-oss-20b — https://openai.com/index/introducing-gpt-oss/
- Qwen-SEA-LION-v4 8B VL — https://huggingface.co/aisingapore/Qwen-SEA-LION-v4-8B-VL
- BalitaNLP — https://huggingface.co/datasets/LanceBunag/BalitaNLP
- Aya dataset — https://huggingface.co/datasets/CohereLabs/aya_dataset

The `-ONNX` exports inherit their architecture and training-set facts from the project’s own
`whisper-small-fsc` and `speecht5_tts-fsc` fine-tunes; export details (Transformers.js
inference, quantized variants) come from the two ONNX model cards.

Dataset and model counts, downloads, tasks, and dates are synced from the public Hub API
by `npm run sync` (`scripts/sync-catalog.mjs`), which writes `src/data/hubSnapshot.js`.
Run it before each deploy. `downloads` is the Hub's 30-day figure, matching the label used
by the org's own dashboard Space:
https://huggingface.co/spaces/sapinsapin/halohalo-dashboard

The sync runs at build time because the Hub API responds with
`access-control-allow-origin: https://huggingface.co`, so a browser on sapinsapin.ai
cannot call it directly.

## Logos

The GitHub and Hugging Face marks are the property of their respective owners and are
used only to link to those platforms.
