import { hubDatasets, hubModels, hubTotals, syncedAt } from './hubSnapshot.js'

const org = 'sapinsapin'

// Editorial copy lives here; every number comes from the Hub sync so the page
// cannot drift from the org. Run `npm run sync` before a deploy.
export const catalogSnapshot = new Date(`${syncedAt}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
})
export const totals = hubTotals

const datasetCopy = [
  {
    id: 'pld', title: 'Philippine Language Dataset', kicker: 'Speech · flagship collection',
    description: 'Prompted 16 kHz speech across nine Philippine languages and English, prepared for speech recognition and text-to-speech research.',
    languages: 'Bikol · Cebuano · Filipino · Hiligaynon · Ilocano · Pangasinan · Kapampangan · Tausug · Waray',
    size: '334,268 utterances · 448.2 h', license: 'up-dsp-research', updated: '11 Aug 2026',
    tags: ['speech', 'multilingual', 'ASR', 'TTS'], href: 'https://huggingface.co/datasets/sapinsapin/pld', featured: true,
  },
  {
    id: 'filipinospeechcorpus', title: 'Filipino Speech Corpus', kicker: 'Speech · open corpus',
    description: 'The Filipino Speech Corpus (Sagum) as segment-level 16 kHz audio. Mostly isolated word tokens rather than sentences — read the card’s limitations before training on it.',
    languages: 'Filipino · Tagalog', size: '305,246 segments · 65.1 h', license: 'MIT', updated: '11 Aug 2026',
    tags: ['speech', 'ASR', 'TTS', 'low-resource'], href: 'https://huggingface.co/datasets/sapinsapin/filipinospeechcorpus', featured: true,
  },
  {
    id: 'kumu-livestream-segmented', title: 'kumu-livestream-segmented', kicker: 'Speech · access controlled',
    description: 'Taglish code-switched livestream speech, segmented for ASR and TTS research. Public metadata identifies Filipino, Tagalog, and English.',
    languages: 'Tagalog · Filipino · English', size: '{{VERIFY}}', license: '{{VERIFY}}', updated: '11 Aug 2026',
    tags: ['speech', 'Taglish', 'ASR', 'TTS'], href: 'https://huggingface.co/datasets/sapinsapin/kumu-livestream-segmented', gated: true,
  },
  {
    id: 'kumu-livestream-raw', title: 'kumu-livestream-raw', kicker: 'Speech · access controlled',
    description: 'Unsegmented Taglish livestream source recordings. Access requires agreement to the dataset’s research-use and speaker-protection terms.',
    languages: 'Tagalog · Filipino · English', size: '{{VERIFY}}', license: '{{VERIFY}}', updated: '11 Aug 2026',
    tags: ['speech', 'Taglish', 'raw'], href: 'https://huggingface.co/datasets/sapinsapin/kumu-livestream-raw', gated: true,
  },
  {
    id: 'BantayWika', title: 'BantayWika', kicker: 'Text · literary & reference corpus',
    description: 'A FineWeb-compatible pretraining corpus derived from the UP Sentro ng Wikang Filipino and UP-DSP Bantay-Wika collection.',
    languages: 'Filipino · Cebuano · Ilocano', size: '6.09M tokens', license: '{{VERIFY}}', updated: '14 Mar 2026',
    tags: ['text', 'FineWeb', 'pretraining'], href: 'https://huggingface.co/datasets/sapinsapin/BantayWika',
  },
  {
    id: 'halohalo', title: 'halohalo', kicker: 'Text · combined web corpus',
    description: 'A FineWeb-compatible pretraining corpus combining the cleaned halo-tgl, halo-hil and halo-bcl corpora, with document-level provenance. Its totals already count all three.',
    languages: 'Tagalog · Hiligaynon · Bikol', size: '19.18M tokens · 16,727 documents', license: '{{VERIFY}}', updated: '28 Mar 2026',
    tags: ['text', 'FineWeb', 'web corpus'], href: 'https://huggingface.co/datasets/sapinsapin/halohalo',
  },
  {
    id: 'halo-tgl', title: 'halo-tgl', kicker: 'Text · Tagalog',
    description: 'A cleaned web-scraped Tagalog text corpus for LLM pretraining, with raw and cleaned text preserved side by side. Its cleaned documents are one of the three sources of halohalo.',
    languages: 'Tagalog', size: '6,589 documents', license: 'MIT', updated: '27 Mar 2026',
    tags: ['text', 'Tagalog', 'pretraining'], href: 'https://huggingface.co/datasets/sapinsapin/halo-tgl',
  },
  {
    id: 'halo-hil', title: 'halo-hil', kicker: 'Text · Hiligaynon',
    description: 'A cleaned web-scraped Hiligaynon text corpus for LLM pretraining, with raw and cleaned text preserved side by side. Its cleaned documents are one of the three sources of halohalo.',
    languages: 'Hiligaynon', size: '9,860 documents', license: 'MIT', updated: '27 Mar 2026',
    tags: ['text', 'Hiligaynon', 'pretraining'], href: 'https://huggingface.co/datasets/sapinsapin/halo-hil',
  },
  {
    id: 'halo-bcl', title: 'halo-bcl', kicker: 'Text · Bikol',
    description: 'A cleaned web-scraped Bikol text corpus for LLM pretraining, with raw and cleaned text preserved side by side. Its cleaned documents are one of the three sources of halohalo.',
    languages: 'Bikol', size: '1,264 documents', license: '{{VERIFY}}', updated: '27 Mar 2026',
    tags: ['text', 'Bikol', 'pretraining'], href: 'https://huggingface.co/datasets/sapinsapin/halo-bcl',
  },
]

// Hub license tags are lowercase slugs ('mit'); the cards read better with the
// conventional casing, and 'MIT' is what this grid showed before licenses synced.
const SPDX = { mit: 'MIT', 'apache-2.0': 'Apache-2.0', 'cc-by-4.0': 'CC-BY-4.0', 'cc-by-sa-4.0': 'CC-BY-SA-4.0', 'cc0-1.0': 'CC0-1.0' }
const formatLicense = (value) => (value ? SPDX[value] ?? value : null)

function formatDay(value) {
  if (!value) return '{{VERIFY}}'
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

const modelRows = [
  ['qwen3vl-balitanlp-news-writer', '{{VERIFY}}', 'aisingapore/Qwen-SEA-LION-v4-8B-VL', '{{VERIFY}}'],
  ['llama31-8b-balitanlp-cpt', 'Text generation', 'meta-llama/Llama-3.1-8B', 'LanceBunag/BalitaNLP'],
  ['llama31-8b-balitanlp-IT', '{{VERIFY}}', 'internetoftim/llama31-8b-balitanlp-cpt', 'CohereLabs/aya_dataset'],
  ['gpt-oss-20b-balitanlp-cpt', 'Text generation', 'openai/gpt-oss-20b', 'LanceBunag/BalitaNLP'],
  ['bikoLLM', 'Text generation', 'meta-llama/Llama-3.1-8B', 'sapinsapin/halo-bcl'],
  ['speecht5_tts-fsc', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/filipinospeechcorpus'],
  ['whisper-small-fsc', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/filipinospeechcorpus'],
  ['speecht5_tts-pld-bcl', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_tts-pld-ceb', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_tts-pld-eng', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_tts-pld-fil', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_tts-pld-hil', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_tts-pld-ilo', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_tts-pld-pag', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_tts-pld-pam', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_tts-pld-tsg', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_tts-pld-war', 'Text to speech', 'microsoft/speecht5_tts', 'sapinsapin/pld'],
  ['speecht5_vc-pld', 'Audio to audio', 'microsoft/speecht5_vc', 'sapinsapin/pld'],
  ['whisper-small-pld-bcl', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
  ['whisper-small-pld-ceb', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
  ['whisper-small-pld-eng', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
  ['whisper-small-pld-fil', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
  ['whisper-small-pld-hil', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
  ['whisper-small-pld-ilo', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
  ['whisper-small-pld-pag', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
  ['whisper-small-pld-pam', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
  ['whisper-small-pld-tsg', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
  ['whisper-small-pld-war', 'Speech recognition', 'openai/whisper-small', 'sapinsapin/pld'],
]

const datasetCopyById = new Map(datasetCopy.map((item) => [item.id, item]))
const modelCopyByName = new Map(modelRows.map(([name, ...rest]) => [name, rest]))

// A repo the Hub has but this file has never described. Rendered with the same
// {{VERIFY}} honesty the hand-written cards use rather than guessed at, so a
// newly published dataset shows up immediately and reads as undescribed instead
// of invented.
const undescribed = (id) => ({
  id, title: id, kicker: 'Data · newly published',
  description: 'Published on the Hub and not yet described here. The dataset card is the source of record.',
  languages: '{{VERIFY}}', size: '{{VERIFY}}', license: '{{VERIFY}}',
  tags: [], href: `https://huggingface.co/datasets/${org}/${id}`,
})

