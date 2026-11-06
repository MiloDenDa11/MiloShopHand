"""Rebuild delivery fonts: uv run --with 'fonttools[woff]==4.68.0' python scripts/subset-fonts.py.

Keep upstream WOFF2 files and OFL licenses. Retain Latin, Vietnamese, combining
marks, punctuation and currencies, including every variable weight and italic.
"""
import hashlib
import json
import unicodedata
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
folder = root / 'apps/web/public/fonts'
output = folder / 'latin-vietnamese'
output.mkdir(exist_ok=True)
ranges = [(0x0000, 0x024F), (0x0300, 0x036F), (0x1E00, 0x1EFF),
          (0x2000, 0x206F), (0x20A0, 0x20CF), (0x2100, 0x214F),
          (0x2190, 0x21FF), (0xFEFF, 0xFEFF), (0xFFFD, 0xFFFD)]
codepoints = {code for first, last in ranges for code in range(first, last + 1)}
sample = 'Mùa nào. Chất riêng ấy. MiloShopHand Đăng nhập Giỏ hàng Đỏ mận 549.000 ₫'
required = {ord(c) for c in sample + unicodedata.normalize('NFD', sample)}
report = []
for name, family in [('InterVariable.woff2', 'MiloSans'), ('Lora-Variable.woff2', 'MiloEditorial'), ('Lora-VariableItalic.woff2', 'MiloEditorial')]:
    original = folder / name
    font = TTFont(original)
    original_cmap = set(font.getBestCmap())
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.name_legacy = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    # Lora has a Reserved Font Name. Rename derived families while retaining
    # original copyright, author and license records (name IDs 0, 7–14).
    for record in font['name'].names:
        if record.nameID in {0, 7, 8, 9, 10, 11, 12, 13, 14}:
            continue
        text = record.toUnicode().replace('Inter', 'MiloSans').replace('Lora', 'MiloEditorial')
        record.string = text.encode(record.getEncoding())
    font.flavor = 'woff2'
    target = output / name
    font.save(target)
    delivered = TTFont(target)
    cmap = set(delivered.getBestCmap())
    assert original_cmap & codepoints <= cmap, f'Missing retained glyphs: {name}'
    # The source editorial family has no Dong sign; prices use MiloSans.
    expected = required if family == 'MiloSans' else required - {0x20AB}
    assert expected <= cmap, f'Missing Vietnamese sample glyphs: {name}'
    assert 'fvar' in delivered, f'Lost variable weights: {name}'
    report.append(dict(source=name, family=family, sourceSha256=hashlib.sha256(original.read_bytes()).hexdigest(), sourceBytes=original.stat().st_size, deliveredBytes=target.stat().st_size, glyphs=len(cmap), vietnameseVerified=True))
(output / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
print(json.dumps(report, indent=2))
