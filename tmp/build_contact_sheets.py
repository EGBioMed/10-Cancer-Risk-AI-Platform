from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

source = Path("tmp/questionnaire-review-final-render")
output = source / "contact-sheets"
output.mkdir(exist_ok=True)

pages = sorted(source.glob("page-*.png"), key=lambda p: int(p.stem.split("-")[-1]))
thumb_w = 360
label_h = 34
gap = 18
cols = 3
rows = 2

for start in range(0, len(pages), cols * rows):
    batch = pages[start : start + cols * rows]
    with Image.open(batch[0]) as sample:
        thumb_h = round(sample.height * thumb_w / sample.width)
    sheet_w = gap + cols * (thumb_w + gap)
    sheet_h = gap + rows * (thumb_h + label_h + gap)
    sheet = Image.new("RGB", (sheet_w, sheet_h), "#d7dfdd")
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(batch):
        row, col = divmod(index, cols)
        x = gap + col * (thumb_w + gap)
        y = gap + row * (thumb_h + label_h + gap)
        with Image.open(path) as page:
            page = page.convert("RGB")
            page.thumbnail((thumb_w, thumb_h))
            sheet.paste(page, (x, y))
        page_number = int(path.stem.split("-")[-1])
        draw.text((x, y + thumb_h + 6), f"Page {page_number}", fill="#172322")
    end = min(start + cols * rows, len(pages))
    sheet.save(output / f"pages-{start + 1:03d}-{end:03d}.png")
