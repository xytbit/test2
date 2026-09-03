---
title: "The Journal Now Runs on Markdown"
date: "2026-08-24"
description: "How the Tech Journal is produced now: drop a .md file in content/blog, run one build command, done."
author: "DCITC Technical Team"
role: "Publications sector"
category: "Meta"
tags:
  - Meta
  - Writing
---

If you can write a README, you can publish here. The journal is no longer a pile of hand-edited HTML — every article is a single Markdown file that the build turns into a page.

## How publishing works

Create a file in `content/blog/`. The filename becomes the URL, so `my-post.md` lives at `/blog/my-post/` forever.

```text
content/blog/
├── the-journal-now-runs-on-markdown.md   ← this post
└── reading-man-pages.md
```

Then rebuild:

```bash
node scripts/build.js
```

That is the entire workflow. No card to register, no list to update — the index page and your article page are generated from the files themselves, sorted newest first.

## What goes in the frontmatter

The block at the top of the file carries the metadata: title, date, description, author and tags are what you will touch most. `draft: true` keeps an unfinished post out of the build entirely.

> Write first, format later. Frontmatter takes thirty seconds; a good opening paragraph takes the rest of the evening.

## Formatting cheat sheet

Everything you expect works:

| You write | You get |
| --- | --- |
| `**bold**`, `*italic*` | **bold**, *italic* |
| `` `code` `` | inline code |
| `[text](url)` | a link |
| `> line` | blockquote |

Fenced blocks render in the site's terminal style:

```bash
git init club-journal && cd club-journal
echo "notes > opinions" > manifesto.txt
```

Lists come in both flavours:

1. numbered steps,
2. like this one,

- and bullets,
- like these.

---

New here? Read [the man pages primer](/blog/reading-man-pages/) next — it is the habit everything else in the club is built on.
