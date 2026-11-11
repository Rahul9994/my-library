"""
Builds the catalogue + aligned thumbnails for the Library website.

  python _site/tools/build_library.py            (add --force to re-render every image)

Collections
  Every top-level folder next to index.html that contains book folders full of
  images (01.jpg, 02.jpg ...) is a collection - just drop a new one in.

Optional metadata (all fields optional, plain JSON)
  <collection>/collection.json   {"type": "book", "chip": "Books", "label": "Book",
                                  "author": "Jane Doe", "handle": "@jane"}
  <collection>/<book>/book.json  {"title": "...", "author": "...", "handle": "...",
                                  "source": "https://...", "topic": "sql|python|ml|ai|bi|data|career|other",
                                  "description": "...", "date": "2026-01-31", "tags": ["a", "b"]}
  Without book.json the title comes from the folder name and the date from the
  folder name (YYYY-MM-DD_...) or its modified time.

Writes
  _site/thumbs/<id>.webp   640x800   (shelf covers)
  _site/covers/<id>.webp   1200x1500 (detail-page + hi-dpi shelf covers)
  _site/js/data.js         catalogue consumed by the site

Every cover is framed to the same 4:5 box:
  * near-4:5 slides are centre-cropped (never more than ~8%)
  * everything else (squares, 16:9, tall) is fitted whole and the bars take
    the colour of the slide's own edge, so nothing is ever cut off.
"""
import os, re, json, base64, io, sys, datetime, hashlib
from collections import Counter
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
_cap_file = os.path.join(ROOT, COLS[0][0], '_all_360_posts_captions.json')
posts = json.load(open(_cap_file, encoding='utf-8')) if os.path.exists(_cap_file) else []
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
TOPIC_LABEL = {'ai': 'AI', 'bi': 'BI', 'ml': 'ML', 'sql': 'SQL', 'data': 'Data', 'python': 'Python', 'career': 'Career', 'other': 'General',
               'dsa': 'DSA', 'code': 'Programming', 'devops': 'DevOps', 'linux': 'Linux', 'security': 'Security'}
TOPIC_CODE = {'ai': 'AI', 'bi': 'BI', 'ml': 'ML', 'sql': 'SQL', 'data': 'DA', 'python': 'PY', 'career': 'CR', 'other': 'BK',
              'dsa': 'DS', 'code': 'PL', 'devops': 'DO', 'linux': 'LX', 'security': 'SC'}
TOPIC_NAME = {'sql': 'SQL', 'python': 'Python', 'ml': 'Machine learning', 'ai': 'AI & RAG', 'bi': 'Power BI & Excel', 'data': 'Data', 'career': 'Career & interviews', 'other': 'Other',
              'dsa': 'Algorithms & DSA', 'code': 'Programming languages', 'devops': 'DevOps & Docker', 'linux': 'Linux', 'security': 'Security & hacking'}
TOPIC_CHIP = {'sql': 'SQL', 'python': 'Python', 'ml': 'ML', 'ai': 'AI', 'bi': 'BI', 'data': 'Data', 'career': 'Career', 'other': 'Other',
              'dsa': 'DSA', 'code': 'Languages', 'devops': 'DevOps', 'linux': 'Linux', 'security': 'Security'}
TOPIC_DOT = {'sql': '#1c3ad2', 'python': '#1d5c43', 'ml': '#18181b', 'ai': '#a9291f', 'bi': '#d29b2d', 'data': '#2b6773', 'career': '#c4663c', 'other': '#8f8c84',
             'dsa': '#5b3a8c', 'code': '#7b2d4f', 'devops': '#4a6b1f', 'linux': '#6d4c41', 'security': '#b0123c'}


def topic_of(title, tags, cap):
    # the title is the strongest signal; hashtags/caption only break ties
    for hay in (title.lower(), ' '.join(tags).lower(), cap.lower()):
        for key, rx in TOPICS:
            if re.search(rx, hay):
                return key
    return 'career' if re.search(r'project|roadmap|resume|interview|career|\bjobs?\b', title.lower()) else 'other'


HOOK = re.compile(r"^(most |stop |don'?t |this .*(kit|cheat)|your |you |if |when |learning |slow |still |here'?s |everyone|nobody|i |skills|things|expectation|python (feels|isn|made)|sql made|clean data cleaning)", re.I)
TYPE_WORD = {'cheatsheet': 'Cheat Sheet', 'code': 'Notes', 'project': 'Guide', 'book': 'Book'}


