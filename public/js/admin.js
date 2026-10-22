// The cookbook team's page: see every recipe, edit, approve, delete and export.
import {
  $, show, api, storage, escapeHtml, recipeFieldsHtml, setupPhotoPicker, readForm, fillForm,
  recipeHtml, photoUrl, CATEGORIES, STATUS_LABELS,
} from "./common.js";

const ADMIN_KEY = "cookbook-admin-passphrase";

let passphrase = storage.get("sessionStorage", ADMIN_KEY) || "";
let recipes = [];
let current = null; // the recipe open in the editor
const thumbs = new Map(); // photoId -> local image URL

// ---------- Sign in ----------
async function signIn(value, { quiet = false } = {}) {
  try {
    const { role } = await api("check", { method: "POST", passphrase: value });
    if (role !== "admin") throw new Error("That passphrase is for contributors. Please use the admin passphrase.");
    passphrase = value;
    storage.set("sessionStorage", ADMIN_KEY, value);
    show($("#gate"), false);
    show($("#dashboard"), true);
    await load();
  } catch (err) {
    storage.remove("sessionStorage", ADMIN_KEY);
    if (!quiet) {
      $("#gate-error").textContent = err.message;
      show($("#gate-error"));
    }
  }
}

$("#gate-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = e.target.elements.passphrase.value;
  if (value.trim()) signIn(value);
});
$("#logout-btn").addEventListener("click", () => {
  storage.remove("sessionStorage", ADMIN_KEY);
  location.reload();
});
if (passphrase) signIn(passphrase, { quiet: true });

// ---------- Load and show the list ----------
async function load() {
  $("#list").innerHTML = `<p class="empty">Loading recipes…</p>`;
  try {
    ({ recipes } = await api("recipes", { passphrase }));
    render();
    loadThumbs();
  } catch (err) {
    $("#list").innerHTML = `<p class="notice error">${escapeHtml(err.message)}</p>`;
  }
}

const filterCategory = $("#filter-category");
const filterStatus = $("#filter-status");
filterCategory.innerHTML = `<option value="">All categories</option>` +
  CATEGORIES.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
filterStatus.innerHTML = `<option value="">All statuses</option>` +
  Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
for (const el of [$("#search"), filterCategory, filterStatus]) el.addEventListener("input", render);

function matchesFilters(r) {
  const q = $("#search").value.trim().toLowerCase();
  if (filterCategory.value && r.category !== filterCategory.value) return false;
  if (filterStatus.value && r.status !== filterStatus.value) return false;
  if (!q) return true;
  return [r.title, r.submittedBy, r.email, r.ingredients, r.story, (r.holidays || []).join(" ")]
    .join(" ").toLowerCase().includes(q);
}

