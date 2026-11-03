"""
Builds the data + aligned thumbnails for the Library website.

  python _site/tools/build_library.py

Reads the three collection folders next to index.html, then writes
  _site/thumbs/<id>.webp   640x800  (shelf covers)
  _site/covers/<id>.webp   1200x1500 (detail-page + hi-dpi shelf covers)
  _site/js/data.js          catalogue consumed by the site

Every cover is framed to the same 4:5 box:
  * near-4:5 slides are centre-cropped (never more than ~8%)
  * everything else (squares, 16:9, tall) is fitted whole and the bars take
    the colour of the slide's own edge, so nothing is ever cut off.
"""
import os, re, json, base64, io, sys, datetime
from PIL import Image, ImageStat

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SITE = os.path.join(ROOT, '_site')
COLS = [
    ('tajamul.codes_cheatsheets', 'cheatsheet'),
    ('tajamul.codes_code_posts', 'code'),
    ('tajamul.codes_projects_RAG_PowerBI', 'project'),
]
FORCE = '--force' in sys.argv          # re-render every image (default: only missing ones)
TH_W, TH_H = 640, 800
CV_W, CV_H = 1200, 1500
TARGET = TH_W / TH_H

EMOJI = re.compile(
    '[\U00010000-\U0010ffff☀-➿⬀-⯿️‍←-⇿⌀-⏿■-◿]+')


def clean_text(s):
    s = EMOJI.sub('', s)
    s = s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()


# --------------------------------------------------------------- captions
posts = json.load(open(os.path.join(ROOT, COLS[0][0], '_all_360_posts_captions.json'), encoding='utf-8'))
by_id = {p['id']: p for p in posts}
ids = sorted(by_id, key=len, reverse=True)


def parse_caption(cap):
    """-> (date iso | None, caption text)"""
    m = re.match(r'^.*? on ([A-Z][a-z]+ \d{1,2}, \d{4}): "([\s\S]*)"\.?\s*$', cap)
    if m:
        d = datetime.datetime.strptime(m.group(1), '%B %d, %Y').date().isoformat()
        return d, m.group(2)
    m = re.match(r'^([\s\S]*?)\s+-\s+(?:[\d,]+ likes, [\d,]+ comments\s+-\s+)?@?tajamul\.codes on ([A-Z][a-z]+ \d{1,2}, \d{4})', cap)
    if m:
        d = datetime.datetime.strptime(m.group(2), '%B %d, %Y').date().isoformat()
        return d, m.group(1)
    m = re.search(r'on ([A-Z][a-z]+ \d{1,2}, \d{4})', cap)
    d = datetime.datetime.strptime(m.group(1), '%B %d, %Y').date().isoformat() if m else None
    return d, ''


# ----------------------------------------------------------------- topics
TOPICS = [
    ('ai',     r'\brag\b|\bllm|genai|generative|agentic|langchain|chatbot'),
    ('bi',     r'power ?bi|\bdax\b|tableau|excel|dashboard|\bkpis?\b'),
    ('ml',     r'machine learning|\bml\b|deep learning|tensorflow|pytorch|neural|\bnlp\b|computer vision|feature engineering|mlops|statistic|\beda\b|outlier|missing data|time series'),
    ('sql',    r'\bsql\b|nosql|quer(y|ies)|\bjoins?\b'),
    ('python', r'python|\boop\b|fastapi|rest api|\bdsa\b|leetcode|javascript|\bgit\b'),
    ('data',   r'pyspark|spark|databricks|fabric|\bdbt\b|data engineering|pandas|numpy|matplotlib|seaborn|data cleaning|data analy|data science|azure|aws|\br cheat'),
]
TOPIC_LABEL = {'ai': 'AI', 'bi': 'BI', 'ml': 'ML', 'sql': 'SQL', 'data': 'Data', 'python': 'Python', 'career': 'Career'}
TOPIC_CODE = {'ai': 'AI', 'bi': 'BI', 'ml': 'ML', 'sql': 'SQL', 'data': 'DA', 'python': 'PY', 'career': 'CR'}


