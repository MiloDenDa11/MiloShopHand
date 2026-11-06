# Self-hosted Vietnamese fonts

The storefront uses local Latin/Vietnamese WOFF2 delivery subsets through `next/font/local`. The complete upstream sources are retained here:

- Inter Variable v4.1 for body text and commerce controls: [upstream](https://github.com/rsms/inter/tree/v4.1/docs/font-files), license `Inter-OFL.txt`.
- Lora Variable, regular and actual italic, for editorial headings: [upstream](https://github.com/cyrealtype/Lora-Cyrillic/tree/main/fonts/webfonts), license `Lora-OFL.txt`. The upstream author explicitly includes Vietnamese glyphs.

Original files remain unmodified under the SIL Open Font License 1.1. Delivery files live in `latin-vietnamese/`, with derived family names MiloSans and MiloEditorial (Lora has a Reserved Font Name). They retain Latin, Vietnamese, combining marks, currencies and punctuation, along with variable weights and true italic. ASCII and Vietnamese use the same face. Prices use MiloSans, which includes the Dong sign; the upstream editorial family does not contain that symbol.

Rebuild with `uv run --with 'fonttools[woff]==4.68.0' python scripts/subset-fonts.py`. The script verifies retained code points, composed/decomposed Vietnamese and variable axes, and records source hashes and byte sizes in `latin-vietnamese/manifest.json`.

`components/brand-font.tsx` declares variable weights, the regular/italic styles, fallback metrics and `font-display: swap`. `app/layout.tsx` applies their CSS variables to the whole document.

The earlier Baket Fashion fallback was removed because its font file was absent and Vietnamese text could fall back glyph by glyph on some machines.
