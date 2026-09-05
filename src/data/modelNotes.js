// Plain-language notes for the model catalog.
//
// The catalog is systematic — most entries are one base model fine-tuned on one
// Philippine language — so descriptions are derived rather than written 28
// times. Facts about the base models and training sets come from their public
// cards and papers; see ATTRIBUTION.md for the source list.

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
}

// Entries that are not part of a per-language family.
const specialSummaries = {
  'qwen3vl-balitanlp-news-writer': 'Drafts Filipino news-style writing from a prompt and, because the base model is vision-language, from images as well.',
  'llama31-8b-balitanlp-cpt': 'A general-purpose Llama 3.1 whose training was continued on Filipino news text, so it handles Filipino far more naturally than the stock model.',
  'llama31-8b-balitanlp-IT': 'Takes the Filipino news checkpoint and tunes it to follow instructions, so it answers prompts rather than simply continuing text.',
  'gpt-oss-20b-balitanlp-cpt': 'OpenAI’s open-weight model with its training continued on Filipino news text, adapting it to Filipino usage.',
  bikoLLM: 'A Llama 3.1 adapted to Bikol — one of the first language models aimed specifically at that language.',
  'speecht5_vc-pld': 'Re-speaks an existing recording in a different voice while keeping the words and timing intact.',
}

function familyOf(name) {
  if (name.startsWith('speecht5_tts-pld-')) return { kind: 'tts', code: name.slice('speecht5_tts-pld-'.length) }
  if (name.startsWith('whisper-small-pld-')) return { kind: 'asr', code: name.slice('whisper-small-pld-'.length) }
  if (name === 'speecht5_tts-fsc') return { kind: 'tts', code: 'fil' }
  if (name === 'whisper-small-fsc') return { kind: 'asr', code: 'fil' }
  return null
}

export function describeModel(model) {
  const family = familyOf(model.name)
  let summary = specialSummaries[model.name]

  if (!summary && family) {
    const language = languageNames[family.code] ?? family.code.toUpperCase()
    summary = family.kind === 'tts'
      ? `Turns written ${language} into spoken audio, so text can be read aloud in the language.`
      : `Listens to spoken ${language} and writes down what was said.`
  }

  return {
    summary: summary ?? 'A public model in the SapinSapin AI catalog. See the model card for details.',
    base: baseNotes[model.architecture] ?? (model.architecture === '{{VERIFY}}' ? null : model.architecture),
    data: dataNotes[model.trainingData] ?? (model.trainingData === '{{VERIFY}}' ? null : model.trainingData),
    language: family ? (languageNames[family.code] ?? null) : null,
  }
}