def topic_of(title, tags, cap):
    # the title is the strongest signal; hashtags/caption only break ties
    for hay in (title.lower(), ' '.join(tags).lower(), cap.lower()):
        for key, rx in TOPICS:
            if re.search(rx, hay):
                return key
    return 'career'


HOOK = re.compile(r"^(most |stop |don'?t |this .*(kit|cheat)|your |you |if |when |learning |slow |still |here'?s |everyone|nobody|i |skills|things|expectation|python (feels|isn|made)|sql made|clean data cleaning)", re.I)
TYPE_WORD = {'cheatsheet': 'Cheat Sheet', 'code': 'Notes', 'project': 'Guide'}


def short_title(title, topic, typ):
    t = title
    t = re.sub(r'^(the )?only ', '', t, flags=re.I)
    t = re.sub(r"\s*(you'?ll|you will|you'll) ever need.*$", '', t, flags=re.I)
    t = re.sub(r'\s+[—–]\s+.*$', '', t)                 # "X — subtitle" -> "X"
    t = re.sub(r'\.\s+[A-Z].*$', '', t)                           # "X. Y" -> "X"
    t = re.sub(r'[.:!—-]+\s*$', '', t).strip()
    if HOOK.search(t) or len(t) < 4:
        t = f'{TOPIC_LABEL[topic]} {TYPE_WORD[typ]}'
    if len(t) > 24:
        t2 = re.sub(r'\s+cheat ?sheets?$', '', t, flags=re.I)
        if len(t2) >= 8:
            t = t2
    if len(t) > 30:
        cut = t[:30].rsplit(' ', 1)[0]
        t = cut if len(cut) > 12 else t[:30]
        t = t.rstrip(' ,-&:') + '…'
    return t


def describe(body, slides, typ, topic):
    paras = [clean_text(p) for p in re.split(r'\n\s*\n', body)]
    keep = []
    for p in paras:
        if not p or p.startswith('#'):
            continue
        if re.match(r'^(follow|comment|save|share|like|dm|link in bio)\b', p, re.I):
            continue
        if re.search(r'comment\s+["\']?\w+["\']?\s+to get', p, re.I):
            continue
        keep.append(p)
    keep = keep[1:] if keep else keep          # first paragraph repeats the title
    text = ' '.join(keep).strip()
    if len(text) < 24:
        kind = {'cheatsheet': 'cheat sheet', 'code': 'set of notes and code', 'project': 'guide'}[typ]
        text = (f'A {slides}-slide {kind} on {TOPIC_LABEL[topic]}' if slides > 1
                else f'A single-page {kind} on {TOPIC_LABEL[topic]}') + ', collected from tajamul.codes.'
    return text[:420]


# --------------------------------------------------------------- imaging
def edge_color(im, side):
    w, h = im.size
    k = 6
    box = {'top': (0, 0, w, k), 'bottom': (0, h - k, w, h), 'left': (0, 0, k, h), 'right': (w - k, 0, w, h)}[side]
    return tuple(int(v) for v in ImageStat.Stat(im.crop(box)).median[:3])


def frame(im, W, H):
    w, h = im.size
    r = w / h
    if 0.74 <= r <= 0.87:                       # near 4:5 -> gentle crop
        if r > TARGET:
            nw = int(round(h * TARGET)); x0 = (w - nw) // 2
            im = im.crop((x0, 0, x0 + nw, h))
        else:
            nh = int(round(w / TARGET)); y0 = int((h - nh) * 0.30)
            im = im.crop((0, y0, w, y0 + nh))
        return im.resize((W, H), Image.LANCZOS)
    s = min(W / w, H / h)
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    small = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H))
    x0, y0 = (W - nw) // 2, (H - nh) // 2
    if nh < H:                                  # letterbox
        top, bot = edge_color(im, 'top'), edge_color(im, 'bottom')
        canvas.paste(Image.new('RGB', (W, y0), top), (0, 0))
        canvas.paste(Image.new('RGB', (W, H - y0 - nh), bot), (0, y0 + nh))
    if nw < W:                                  # pillarbox
        left, right = edge_color(im, 'left'), edge_color(im, 'right')
        canvas.paste(Image.new('RGB', (x0, H), left), (0, 0))
        canvas.paste(Image.new('RGB', (W - x0 - nw, H), right), (x0 + nw, 0))
    canvas.paste(small, (x0, y0))
    return canvas


