# SapinSapin AI brand kit

Upload the **PNG**. The SVG beside each one is its source: the logo SVGs are
self-contained vectors, but the banner SVGs pull Fraunces and Inter from Google
Fonts, so they only look right in a browser or an editor with those fonts
installed.

Everything under a platform folder is generated from `public/og-card.svg`'s
design by `npm run prepare:brand` (needs Google Chrome). Edit
`scripts/prepare-brand.mjs` and re-run rather than touching the files by hand.

## logo/

The master mark, three ways. Use the SVGs for anything that scales — print,
merch, design tools — and the 4096px PNGs where only an image is accepted.

| File | Use |
|---|---|
| `sapinsapin-logo-square` | Solid cream square |
| `sapinsapin-logo-rounded` | Rounded square, transparent corners |
| `sapinsapin-logo-bars` | Bars only, transparent background |

## Platforms

| Platform | File | Size | Keep clear |
|---|---|---|---|
| Facebook | `facebook/facebook-cover-1640x624.png` | 1640×624 | Phones crop the sides to about x 265–1375 |
| Facebook | `facebook/facebook-profile-720x720.png` | 720×720 | Shown as a circle |
| X | `x/x-header-1500x500.png` | 1500×500 (3:1) | Avatar covers the bottom-left |
| X | `x/x-profile-400x400.png` | 400×400 | Shown as a circle |
| LinkedIn | `linkedin/linkedin-profile-banner-1584x396.png` | 1584×396 (4:1) | Profile photo covers the bottom-left 568×264 |
| LinkedIn | `linkedin/linkedin-company-cover-1128x191.png` | 1128×191 | Page logo sits over the left edge |
| LinkedIn | `linkedin/linkedin-logo-400x400.png` | 400×400 | Company Page logo |
| YouTube | `youtube/youtube-banner-2560x1440.png` | 2560×1440 | Phones show only the centre 1546×423 |
| YouTube | `youtube/youtube-profile-800x800.png` | 800×800 | Shown as a circle |
| Instagram | `instagram/instagram-profile-1080x1080.png` | 1080×1080 | Shown as a 320px circle; no banner |

Profile pictures put the bars at 80% scale on a full cream square, so they
survive the circle crop every one of these platforms applies.

Sizes were checked in September 2026. Platforms change them without notice —
check the current spec before a redesign.