// The Hub decides WHICH repos exist; the copy above only decides how the ones
// we have written about are described. Iterating the snapshot rather than the
// copy is the whole point: previously a newly published repo raised the synced
// headline count while the table kept rendering the old hardcoded list, so the
// page said "29 models" above a table of 28. Editorial order is preserved for
// described datasets — the grid opens on the flagship corpora by design — and
// anything new is appended rather than dropped.
const onHub = new Set(hubDatasets.map((d) => d.id))
const liveDataset = new Map(hubDatasets.map((d) => [d.id, d]))

export const datasets = [
  ...datasetCopy.filter((item) => onHub.has(item.id)),
  ...hubDatasets.filter((d) => !datasetCopyById.has(d.id)).map((d) => undescribed(d.id)),
].map((item) => {
  const live = liveDataset.get(item.id)
  return {
    ...item,
    kind: item.kicker.split(' · ')[0].trim(),
    downloads: live?.downloads ?? 0,
    updated: live ? formatDay(live.updated) : '{{VERIFY}}',
    gated: live?.gated ?? item.gated ?? false,
    // The Hub wins when it states a real license; otherwise the card's own
    // wording stands, so a license change on the Hub reaches the page by sync.
    license: formatLicense(live?.license) ?? item.license,
  }
})

export const models = hubModels.map((live) => {
  const [fallbackTask, architecture, trainingData] =
    modelCopyByName.get(live.name) ?? ['{{VERIFY}}', '{{VERIFY}}', '{{VERIFY}}']
  return {
    name: live.name,
    architecture,
    trainingData,
    task: live.task ?? fallbackTask,
    downloads: String(live.downloads ?? 0),
    updated: formatDay(live.updated),
    href: `https://huggingface.co/${org}/${live.name}`,
  }
}).sort((a, b) => Number(b.downloads) - Number(a.downloads))
