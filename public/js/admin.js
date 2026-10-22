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
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

function sortedForExport() {
  return [...recipes].sort((a, b) =>
    CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.title.localeCompare(b.title));
}

// Turn "Bubbie's Honey Cake!" into "bubbie-s-honey-cake" so it's safe as a file name.
const slug = (text) =>
  String(text ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 50) || "recipe";

// Give every photo a readable, unique file name, in a folder per category,
// numbered in book order: photos/08-desserts-baked-goods/honey-cake--the-cohen-family.jpg
function photoFileNames(list) {
  const names = new Map();
  const used = new Set();
  for (const r of list) {
    if (!r.photoId) continue;
    const folder = `${String(CATEGORIES.indexOf(r.category) + 1).padStart(2, "0")}-${slug(r.category)}`;
    const base = `photos/${folder}/${slug(r.title)}--${slug(r.submittedBy)}`;
    let name = `${base}.jpg`;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}.jpg`;
    used.add(name);
    names.set(r.id, name);
  }
  return names;
}

const CSV_COLUMNS = [
  ["Category", "category"], ["Recipe", "title"], ["Submitted by", "submittedBy"], ["Email", "email"],
  ["Meat/Dairy/Pareve", "kosher"], ["Holidays", "holidays"], ["Serves", "servings"],
  ["Prep time", "prepTime"], ["Cook time", "cookTime"], ["Ingredients", "ingredients"],
  ["Instructions", "instructions"], ["Story", "story"], ["Tips", "tips"], ["Status", "status"],
  ["Photo file", "photoFile"], ["Admin notes", "adminNotes"], ["Submitted on", "createdAt"], ["ID", "id"],
];

function csvText(list, photoNames) {
  // A leading ' stops Excel from treating text like "=SUM(...)" as a formula.
  const cell = (v) => `"${String(v ?? "").replace(/^[=+@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const rows = list.map((r) => CSV_COLUMNS.map(([, key]) => {
    if (key === "holidays") return cell((r.holidays || []).join(", "));
    if (key === "photoFile") return cell(photoNames.get(r.id) ?? "");
    if (key === "status") return cell(STATUS_LABELS[r.status] || r.status);
    return cell(r[key]);
  }).join(","));
  // The "﻿" at the start tells Excel the file is UTF-8 (keeps accents and Hebrew intact).
  return "﻿" + [CSV_COLUMNS.map(([h]) => cell(h)).join(","), ...rows].join("\r\n");
}

$("#csv-btn").addEventListener("click", () => {
  const list = sortedForExport();
  download(`hacds-cookbook-recipes-${today()}.csv`, csvText(list, photoFileNames(list)), "text/csv;charset=utf-8");
});

// One ZIP with the spreadsheet, a full backup and every photo.
$("#zip-btn").addEventListener("click", async () => {
  const button = $("#zip-btn");
  const label = button.textContent;
  button.disabled = true;
  try {
    const list = sortedForExport();
    const photoNames = photoFileNames(list);
    const encode = (text) => new TextEncoder().encode(text);
    const files = [
      { name: "recipes.csv", data: encode(csvText(list, photoNames)) },
      { name: "recipes-backup.json", data: encode(JSON.stringify({
        exportedAt: new Date().toISOString(),
        recipes: list.map((r) => ({ ...r, photoFile: photoNames.get(r.id) ?? null })),
      }, null, 2)) },
      { name: "READ ME.txt", data: encode([
        "HACDS Community Cookbook export",
        `Made on ${new Date().toLocaleString()}`,
        "",
        "recipes.csv          Every recipe. Opens in Excel, Numbers or Google Sheets.",
        "                     The \"Photo file\" column says which photo belongs to which recipe.",
        "recipes-backup.json  A complete backup of every recipe.",
        "photos/              Every uploaded photo, in a folder per book chapter.",
      ].join("\r\n")) },
    ];
    const missing = [];
    let done = 0;
    const withPhotos = list.filter((r) => photoNames.has(r.id));
    for (const r of withPhotos) {
      button.textContent = `Gathering photos ${++done} of ${withPhotos.length}…`;
      const res = await fetch(`/api/photos/${encodeURIComponent(r.photoId)}`, { headers: { "x-passphrase": passphrase } });
      if (!res.ok) { missing.push(r.title); continue; }
      files.push({ name: photoNames.get(r.id), data: new Uint8Array(await res.arrayBuffer()) });
    }
    download(`hacds-cookbook-export-${today()}.zip`, makeZip(files), "application/zip");
    if (missing.length) alert(`These photos couldn't be downloaded:\n\n${missing.join("\n")}`);
  } catch (err) {
    alert(err.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});

// ---------- A tiny ZIP maker ----------
// Files are stored as-is (photos are already compressed, so squeezing them gains nothing).
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const size = file.data.length;
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // file names are UTF-8
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(local, name, file.data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, date, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, size, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.push(entry, name);
    offset += 30 + name.length + size;
  }
  const directorySize = directory.reduce((n, part) => n + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: "application/zip" });
}
