// Reads the transcribe tab's model labels, which the Space writes as one string
// per option:
//
//   "★ RECOMMENDED · whisper-large-v3-pld-ceb-norm · 1543M · CER 10.8% frozen-disjoint normalised"
//   "fast baseline · whisper-small-pld-ceb · 242M · CER 2.6% in-domain"
//   "whisper-small-pld-bcl · 242M · CER 4.0% in-domain"            (before the tiers existed)
//
// The label is ALSO the value Gradio validates, so it must be submitted
// byte-for-byte as the Space sent it — this module only reads it. Every caller
// that needs the model id, its size or its score goes through here instead of
// splitting on " · " itself: the Space added a tier prefix on 23 Sep 2026 and
// every `label.split(' · ')[0]` in the codebase silently started returning
// "★ RECOMMENDED" instead of a model id.

const TIERS = [
  [/recommended/i, 'recommended'],
  [/baseline/i, 'baseline'],
  [/research/i, 'research'],
]

export function parseModelLabel(label) {
  const parts = String(label ?? '').split(' · ').map((part) => part.trim()).filter(Boolean)
  const sizeAt = parts.findIndex((part) => /^\d+(\.\d+)?M$/.test(part))
  // The id is the part before the size; with no size, the first part that
  // looks like a repo name (no spaces) rather than a tier phrase.
  const idAt = sizeAt > 0 ? sizeAt - 1 : parts.findIndex((part) => !/\s/.test(part) && !/^★/.test(part))
  const id = idAt >= 0 ? parts[idAt] : parts[0] ?? ''
  const prefix = idAt > 0 ? parts.slice(0, idAt).join(' ') : ''
  const tier = TIERS.find(([pattern]) => pattern.test(prefix))?.[1] ?? null
  const metric = parts.find((part) => /^(CER|WER)\b/.test(part)) ?? ''
  const score = metric.match(/^(CER|WER)\s+([\d.]+)%/)
  return {
    label: String(label ?? ''),
    id,
    tier,
    sizeM: sizeAt >= 0 ? Number(parts[sizeAt].slice(0, -1)) : null,
    metric: score ? { name: score[1], value: Number(score[2]) } : null,
    // "in-domain" shares speakers with training and flatters the model;
    // "frozen-disjoint" is the honest held-out number. Kept verbatim so the UI
    // can show the Space's own wording.
    split: /frozen-disjoint/.test(metric) ? 'held-out' : /in-domain/.test(metric) ? 'in-domain' : null,
    normalised: /normalised|normalized/.test(metric) || /-norm$/.test(id),
  }
}

/** Family name for display: "whisper-large-v3", "whisper-small", "omniASR 1B". */
export function modelFamily(id) {
  if (/^whisper-large-v3/.test(id)) return 'Whisper Large-v3'
  if (/^whisper-small/.test(id)) return 'Whisper Small'
  if (/^omniASR_W2V_7B/.test(id)) return 'OmniASR 7B'
  if (/^omniASR_W2V_1B/.test(id)) return 'OmniASR 1B'
  return id
}

/** Picks the same model in a fresh list, by id, when the exact label moved. */
export function findSameModel(labels, wanted) {
  if (!labels?.length) return null
  if (labels.includes(wanted)) return wanted
  const id = parseModelLabel(wanted).id
  return labels.find((label) => parseModelLabel(label).id === id) ?? null
}

/** The fast whisper-small baseline for a language, whatever its tier prefix. */
export const findBaseline = (labels) =>
  (labels ?? []).find((label) => /^whisper-small-pld-/.test(parseModelLabel(label).id)) ?? null
