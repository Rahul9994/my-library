# The Library

A personal reading library: a browsable, motion-rich 3D bookshelf of **215 cheat sheets, code notes and guides** (1,737 slides) with a book page, a slide reader and search.

**Live site:** https://rahul9994.github.io/my-library/

## Credits and takedowns

**Every book on this site, including all slides, titles and descriptions, is the work of [Tajamul Khan](https://www.instagram.com/tajamul.codes/) ([@tajamul.codes](https://www.instagram.com/tajamul.codes/)).**
They were collected from his public Instagram posts as a personal reading library. Each book's page on the site shows his name and links back to the original post.

- I do not claim ownership of any of the slides. They are **not licensed** for reuse or redistribution - all rights remain with the author.
- Please follow [@tajamul.codes](https://www.instagram.com/tajamul.codes/) for the originals and for the extra notes and resources he shares.
- **If you are the author or a rights holder** and want something credited differently, changed or removed, please [open an issue](https://github.com/Rahul9994/my-library/issues) and it will be taken down promptly.

## Built with

- [GSAP](https://gsap.com/) for animation (GreenSock standard licence)
- [Newsreader](https://fonts.google.com/specimen/Newsreader) (Production Type) and [Inter](https://rsms.me/inter/) (Rasmus Andersson), both under the SIL Open Font License
- Python + [Pillow](https://python-pillow.org/) to build the aligned 4:5 thumbnails and the catalogue
- Site design and code by [Rahul9994](https://github.com/Rahul9994), built with help from Claude (Anthropic)

## Using it

Open `index.html` (works offline, no server needed) or visit the live site.

| Key | Action |
| --- | --- |
| `←` `→`, drag, wheel | move along the shelf |
| `Enter` / click the lifted cover | open a book |
| `/` or `Ctrl`+`K` | search |
| `Esc` | go back |

## Folders

| Folder | What is in it |
| --- | --- |
| `tajamul.codes_cheatsheets/` | 104 cheat sheets (one folder per book, slides inside) |
| `tajamul.codes_code_posts/` | 91 SQL / Python code posts and notes |
| `tajamul.codes_projects_RAG_PowerBI/` | 20 projects, RAG and Power BI posts |
| `_site/` | the website itself (css, js, fonts, thumbnails, build tools) |

## Adding more books (any author, any subject)

1. Make a new folder next to `index.html`, e.g. `My Books`, with one folder per book and the pages as `01.jpg`, `02.jpg`, ... (`.png` / `.webp` also work):

   ```
   My Books/The Art of Calm/01.jpg
   My Books/The Art of Calm/02.jpg
   ```

2. Run `python _site/tools/build_library.py`. It rebuilds the thumbnails and the catalogue; the filter chips appear on their own.

Optional details (plain JSON, every field optional):

`My Books/The Art of Calm/book.json`

```json
{
  "title": "The Art of Calm",
  "author": "Jane Doe",
  "handle": "@janedoe",
  "source": "https://example.com/calm",
  "topic": "other",
  "description": "A short guide to slowing down.",
  "date": "2026-05-02"
}
```

`topic` is one of `sql`, `python`, `ml`, `ai`, `bi`, `data`, `career`, `other`.

`My Books/collection.json` (applies to every book in the folder)

```json
{ "type": "book", "chip": "Books", "label": "Book", "author": "Jane Doe" }
```

Without a `book.json` the title comes from the folder name and the date from the folder name (`2026-05-02_the-art-of-calm`) or its modified time. Always credit the author of anything you add.
