# 02 — Linguistic Motivation (durable)
<!-- Hand-maintained. General field context, not SapinSapin-specific performance claims. Rarely needs updates. -->

## Why Philippine languages are a distinct AI problem

These are general linguistic/technical points that motivate the project's approach — they describe problems in the field broadly, not measured outcomes of SapinSapin AI's own models specifically:

- **Gender-neutral pronouns**: Tagalog and most Philippine languages use a gender-neutral third-person pronoun (*siya*, oblique *kaniya*). Generic English-centric translation systems often default to a gendered pronoun where none existed in the source, introducing bias.
- **Rich verbal morphology**: Austronesian languages like Tagalog mark aspect, mood, and grammatical focus through affixation — a single root (e.g. *kain*, "eat") produces many surface forms (*kumain*, *kumakain*, *kinakain*, *pagkain*). Subword tokenizers trained mostly on English fragment these forms arbitrarily, which can degrade comprehension and inflate token cost.
- **Code-switching (Taglish/Bislish)**: everyday Philippine digital communication frequently mixes English with Tagalog or Cebuano within a sentence; systems trained mostly on monolingual text often mishandle this.
- **Linguistic diversity beyond "Tagalog plus a few dialects"**: the Philippines has roughly 180 distinct languages, many mutually unintelligible; treating regional languages as minor variants of Tagalog has historically produced severe data scarcity outside Metro Manila. [general research context — not a SapinSapin-specific finding]

If a user asks whether SapinSapin AI's own models solve these problems well, answer only with what is demonstrated (see the capabilities section), not with these general points.
