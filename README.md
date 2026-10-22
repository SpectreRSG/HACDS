# HACDS Community Cookbook

A small website for collecting recipes from the Hebrew Academy Community Day School community and turning them into a printed hardcover cookbook. Copies are offered for donations to the HACDS Parents Association (Huntington Beach, CA).

**Live site:** https://cookbook.codehound.org · **Admin:** https://cookbook.codehound.org/admin.html

## The three pages

| Page | Address | Who uses it | What it does |
|---|---|---|---|
| **Share a recipe** | `/` | Families | Enter the community passphrase, fill in a 6-step form, preview how it will look in the book, submit. Works on phones. Progress is saved on the device while typing. |
| **Admin** | `/admin.html` | Cookbook team | Sign in with the admin passphrase. See every recipe grouped by category, search and filter, edit, mark as *New / Approved / Needs follow-up*, add private notes, delete. Download a spreadsheet (CSV) or a full backup (JSON). |
| **Print-ready book** | `/book.html` | Cookbook team | Builds the whole book: cover, welcome note, contents, a divider page per category, one recipe per page, a holiday index and a contributor thank-you page. Choose the page size, then print to PDF for the printer. |

## How it's built (in plain words)

- **`public/`** — the web pages people see (HTML for the structure, CSS for the look, JavaScript for the buttons and forms).
- **`netlify/functions/api.mts`** — a tiny "back office" program that runs on Netlify's servers. It checks the passphrase and saves or loads recipes.
- **Netlify Blobs** — Netlify's built-in storage where the recipes and photos are kept. No separate database to set up.

## Passphrases

There are two, and you choose them. They're set as **environment variables** in Netlify (secret settings that aren't stored in the code):

| Name | Example | Opens |
|---|---|---|
| `CONTRIBUTOR_PASSPHRASE` | `challah` | The recipe form. Share this in the school newsletter. |
| `ADMIN_PASSPHRASE` | `something long and private` | The admin and book pages (and the recipe form). Only for the cookbook team. |

Passphrases ignore capital letters and extra spaces, so phones that auto-capitalize won't cause problems. To change one, edit it in Netlify and redeploy.

## Putting it online (one time)

1. Sign in at [app.netlify.com](https://app.netlify.com) → **Add new project → Import an existing project** → pick this GitHub repository. Netlify reads `netlify.toml`, so you don't need to change any build settings.
2. In the project, open **Project configuration → Environment variables** and add `CONTRIBUTOR_PASSPHRASE` and `ADMIN_PASSPHRASE` (scope must include **Functions**).
3. Go to **Deploys → Trigger deploy**. Your site will be live at an address like `https://hacds-cookbook.netlify.app`.

## Making the printed book

1. Go to the admin page and mark the recipes you want as **Approved**.
2. Click **Print-ready book**. Set the title, subtitle, welcome note and page size, then **Save settings**.
3. In **Google Chrome on a computer**, click **Print / Save as PDF**:
   - Destination: **Save as PDF**
   - More settings → **Headers and footers: off**, **Background graphics: on**, Margins: **Default**
4. Upload that PDF as the inside pages to a print-on-demand service (e.g. Lulu or Blurb) or a local printer, using the same page size. The pages already have a wider inside margin for the spine and page numbers at the bottom. You'll design the hardcover jacket separately in the printer's cover tool.

Tip: download a **Backup (JSON)** from the admin page every so often, so you always have a copy of every recipe.

## Running it on your own computer (optional)

```bash
npm install
npm install -g netlify-cli
# make a file called .env with your test passphrases:
#   CONTRIBUTOR_PASSPHRASE=challah
#   ADMIN_PASSPHRASE=test admin
netlify dev
```

Then open http://localhost:8888.
