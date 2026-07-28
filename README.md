# ioclick — engineering notes

A dependency-free static blog. No build step, no frameworks. Plain HTML/CSS/JS
+ Markdown posts. Hosted on GitHub Pages at your custom domain.

## Add a new post (30 seconds)

1. Create a Markdown file in `posts/`, e.g. `posts/my-new-post.md`.
2. Add one entry to `posts/index.json` (newest first is automatic — it sorts by date):

```json
{
  "slug": "my-new-post",
  "title": "My New Post",
  "date": "2026-08-01",
  "read": "5 min read",
  "tags": ["Java", "System Design"],
  "excerpt": "One or two sentences shown on the home page."
}
```

The `slug` must match the filename (without `.md`). That's it — commit and push.

### Markdown supported
Headings (`#`–`####`), **bold**, *italic*, `inline code`, fenced ```code``` blocks
(with light Java highlighting), lists, > blockquotes, `---` rules, [links](url),
and | pipe | tables |.

## Run it locally
Open `index.html` in a browser — or, because it uses `fetch()`, serve it:

```bash
cd ioclick-blog
python3 -m http.server 8080
# visit http://localhost:8080
```

## Deploy to GitHub Pages + your domain

```bash
cd ioclick-blog
git init
git add -A
git commit -m "ioclick blog"
git branch -M main
git remote add origin git@github.com:CherupallyPremkumar/ioclick.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)**.

### Custom domain — ioclick.me
- The `CNAME` file says `ioclick.me`.
- At your DNS registrar, add records:
  - Apex domain (`ioclick.me`): four `A` records →
    `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
  - `www` subdomain: a `CNAME` → `CherupallyPremkumar.github.io`
- Back in GitHub **Settings → Pages**, enter your domain and tick **Enforce HTTPS**.

DNS can take up to an hour to propagate.
