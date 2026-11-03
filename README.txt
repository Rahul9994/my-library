THE LIBRARY
===========

Open   : double-click  index.html   (works offline, no server needed)

Keys   : <- ->  or drag / wheel   move along the shelf
         Enter / click the lifted cover   open a book
         /  or  Ctrl+K            search
         Esc                      go back

Folders
  tajamul.codes_cheatsheets/           104 cheat sheets   (one folder per book, slides inside)
  tajamul.codes_code_posts/             91 SQL / Python code + notes
  tajamul.codes_projects_RAG_PowerBI/   20 projects, RAG and Power BI
  _site/                                the website itself (css, js, fonts, thumbnails)

ADDING MORE BOOKS (any author, any subject)
  1. Make a new folder next to index.html, e.g.  "My Books"
     Inside it, one folder per book, with the pages as 01.jpg, 02.jpg ... (.png / .webp also fine):
         My Books/The Art of Calm/01.jpg
         My Books/The Art of Calm/02.jpg
  2. Run:   python _site\tools\build_library.py
     It rebuilds the aligned 4:5 thumbnails and the catalogue. Reload index.html - done.

  Optional details (plain text files, every field optional):

     My Books/The Art of Calm/book.json
        { "title": "The Art of Calm",
          "author": "Jane Doe",
          "handle": "@janedoe",
          "source": "https://example.com/calm",
          "topic": "other",                 (sql, python, ml, ai, bi, data, career or other)
          "description": "A short guide to slowing down.",
          "date": "2026-05-02" }

     My Books/collection.json            (applies to every book in the folder)
        { "type": "book", "chip": "Books", "label": "Book", "author": "Jane Doe" }

  Without a book.json the title comes from the folder name and the date from the folder
  name (2026-05-02_the-art-of-calm) or its modified time. The filter chips (type / topic)
  appear on their own.

Credit: each book page shows its author and a link back to where it came from.
The first 215 books are by Tajamul Khan (@tajamul.codes) - kept here as a personal reading library.
