// Plain-language notes for the model catalog.
//
// The catalog is systematic — most entries are one base model fine-tuned on one
// Philippine language — so descriptions are derived per family rather than
// written one by one. Facts about the base models and training sets come from
// their public cards and papers; see ATTRIBUTION.md for the source list.

const languageNames = {
  bcl: 'Bikol',
  ceb: 'Cebuano',
  eng: 'English',
  fil: 'Filipino',
  hil: 'Hiligaynon',
  ilo: 'Ilocano',
  pag: 'Pangasinan',
  pam: 'Kapampangan',
  tsg: 'Tausug',
  war: 'Waray',
}

const baseNotes = {
  'microsoft/speecht5_tts':
    'SpeechT5 (Microsoft) — a shared speech-and-text encoder–decoder, originally fine-tuned for speech synthesis on LibriTTS. It writes 16 kHz mono audio.',
  'microsoft/speecht5_vc':
    'SpeechT5 (Microsoft), the voice-conversion configuration of the same shared speech-and-text model.',
  'openai/whisper-small':
    'Whisper Small (OpenAI) — a 244M-parameter encoder–decoder trained on about 680,000 hours of weakly supervised audio across 99 languages.',
  'sapinsapin/speecht5_tts-fsc':
    'The project\u2019s own SpeechT5 Filipino text-to-speech fine-tune, exported to ONNX for in-browser inference with Transformers.js (WebGPU or WASM).',
  'sapinsapin/whisper-small-fsc':
    'The project\u2019s own Whisper Small Filipino speech-recognition fine-tune, exported to ONNX for in-browser inference with Transformers.js (WebGPU or WASM).',
  'openai/whisper-large-v3':
    'Whisper Large-v3 (OpenAI) — the largest Whisper encoder–decoder at about 1.5 billion parameters, more accurate than Small and far slower to run.',
  'unsloth/orpheus-3b-0.1-pretrained':
    'Orpheus 3B (Canopy Labs, via Unsloth) — a 3-billion-parameter Llama-based speech language model that generates audio tokens; the project conditions it on a corpus speaker label rather than cloning a voice.',
  'ylacombe/omniASR_W2V_7B_SSL':
    'OmniASR W2V 7B SSL (Meta, ported to transformers) — the 7-billion-parameter encoder from the Omnilingual-ASR project, with a character CTC head attached by the project.',
  'sapinsapin/gpt-oss-20b-balitanlp-cpt':
    'The project\u2019s own gpt-oss-20b checkpoint continued-pretrained on Filipino news text.',
  'ylacombe/omniASR_W2V_1B_SSL':
    'OmniASR W2V 1B SSL (Meta, ported to transformers) — a 1-billion-parameter self-supervised speech encoder from the Omnilingual-ASR project; the project attaches CTC heads that transcribe in characters or syllables.',
  'meta-llama/Llama-3.1-8B':
    'Llama 3.1 8B (Meta) — an 8-billion-parameter multilingual base language model.',
  'openai/gpt-oss-20b':
    'gpt-oss-20b (OpenAI) — an open-weight mixture-of-experts model, roughly 21B parameters in total with about 3.6B active per token.',
  'aisingapore/Qwen-SEA-LION-v4-8B-VL':
    'Qwen-SEA-LION-v4 8B VL (AI Singapore) — a vision-language model built on Qwen3-VL and tuned for English plus seven Southeast Asian languages, Filipino among them.',
  'internetoftim/llama31-8b-balitanlp-cpt':
    'The project’s own Llama 3.1 8B checkpoint, already continued-pretrained on Filipino news text.',
}

const dataNotes = {
  'sapinsapin/pld':
    'Philippine Language Dataset — prompted 16 kHz speech recorded across nine Philippine languages and English.',
  'sapinsapin/filipinospeechcorpus':
    'The Filipino Speech Corpus (Sagum), cut into 16 kHz segments — mostly isolated word tokens, not sentences.',
  'LanceBunag/BalitaNLP':
    'BalitaNLP — about 352,000 Filipino news articles with their images.',
  'CohereLabs/aya_dataset':
    'The Aya dataset (Cohere Labs) — human-curated instruction examples across many languages.',
  'sapinsapin/halo-bikol':
    'Cleaned Bikol web text collected by the project.',
  'sapinsapin/halo-bcl':
    'Cleaned Bikol web text collected by the project (halo-bcl).',
}