def short_title(title, topic, typ):
    t = title
    t = re.sub(r'^(the )?only ', '', t, flags=re.I)
    t = re.sub(r"\s*(you'?ll|you will|you'll) ever need.*$", '', t, flags=re.I)
    t = re.sub(r'\s+[—–]\s+.*$', '', t)                 # "X — subtitle" -> "X"
    t = re.sub(r'\.\s+[A-Z].*$', '', t)                           # "X. Y" -> "X"
    t = re.sub(r'[.:!—-]+\s*$', '', t).strip()
    if HOOK.search(t) or len(t) < 4:
        t = f'{TOPIC_LABEL[topic]} {TYPE_WORD.get(typ, "Book")}'
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
    text = re.sub(r'\s*\n\s*', ' · ', text)                                   # single line breaks -> separators
    text = re.sub(r'(follow|collab with|dm|comment|tag)\b[^.\n]*@[\w.]+[^.\n]*\.?', '', text, flags=re.I)   # promo lines
    text = re.sub(r'@[\w.]+', '', text)                                       # stray handles
    text = re.sub(r'\s{2,}', ' ', text).strip(' ·')
    if len(text) < 24:
        kind = KIND.get(typ, 'book')
        on = '' if topic == 'other' else f' on {TOPIC_LABEL[topic]}'
        text = (f'A {slides}-slide {kind}{on}.' if slides > 1 else f'A single-page {kind}{on}.')
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
IMG_EXT = ('.jpg', '.jpeg', '.webp', '.png')
COLLECTION_DEFAULTS = {                    # credit for the three original collections
    'tajamul.codes_cheatsheets': dict(author='Tajamul Khan', handle='@tajamul.codes'),
    'tajamul.codes_code_posts': dict(author='Tajamul Khan', handle='@tajamul.codes'),
    'tajamul.codes_projects_RAG_PowerBI': dict(author='Tajamul Khan', handle='@tajamul.codes'),
}
TYPES = {                                  # key -> (filter chip, label)
    'cheatsheet': ('Cheatsheets', 'Cheat sheet'),
    'code': ('Code', 'Code & notes'),
    'project': ('Projects', 'Project & guide'),
    'book': ('Books', 'Book'),
}
KIND = {'cheatsheet': 'cheat sheet', 'code': 'set of notes and code', 'project': 'guide', 'book': 'book'}


def load_json(path):
    try:
        return json.load(open(path, encoding='utf-8-sig'))
    except Exception:
        return {}


def image_files(p):
    return sorted(f for f in os.listdir(p) if f.lower().endswith(IMG_EXT))


def source_label(url):
    if not url:
        return ''
    host = re.sub(r'^www\.', '', re.sub(r'^https?://', '', url).split('/')[0])
    return 'Instagram' if 'instagram.com' in host else host