function render() {
  const count = (s) => recipes.filter((r) => r.status === s).length;
  $("#stats").innerHTML = [
    [recipes.length, "Total recipes"],
    [count("new"), "New"],
    [count("approved"), "Approved"],
    [count("needs-follow-up"), "Needs follow-up"],
    [recipes.filter((r) => r.photoId).length, "With photos"],
  ].map(([n, label]) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`).join("");

  const shown = recipes.filter(matchesFilters);
  if (!shown.length) {
    $("#list").innerHTML = `<p class="empty">${recipes.length ? "No recipes match your search." : "No recipes yet. Share the submission link with families!"}</p>`;
    return;
  }

  $("#list").innerHTML = CATEGORIES.map((cat) => {
    const inCat = shown.filter((r) => r.category === cat)
      .sort((a, b) => a.title.localeCompare(b.title));
    if (!inCat.length) return "";
    return `<h3 class="group-title">${escapeHtml(cat)} <small>(${inCat.length})</small></h3>
      <ul class="recipe-list">${inCat.map(rowHtml).join("")}</ul>`;
  }).join("");
}

function rowHtml(r) {
  const date = new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const thumb = r.photoId && thumbs.get(r.photoId);
  return `<li><button class="recipe-row" type="button" data-id="${r.id}">
    <span class="thumb" data-photo="${r.photoId || ""}" style="${thumb ? `background-image:url('${thumb}')` : ""}">${r.photoId ? "" : "🍽️"}</span>
    <span class="info">
      <span class="name">${escapeHtml(r.title)}</span>
      <span class="meta">${escapeHtml(r.submittedBy)}${r.kosher ? ` · ${r.kosher}` : ""} · ${date}</span>
    </span>
    <span class="pill ${r.status}">${STATUS_LABELS[r.status] || r.status}</span>
  </button></li>`;
}

// Photos are private, so fetch them with the passphrase and show them once ready.
async function loadThumbs() {
  for (const r of recipes) {
    if (!r.photoId || thumbs.has(r.photoId)) continue;
    const url = await photoUrl(r.photoId, passphrase);
    thumbs.set(r.photoId, url);
    document.querySelectorAll(`[data-photo="${r.photoId}"]`).forEach((el) => {
      el.style.backgroundImage = `url('${url}')`;
    });
  }
}

$("#list").addEventListener("click", (e) => {
  const row = e.target.closest(".recipe-row");
  if (row) openEditor(recipes.find((r) => r.id === row.dataset.id));
});

// ---------- Editor ----------
const editor = $("#editor");
const editForm = $("#edit-form");
$("#edit-fields").innerHTML = recipeFieldsHtml({ admin: true });
const photo = setupPhotoPicker(editForm);

async function openEditor(recipe) {
  current = recipe;
  editForm.reset();
  fillForm(editForm, recipe);
  photo.showExisting("");
  if (recipe.photoId) {
    if (!thumbs.has(recipe.photoId)) thumbs.set(recipe.photoId, await photoUrl(recipe.photoId, passphrase));
    photo.showExisting(thumbs.get(recipe.photoId));
  }
  $("#editor-title").textContent = recipe.title;
  const fmt = (d) => new Date(d).toLocaleString();
  $("#edit-meta").textContent = `Submitted ${fmt(recipe.createdAt)}` +
    (recipe.updatedAt !== recipe.createdAt ? ` · Last edited ${fmt(recipe.updatedAt)}` : "");
  show($("#edit-error"), false);
  selectTab("edit");
  editor.showModal();
  editor.querySelector(".dialog-body").scrollTop = 0;
}

editor.querySelector("[data-close]").addEventListener("click", () => editor.close());

function selectTab(name) {
  editor.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  show(editForm, name === "edit");
  show($("#edit-preview"), name === "preview");
  if (name === "preview") $("#edit-preview").innerHTML = recipeHtml(readForm(editForm), photo.currentSrc());
}
editor.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = $("#save-btn");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const body = readForm(editForm);
    if (photo.state.photo !== undefined) body.photo = photo.state.photo;
    const { recipe } = await api(`recipes/${current.id}`, { method: "PUT", passphrase, body });
    if (recipe.photoId && typeof body.photo === "string") thumbs.set(recipe.photoId, body.photo);
    recipes = recipes.map((r) => (r.id === recipe.id ? recipe : r));
    render();
    editor.close();
  } catch (err) {
    $("#edit-error").textContent = err.message;
    show($("#edit-error"));
  } finally {
    button.disabled = false;
    button.textContent = "Save changes";
  }
});

$("#delete-btn").addEventListener("click", async () => {
  if (!confirm(`Delete “${current.title}” permanently? This can't be undone.`)) return;
  try {
    await api(`recipes/${current.id}`, { method: "DELETE", passphrase });
    recipes = recipes.filter((r) => r.id !== current.id);
    render();
    editor.close();
  } catch (err) {
    $("#edit-error").textContent = err.message;
    show($("#edit-error"));
  }
});

// ---------- Exports ----------
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

const CSV_COLUMNS = [
  ["Category", "category"], ["Recipe", "title"], ["Submitted by", "submittedBy"], ["Email", "email"],
  ["Meat/Dairy/Pareve", "kosher"], ["Holidays", "holidays"], ["Serves", "servings"],
  ["Prep time", "prepTime"], ["Cook time", "cookTime"], ["Ingredients", "ingredients"],
  ["Instructions", "instructions"], ["Story", "story"], ["Tips", "tips"], ["Status", "status"],
  ["Has photo", "photoId"], ["Admin notes", "adminNotes"], ["Submitted on", "createdAt"], ["ID", "id"],
];

function sortedForExport() {
  return [...recipes].sort((a, b) =>
    CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.title.localeCompare(b.title));
}

$("#csv-btn").addEventListener("click", () => {
  // A leading ' stops Excel from treating text like "=SUM(...)" as a formula.
  const cell = (v) => `"${String(v ?? "").replace(/^[=+@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const rows = sortedForExport().map((r) => CSV_COLUMNS.map(([, key]) => {
    if (key === "holidays") return cell((r.holidays || []).join(", "));
    if (key === "photoId") return cell(r.photoId ? "Yes" : "No");
    if (key === "status") return cell(STATUS_LABELS[r.status] || r.status);
    return cell(r[key]);
  }).join(","));
  const csv = [CSV_COLUMNS.map(([h]) => cell(h)).join(","), ...rows].join("\r\n");
  // The "﻿" at the start tells Excel the file is UTF-8 (keeps accents and Hebrew intact).
  download(`hacds-cookbook-recipes-${today()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
});

$("#json-btn").addEventListener("click", () => {
  download(`hacds-cookbook-backup-${today()}.json`,
    JSON.stringify({ exportedAt: new Date().toISOString(), recipes: sortedForExport() }, null, 2),
    "application/json");
});