// Entries that are not part of a per-language family.
const specialSummaries = {
  'qwen3vl-balitanlp-news-writer': 'Drafts Filipino news-style writing from a prompt and, because the base model is vision-language, from images as well.',
  'llama31-8b-balitanlp-cpt': 'A general-purpose Llama 3.1 whose training was continued on Filipino news text, so it handles Filipino far more naturally than the stock model.',
  'llama31-8b-balitanlp-IT': 'Takes the Filipino news checkpoint and tunes it to follow instructions, so it answers prompts rather than simply continuing text.',
  'gpt-oss-20b-balitanlp-cpt': 'OpenAI’s open-weight model with its training continued on Filipino news text, adapting it to Filipino usage.',
  bikoLLM: 'A Llama 3.1 adapted to Bikol — one of the first language models aimed specifically at that language.',
  'speecht5_vc-pld': 'Re-speaks an existing recording in a different voice while keeping the words and timing intact.',
  'speecht5_tts-fsc-ONNX': 'The Filipino text-to-speech model above, exported to ONNX so it can run directly in the browser with Transformers.js — the lighter, device-side path to the same voice.',
  'whisper-small-fsc-ONNX': 'The Filipino recognizer above, exported to ONNX so it can run directly in the browser with Transformers.js — the lighter, device-side path to the same model.',
  'halo-lid': 'A small, fast fastText language identifier that tells the ten PLD languages apart (plus "other"), built to filter web text for Philippine-language content.',
  'gpt-oss-20b-balitanlp-cpt-bf16': 'The Filipino-news gpt-oss-20b checkpoint re-exported in bf16 weights, for runtimes that do not load the original quantised format.',
}

function familyOf(name) {
  if (name.startsWith('speecht5_tts-pld-')) return { kind: 'tts', code: name.slice('speecht5_tts-pld-'.length) }
  if (name.startsWith('whisper-small-pld-')) return { kind: 'asr', code: name.slice('whisper-small-pld-'.length) }
  // "-norm" variants are trained and scored with stress accents and punctuation
  // stripped; the language code sits before that suffix.
  const norm = name.endsWith('-norm')
  const base = norm ? name.slice(0, -'-norm'.length) : name
  if (base.startsWith('whisper-large-v3-pld-')) return { kind: 'asr', code: base.slice('whisper-large-v3-pld-'.length), norm }
  if (base.startsWith('orpheus-3b-') && base.includes('-pld-')) return { kind: 'tts', code: base.slice(base.lastIndexOf('-pld-') + '-pld-'.length) }
  // omniASR repos spell the separator with an underscore ("…-ctc-char-pld_ceb"),
  // unlike the whisper models' hyphens. Covers both the 1B and 7B encoders.
  // The match is on the separator pair, not "_pld_": the published ids read
  // "…-ctc-char-pld_ceb", hyphen then underscore, which an "_pld_" search
  // never found — every omniASR card fell through to the generic summary.
  if (/^omniASR_W2V_\d+B_SSL-/.test(base)) {
    const code = base.match(/[-_]pld_([a-z]{3})$/)?.[1]
    if (code && languageNames[code]) return { kind: 'asr', code, norm }
  }
  if (name === 'speecht5_tts-fsc') return { kind: 'tts', code: 'fil' }
  if (name === 'whisper-small-fsc') return { kind: 'asr', code: 'fil' }
  if (name === 'whisper-small-fsc-pld-fil') return { kind: 'asr', code: 'fil' }
  // The ONNX suffixes are exports of the FSC fine-tunes above, same language.
  if (name === 'speecht5_tts-fsc-ONNX') return { kind: 'tts', code: 'fil' }
  if (name === 'whisper-small-fsc-ONNX') return { kind: 'asr', code: 'fil' }
  return null
}

export function describeModel(model) {
  const family = familyOf(model.name)
  let summary = specialSummaries[model.name]

  if (!summary && family) {
    const language = languageNames[family.code] ?? family.code.toUpperCase()
    summary = family.kind === 'tts'
      ? `Turns written ${language} into spoken audio, so text can be read aloud in the language.`
      : `Listens to spoken ${language} and writes down what was said.${family.norm ? ' Trained without stress accents or punctuation, so it writes plain lowercase text.' : ''}`
  }

  return {
    summary: summary ?? 'A public model in the SapinSapin AI catalog. See the model card for details.',
    base: baseNotes[model.architecture] ?? (model.architecture === '{{VERIFY}}' ? null : model.architecture),
    data: dataNotes[model.trainingData] ?? (model.trainingData === '{{VERIFY}}' ? null : model.trainingData),
    language: family ? (languageNames[family.code] ?? null) : null,
  }
}