def folder_title(d):
    t = re.sub(r'^\d{4}-\d{2}-\d{2}[_\s-]*', '', d)
    t = re.sub(r'_+', ' ', t)
    t = re.sub(r'(?<=\w)-(?=\w)', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t.title() if t == t.lower() else t


collections = [(f, t, COLLECTION_DEFAULTS.get(f, {})) for f, t in COLS]
known = {f for f, _ in COLS}
for folder in sorted(os.listdir(ROOT)):                    # any extra collection folder is picked up automatically
    base = os.path.join(ROOT, folder)
    if folder in known or folder.startswith(('_', '.')) or not os.path.isdir(base):
        continue
    if not any(os.path.isdir(os.path.join(base, d)) and image_files(os.path.join(base, d)) for d in os.listdir(base)):
        continue
    cj = load_json(os.path.join(base, 'collection.json'))
    typ = re.sub(r'[^a-z0-9]+', '-', str(cj.get('type', 'book')).lower()).strip('-') or 'book'
    if typ not in TYPES:
        TYPES[typ] = (cj.get('chip') or typ.title(), cj.get('label') or typ.title())
        KIND.setdefault(typ, str(TYPES[typ][1]).lower())
        TYPE_WORD.setdefault(typ, str(TYPES[typ][1]).title())
    collections.append((folder, typ, cj))
    print('collection:', folder, '->', typ)

books = []
for folder, typ, cdef in collections:
    base = os.path.join(ROOT, folder)
    if not os.path.isdir(base):
        continue
    for d in sorted(os.listdir(base)):
        p = os.path.join(base, d)
        if not os.path.isdir(p):
            continue
        files = image_files(p)
        if not files:
            print('!! no images in', folder + '/' + d); continue
        bj = load_json(os.path.join(p, 'book.json'))
        pid = next((i for i in ids if d.endswith('_' + i)), None)
        if pid:                                            # original Instagram collections: details come from the caption
            date, body = parse_caption(by_id[pid]['cap'])
            if not date:
                m = re.match(r'(\d{4}-\d{2}-\d{2})_', d); date = m.group(1) if m else '2025-01-01'
            body = body.replace('\r', '')
            lines = [clean_text(l) for l in body.split('\n')]
            title = next((l for l in lines if l), 'Untitled')
            tags = [t.lower() for t in re.findall(r'#(\w+)', body)]
            source = f'https://www.instagram.com/p/{pid}/'
        else:                                              # any other book: folder name + optional book.json
            pid = 'b' + hashlib.sha1((folder + '/' + d).encode('utf-8')).hexdigest()[:9]
            body, tags, source = '', [], ''
            title = folder_title(d)
            m = re.match(r'(\d{4}-\d{2}-\d{2})', d)
            date = m.group(1) if m else datetime.date.fromtimestamp(os.path.getmtime(p)).isoformat()
        # book.json overrides anything above
        title = re.sub(r'\s+', ' ', clean_text(str(bj.get('title') or title))).strip()
        title = title.rstrip(' .') if len(title) > 3 else title
        date = str(bj.get('date') or date)[:10]
        tags = [str(t).lower() for t in (bj.get('tags') or tags)]
        topic = bj.get('topic') if bj.get('topic') in TOPIC_LABEL else topic_of(title, tags, body)
        books.append(dict(
            id=pid, type=typ, topic=topic, title=title, date=date, year=int(date[:4]),
            dir=f'{folder}/{d}', files=files, slides=len(files), tags=tags[:6], body=body,
            description=str(bj.get('description') or ''),
            author=str(bj.get('author') or cdef.get('author') or ''),
            handle=str(bj.get('handle') or cdef.get('handle') or ''),
            source=str(bj.get('source') or source),
        ))

# ------------------------------------------- document books (PDF / EPUB)
# _site/tools/books_catalog.json lists full-length books kept as PDF/EPUB files under Books/.
# Each one gets a cover, a few preview pages (_site/pages/<id>/NN.webp) and a catalogue entry;
# the site opens the file itself in the reader. The files are git-ignored (size + licences), so
# a rebuild without them keeps the covers/previews already rendered.
DOC_CAT = os.path.join(SITE, 'tools', 'books_catalog.json')
DOC_ADDED = '2026-11-12'                   # the day these books joined the library
PV_W, PV_H = 360, 450                      # preview-page size (4:5)


def doc_short(t):
    t = re.sub(r'\s*\([^)]*\)', '', t)                       # "(2nd Edition)", "(eBook)", "(OpenStax)"
    t = re.sub(r'\s+-\s+.*$', '', t).strip()                  # "Title - subtitle" -> "Title"
    t = re.sub(r'^How to Think Like a Computer Scientist$', 'Think Like a CS', t)
    if len(t) > 30:
        cut = t[:30].rsplit(' ', 1)[0]
        t = (cut if len(cut) > 12 else t[:30]).rstrip(' ,-&:') + '…'
    return t


def render_page(doc, i, max_px):
    import pymupdf
    pg = doc.load_page(i)
    z = max_px / max(pg.rect.width, pg.rect.height)
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
    return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)


def blankish(im):
    return ImageStat.Stat(im.convert('L').resize((48, 60))).stddev[0] < 7


def pick_pages(n):
    if n <= 6:
        return list(range(n))
    return sorted({0} | {min(n - 1, max(1, round(n * f))) for f in (.03, .08, .16, .3, .5)})


