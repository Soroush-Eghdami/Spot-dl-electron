"""Draw the SpotifyDL icon (build/icon.ico)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
FOREST = (46, 58, 47)
MOSS = (107, 127, 91)
CLAY = (201, 111, 79)
CREAM = (248, 246, 238)
SAND = (217, 201, 178)

HERE = Path(__file__).resolve().parent


def rounded(size, radius, color):
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((0, 0, size - 1, size - 1), radius, fill=color)
    return layer


def main() -> None:
    canvas = Image.new("RGBA", (SIZE, SIZE), FOREST + (255,))

    # Soft color glows so the flat background feels alive.
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((-220, -260, 620, 520), fill=MOSS + (110,))
    draw.ellipse((520, 620, 1260, 1300), fill=CLAY + (70,))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    canvas = Image.alpha_composite(canvas, glow)

    # Clay tile.
    tile = rounded(520, 150, CLAY + (255,))
    tile_pos = ((SIZE - 520) // 2, (SIZE - 520) // 2)
    canvas.alpha_composite(tile, tile_pos)

    # Cream sound bars, tallest in the middle.
    bars = [150, 250, 330, 250, 150]
    bar_w = 34
    gap = 30
    total = len(bars) * bar_w + (len(bars) - 1) * gap
    x = (SIZE - total) // 2
    mid = SIZE // 2
    draw = ImageDraw.Draw(canvas)
    for height in bars:
        top = mid - height // 2
        draw.rounded_rectangle((x, top, x + bar_w, top + height), bar_w // 2, fill=CREAM)
        x += bar_w + gap

    # Thin sand ring for a bit of depth.
    ring = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(ring).rounded_rectangle(
        (18, 18, SIZE - 19, SIZE - 19), 210, outline=SAND + (60,), width=6
    )
    canvas = Image.alpha_composite(canvas, ring)

    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [canvas.resize((size, size), Image.LANCZOS) for size in sizes]
    frames[-1].save(
        HERE / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in sizes],
        append_images=frames[:-1],
    )
    canvas.resize((512, 512), Image.LANCZOS).save(HERE / "icon.png")
    print("wrote", HERE / "icon.ico")


if __name__ == "__main__":
    main()
