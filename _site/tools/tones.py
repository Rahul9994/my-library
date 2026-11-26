"""
Reads the accent colour(s) of every cover, for the Dynamic View theme.

  python _site/tools/tones.py

Writes _site/js/tones.js:  window.LIBRARY_TONES = { "<book id>": [hue, second hue] }
Hues are degrees (0-359); -1 means "no clear colour" (the site then falls back to the
book's topic). build_library.py runs this automatically after rebuilding the catalogue.
"""
import colorsys, json, os

from PIL import Image

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BINS = 36                      # 10 degrees each


def cover_hues(path):
    im = Image.open(path).convert('RGB').resize((64, 80), Image.BOX)
    hist = [0.0] * BINS
    sums = [0.0] * BINS        # weighted hue offsets, to recover a precise peak
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < .34 or v < .28:                     # whites, greys and blacks carry no colour
                continue
            w = s * s * v
            deg = h * 360
            i = int(deg // (360 / BINS)) % BINS
            hist[i] += w
            sums[i] += w * (deg - i * 360 / BINS)
    total = sum(hist) / (im.width * im.height)
    if total < .012:                                   # less than about 2% of the cover is coloured
        return [-1, -1]
    smooth = [hist[i] + .6 * (hist[i - 1] + hist[(i + 1) % BINS]) for i in range(BINS)]

    def peak_hue(i):
        near = [(i - 1) % BINS, i, (i + 1) % BINS]
        top = max(near, key=lambda k: hist[k])
        return int(round(top * 360 / BINS + (sums[top] / hist[top] if hist[top] else 5))) % 360

    first = max(range(BINS), key=lambda i: smooth[i])
    far = [i for i in range(BINS) if min((i - first) % BINS, (first - i) % BINS) >= 5]
    second = max(far, key=lambda i: smooth[i])
    h2 = peak_hue(second) if smooth[second] >= .2 * smooth[first] else -1
    return [peak_hue(first), h2]


def write(books):
    """books: the catalogue entries (dicts with at least an "id")."""
    out = {}
    for b in books:
        thumb = os.path.join(SITE, 'thumbs', b['id'] + '.webp')
        if os.path.exists(thumb):
            out[b['id']] = cover_hues(thumb)
    with open(os.path.join(SITE, 'js', 'tones.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('window.LIBRARY_TONES = ' + json.dumps(out, separators=(',', ':')) + ';\n')
    return out


if __name__ == '__main__':
    src = open(os.path.join(SITE, 'js', 'data.js'), encoding='utf-8').read()
    data = json.loads(src[src.index('{'):src.rindex('}') + 1])
    out = write(data['books'])
    coloured = sum(1 for v in out.values() if v[0] >= 0)
    print('tones written for', len(out), 'books;', coloured, 'with a colour of their own')