docs = json.load(open(DOC_CAT, encoding='utf-8')) if os.path.exists(DOC_CAT) else []
TYPE_COUNT_DOCS = 0
for k, d in enumerate(docs):
    did = 'p' + hashlib.sha1(d['path'].encode('utf-8')).hexdigest()[:9]
    fpath = os.path.join(ROOT, *d['path'].split('/'))
    pdir = os.path.join(SITE, 'pages', did)
    th_path = os.path.join(SITE, 'thumbs', did + '.webp')
    cv_path = os.path.join(SITE, 'covers', did + '.webp')
    meta_path = os.path.join(pdir, 'pages.json')
    have = os.path.exists(th_path) and os.path.exists(cv_path) and os.path.exists(meta_path)
    if os.path.exists(fpath) and (FORCE or not have):
        import pymupdf
        os.makedirs(pdir, exist_ok=True)
        with pymupdf.open(fpath) as doc:
            n = doc.page_count
            ci = next((i for i in range(min(3, n)) if not blankish(render_page(doc, i, 300))), 0)
            cover = render_page(doc, ci, 1700)
            frame(cover, TH_W, TH_H).save(th_path, 'WEBP', quality=86, method=6)
            frame(cover, CV_W, CV_H).save(cv_path, 'WEBP', quality=88, method=6)
            used, files = [], []
            for p in pick_pages(n):
                if p == 0:
                    p = ci
                q = p
                while q < n - 1 and q - p < 4 and q != ci and blankish(render_page(doc, q, 200)):
                    q += 1                                   # skip blank/near-blank pages
                if q in used:
                    continue
                used.append(q)
                name = f'{len(files) + 1:02d}.webp'
                frame(render_page(doc, q, 900), PV_W, PV_H).save(os.path.join(pdir, name), 'WEBP', quality=72, method=6)
                files.append(name)
            json.dump(dict(pages=n, pg=[u + 1 for u in used], files=files, ratio=round(cover.width / cover.height, 3)),
                      open(meta_path, 'w', encoding='utf-8'))
    elif not have:
        print('!! missing file and no rendered cover, skipped:', d['path']); continue
    pm = json.load(open(meta_path, encoding='utf-8'))
    tags = [t for t in re.split(r'[\s/,()+]+', f"{d.get('tech', '')} {d.get('language', '')}".lower()) if len(t) > 1][:6]
    subject = d.get('subject') or ''
    desc = f"{subject}{' - ' + d['tech'] if d.get('tech') and d['tech'].lower() not in subject.lower() else ''}."
    if d.get('partial'):
        desc += ' This is the official free sample, not the full book.'
    books.append(dict(
        id=did, type='book', topic=d['topic'] if d['topic'] in TOPIC_LABEL else 'other', title=d['title'],
        date=DOC_ADDED, year=int(DOC_ADDED[:4]), rank=len(docs) - k,
        dir=f'_site/pages/{did}', files=pm['files'], slides=d.get('pages') or pm['pages'], tags=tags, body='',
        description=desc, author=d['author'], handle='', source=d['url'],
        doc=dict(path=d['path'], fmt=d['format'], pages=d.get('pages') or pm['pages'], mb=d['mb'], pg=pm['pg'],
                 license=d['license'], edition=d.get('edition', ''), site=d.get('source_site', ''), shelf=d.get('shelf', '')),
        ratio=pm.get('ratio', .77),
    ))
    TYPE_COUNT_DOCS += 1
    if TYPE_COUNT_DOCS % 25 == 0:
        print('... books', TYPE_COUNT_DOCS)

books.sort(key=lambda b: (b['date'], b.get('rank', 0), b['id']), reverse=True)      # newest first

out = []
for n, b in enumerate(books, 1):
    th_path = os.path.join(SITE, 'thumbs', b['id'] + '.webp')
    cv_path = os.path.join(SITE, 'covers', b['id'] + '.webp')
    if b.get('doc'):                                     # cover/thumb already rendered from the PDF above
        ratio = b['ratio']
    else:
        src = Image.open(os.path.join(ROOT, b['dir'], b['files'][0]))
        src = src.convert('RGB')
        ratio = src.width / src.height
        if FORCE or not os.path.exists(th_path):
            frame(src, TH_W, TH_H).save(th_path, 'WEBP', quality=86, method=6)
        if FORCE or not os.path.exists(cv_path):
            frame(src, CV_W, CV_H).save(cv_path, 'WEBP', quality=88, method=6)
    th = Image.open(th_path).convert('RGB')
    short = doc_short(b['title']) if b.get('doc') else short_title(b['title'], b['topic'], b['type'])
    rec = dict(
        id=b['id'], n=n, type=b['type'], topic=b['topic'], code=TOPIC_CODE[b['topic']],
        title=b['title'], short=short, date=b['date'], year=b['year'],
        slides=b['slides'], dir=b['dir'], files=b['files'],
        desc=b['description'] or describe(b['body'], b['slides'], b['type'], b['topic']),
        tags=b['tags'], author=b['author'], handle=b['handle'],
        source=b['source'], sourceLabel=source_label(b['source']),
        thumb=f"_site/thumbs/{b['id']}.webp", cover=f"_site/covers/{b['id']}.webp",
        lq=lqip(th), src_ratio=round(ratio, 3),
        framed='crop' if 0.74 <= ratio <= 0.87 else 'fit',
    )
    if b.get('doc'):
        rec['doc'] = b['doc']
    out.append(rec)
    if n % 40 == 0:
        print('...', n)

type_count = Counter(b['type'] for b in out)
topic_count = Counter(b['topic'] for b in out)
data = dict(
    count=len(out), built=datetime.date.today().isoformat(),
    types=[dict(key=k, chip=TYPES[k][0], label=TYPES[k][1], count=type_count[k]) for k in TYPES if type_count[k]],
    topics=[dict(key=k, label=TOPIC_NAME[k], chip=TOPIC_CHIP[k], dot=TOPIC_DOT[k], count=c) for k, c in topic_count.most_common()],
    books=out,
)
with open(os.path.join(SITE, 'js', 'data.js'), 'w', encoding='utf-8') as f:
    f.write('window.LIBRARY = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')

print('books', len(out))
print('types ', dict(type_count))
print('topics', dict(topic_count))
print('framing', Counter(b['framed'] for b in out))
print('slides total', sum(b['slides'] for b in out))