def lqip(im):
    tiny = im.resize((12, 15), Image.LANCZOS)
    buf = io.BytesIO(); tiny.save(buf, 'WEBP', quality=45)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


# ------------------------------------------------------------------ build
books = []
for folder, typ in COLS:
    base = os.path.join(ROOT, folder)
    for d in sorted(os.listdir(base)):
        p = os.path.join(base, d)
        if not os.path.isdir(p):
            continue
        pid = next((i for i in ids if d.endswith('_' + i)), None)
        if not pid:
            print('!! no id for', d); continue
        files = sorted(f for f in os.listdir(p) if f.lower().endswith(('.jpg', '.jpeg', '.webp', '.png')))
        if not files:
            print('!! empty', d); continue
        date, body = parse_caption(by_id[pid]['cap'])
        if not date:
            m = re.match(r'(\d{4}-\d{2}-\d{2})_', d); date = m.group(1) if m else '2025-01-01'
        body = body.replace('\r', '')
        lines = [clean_text(l) for l in body.split('\n')]
        title = next((l for l in lines if l), 'Untitled')
        tags = [t.lower() for t in re.findall(r'#(\w+)', body)]
        topic = topic_of(title, tags, body)
        title = re.sub(r'\s+', ' ', title).strip()
        title = title.rstrip(' .') if len(title) > 3 else title
        books.append(dict(
            id=pid, type=typ, topic=topic, title=title, date=date, year=int(date[:4]),
            dir=f'{folder}/{d}', files=files, slides=len(files), tags=tags[:6], body=body,
        ))

books.sort(key=lambda b: (b['date'], b['id']), reverse=True)      # newest first

out = []
for n, b in enumerate(books, 1):
    src = Image.open(os.path.join(ROOT, b['dir'], b['files'][0]))
    src = src.convert('RGB')
    th_path = os.path.join(SITE, 'thumbs', b['id'] + '.webp')
    cv_path = os.path.join(SITE, 'covers', b['id'] + '.webp')
    if FORCE or not os.path.exists(th_path):
        frame(src, TH_W, TH_H).save(th_path, 'WEBP', quality=86, method=6)
    if FORCE or not os.path.exists(cv_path):
        frame(src, CV_W, CV_H).save(cv_path, 'WEBP', quality=88, method=6)
    th = Image.open(th_path).convert('RGB')
    short = short_title(b['title'], b['topic'], b['type'])
    out.append(dict(
        id=b['id'], n=n, type=b['type'], topic=b['topic'], code=TOPIC_CODE[b['topic']],
        title=b['title'], short=short, date=b['date'], year=b['year'],
        slides=b['slides'], dir=b['dir'], files=b['files'],
        desc=describe(b['body'], b['slides'], b['type'], b['topic']),
        tags=b['tags'], ig=f"https://www.instagram.com/p/{b['id']}/",
        thumb=f"_site/thumbs/{b['id']}.webp", cover=f"_site/covers/{b['id']}.webp",
        lq=lqip(th), src_ratio=round(src.width / src.height, 3),
        framed='crop' if 0.74 <= src.width / src.height <= 0.87 else 'fit',
    ))
    if n % 40 == 0:
        print('...', n)

data = dict(count=len(out), built=datetime.date.today().isoformat(), books=out)
with open(os.path.join(SITE, 'js', 'data.js'), 'w', encoding='utf-8') as f:
    f.write('window.LIBRARY = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')

from collections import Counter
print('books', len(out))
print('types ', Counter(b['type'] for b in out))
print('topics', Counter(b['topic'] for b in out))
print('framing', Counter(b['framed'] for b in out))
print('slides total', sum(b['slides'] for b in out))
