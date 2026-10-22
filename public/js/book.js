// Builds the whole cookbook as printable pages:
// cover → welcome → contents → (category divider + recipes)… → holiday index → thank-yous.
import { $, show, api, storage, escapeHtml, recipeHtml, photoUrl, CATEGORIES, HOLIDAYS } from "./common.js";

const ADMIN_KEY = "cookbook-admin-passphrase";
const passphrase = storage.get("sessionStorage", ADMIN_KEY) || "";

const SIZES = {
  "8x10": ["8in", "10in"],
  letter: ["8.5in", "11in"],
  "6x9": ["6in", "9in"],
};
const DEFAULTS = {
  title: "From Our Kitchens",
  subtitle: "Favorite Recipes from the HACDS Community",
  intro: "",
  pageSize: "8x10",
  onlyApproved: true,
};

const form = $("#settings");
let recipes = [];
let photos = new Map();

function fail(message) {
  $("#book-error").innerHTML = message;
  show($("#book-error"));
}

async function start() {
  if (!passphrase) {
    fail(`Please <a href="/admin.html">sign in on the admin page</a> first, then come back here.`);
    return;
  }
  try {
    const [list, saved] = await Promise.all([
      api("recipes", { passphrase }),
      api("settings", { passphrase }),
    ]);
    recipes = list.recipes;
    const s = { ...DEFAULTS, ...saved.settings };
    for (const key of ["title", "subtitle", "intro", "pageSize"]) form.elements[key].value = s[key];
    form.elements.onlyApproved.checked = s.onlyApproved;
    show(form);
    build();
    // Photos are private, so download them with the passphrase, then rebuild.
    await Promise.all(recipes.filter((r) => r.photoId).map(async (r) => {
      photos.set(r.photoId, await photoUrl(r.photoId, passphrase));
    }));
    build();
  } catch (err) {
    fail(escapeHtml(err.message));
  }
}

function settings() {
  return {
    title: form.elements.title.value.trim(),
    subtitle: form.elements.subtitle.value.trim(),
    intro: form.elements.intro.value.trim(),
    pageSize: form.elements.pageSize.value,
    onlyApproved: form.elements.onlyApproved.checked,
  };
}

const paragraphs = (text) =>
  text.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br />")}</p>`).join("");

function build() {
  const s = settings();
  const [w, h] = SIZES[s.pageSize] || SIZES["8x10"];
  const small = s.pageSize === "6x9";
  // Inside margin (toward the spine) is wider so text isn't lost in the binding.
  $("#page-size").textContent = `
    :root { --page-w: ${w}; --page-h: ${h}; }
    @page { size: ${w} ${h}; margin: ${small ? "0.6in" : "0.75in"}; }
    @page :right { margin-left: ${small ? "0.8in" : "0.95in"}; }
    @page :left { margin-right: ${small ? "0.8in" : "0.95in"}; }
    @page { @bottom-center { content: counter(page); font: italic 9pt Georgia, serif; color: #777; } }
    @page :first { @bottom-center { content: none; } }
    ${small ? "@media print { .recipe-body { grid-template-columns: 1fr !important; } .recipe-photo img { max-height: 1.9in; } }" : ""}
  `;

  const chosen = recipes.filter((r) => !s.onlyApproved || r.status === "approved");
  const byCategory = CATEGORIES
    .map((cat) => [cat, chosen.filter((r) => r.category === cat).sort((a, b) => a.title.localeCompare(b.title))])
    .filter(([, list]) => list.length);

  $("#book-count").textContent = `${chosen.length} recipe${chosen.length === 1 ? "" : "s"} in the book` +
    (s.onlyApproved ? ` (${recipes.length - chosen.length} not yet approved are left out)` : "");

  const cover = `
    <section class="page cover"><div class="frame">
      <h1>${escapeHtml(s.title || DEFAULTS.title)}</h1>
      ${s.subtitle ? `<p class="subtitle">${escapeHtml(s.subtitle)}</p>` : ""}
      <p class="org">Hebrew Academy Community Day School<br />Parents Association</p>
      <p class="place">Huntington Beach, California · ${new Date().getFullYear()}</p>
    </div></section>`;

  const intro = s.intro ? `
    <section class="page intro"><h2>Welcome</h2>${paragraphs(s.intro)}</section>` : "";

  const toc = `
    <section class="page toc"><h2>Contents</h2>
      ${byCategory.map(([cat, list]) => `
        <div class="toc-section"><h3>${escapeHtml(cat)}</h3><ul>
          ${list.map((r) => `<li>${escapeHtml(r.title)} <span>· ${escapeHtml(r.submittedBy)}</span></li>`).join("")}
        </ul></div>`).join("")}
    </section>`;

  const chapters = byCategory.map(([cat, list]) => `
    <section class="page divider"><h2>${escapeHtml(cat)}</h2><div class="rule"></div>
      <p>${list.length} recipe${list.length === 1 ? "" : "s"}</p></section>
    ${list.map((r) => `<section class="page">${recipeHtml(r, r.photoId ? photos.get(r.photoId) : "")}</section>`).join("")}
  `).join("");

  const holidayGroups = HOLIDAYS
    .map((hol) => [hol, chosen.filter((r) => (r.holidays || []).includes(hol)).sort((a, b) => a.title.localeCompare(b.title))])
    .filter(([, list]) => list.length);
  const holidays = holidayGroups.length ? `
    <section class="page index"><h2>Recipes for the Holidays</h2>
      ${holidayGroups.map(([hol, list]) => `<h3>${escapeHtml(hol)}</h3><ul>
        ${list.map((r) => `<li>${escapeHtml(r.title)}</li>`).join("")}</ul>`).join("")}
    </section>` : "";

  const names = [...new Set(chosen.map((r) => r.submittedBy.trim()))].sort((a, b) => a.localeCompare(b));
  const thanks = names.length ? `
    <section class="page index"><h2>Thank You to Our Contributors</h2>
      <ul>${names.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
      <p class="colophon">Every copy of this book supports the HACDS Parents Association. Thank you for sharing your kitchens with us.</p>
    </section>` : "";

  $("#book").innerHTML = chosen.length
    ? cover + intro + toc + chapters + holidays + thanks
    : cover + `<section class="page"><p class="empty">No recipes to show yet.${s.onlyApproved ? " Approve some recipes on the admin page, or untick “Only include Approved”." : ""}</p></section>`;
}

form.addEventListener("input", build);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = $("#save-settings");
  button.disabled = true;
  try {
    await api("settings", { method: "PUT", passphrase, body: settings() });
    button.textContent = "Saved ✓";
    setTimeout(() => { button.textContent = "Save settings"; }, 2000);
  } catch (err) {
    fail(escapeHtml(err.message));
  } finally {
    button.disabled = false;
  }
});

$("#print-btn").addEventListener("click", () => window.print());

start();
