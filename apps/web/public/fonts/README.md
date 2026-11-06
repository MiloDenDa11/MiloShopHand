# Self-hosted Vietnamese fonts

The storefront uses complete upstream WOFF2 fonts, bundled locally through `next/font/local`:

- Inter Variable v4.1 for body text and commerce controls: [upstream](https://github.com/rsms/inter/tree/v4.1/docs/font-files), license `Inter-OFL.txt`.
- Lora Variable, regular and actual italic, for editorial headings: [upstream](https://github.com/cyrealtype/Lora-Cyrillic/tree/main/fonts/webfonts), license `Lora-OFL.txt`. The upstream author explicitly includes Vietnamese glyphs.

All files are distributed unmodified under the SIL Open Font License 1.1. These are full character sets, not isolated Vietnamese subsets: ASCII and accented characters use the same font. No browser request to Google Fonts or an absent proprietary font is required.

`components/brand-font.tsx` declares variable weights, the regular/italic styles, fallback metrics and `font-display: swap`. `app/layout.tsx` applies their CSS variables to the whole document.

The earlier Baket Fashion fallback was removed because its font file was absent and Vietnamese text could fall back glyph by glyph on some machines.
