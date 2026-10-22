// Shared helpers for every page: the recipe form, talking to the server,
// photo shrinking, and turning a recipe into book-style HTML.

export const CATEGORIES = [
  "Appetizers & Starters",
  "Soups",
  "Salads & Sides",
  "Challah & Breads",
  "Main Dishes: Meat & Poultry",
  "Main Dishes: Fish",
  "Main Dishes: Dairy & Vegetarian",
  "Desserts & Baked Goods",
  "Snacks & Drinks",
];

export const HOLIDAYS = [
  "Shabbat",
  "Rosh Hashanah",
  "Yom Kippur Break-Fast",
  "Sukkot",
  "Hanukkah",
  "Tu BiShvat",
  "Purim",
  "Passover",
  "Shavuot",
];

export const STATUS_LABELS = {
  new: "New",
  approved: "Approved",
  "needs-follow-up": "Needs follow-up",
};

// ---------- Talking to the server ----------

export async function api(path, { method = "GET", body, passphrase } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      "x-passphrase": passphrase ?? "",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong. Please try again.");
    err.status = res.status;
    throw err;
  }
  return data;
}

// Browser storage can be blocked (private mode), so never let it crash the page.
export const storage = {
  get(area, key) {
    try { return window[area].getItem(key); } catch { return null; }
  },
  set(area, key, value) {
    try { window[area].setItem(key, value); } catch {}
  },
  remove(area, key) {
    try { window[area].removeItem(key); } catch {}
  },
};

// ---------- Small utilities ----------

export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function show(el, visible = true) {
  el.hidden = !visible;
}

// Shrink a phone photo (often 5–10 MB) to a sharp-enough print size (~300–700 KB).
export function resizePhoto(file, maxSide = 2000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("We couldn't read that photo. Please try a JPG or PNG."));
    };
    img.src = url;
  });
}

// ---------- The recipe form (same fields on the submit page and the admin page) ----------

const options = (list, placeholder) =>
  `<option value="">${placeholder}</option>` +
  list.map((v) => `<option>${escapeHtml(v)}</option>`).join("");

export function recipeFieldsHtml({ admin = false } = {}) {
  return `
  <section class="card">
    <h2><span class="step">1</span> About the recipe</h2>
    <label>Recipe name <span class="req">*</span>
      <input name="title" required maxlength="120" placeholder="e.g. Bubbie's Honey Cake" />
    </label>
    <label>Category <span class="req">*</span>
      <select name="category" required>${options(CATEGORIES, "Choose a category…")}</select>
    </label>
    <fieldset>
      <legend>Is it meat, dairy or pareve?</legend>
      <div class="chips">
        ${["Meat", "Dairy", "Pareve"].map((k) => `
          <label class="chip"><input type="radio" name="kosher" value="${k}" /> ${k}</label>`).join("")}
        <label class="chip"><input type="radio" name="kosher" value="" checked /> Not sure</label>
      </div>
    </fieldset>
    <fieldset>
      <legend>Great for a holiday? <span class="hint-inline">(optional, pick any)</span></legend>
      <div class="chips">
        ${HOLIDAYS.map((h) => `
          <label class="chip"><input type="checkbox" name="holidays" value="${escapeHtml(h)}" /> ${escapeHtml(h)}</label>`).join("")}
      </div>
    </fieldset>
    <div class="row3">
      <label>Serves
        <input name="servings" maxlength="60" placeholder="e.g. 8" />
      </label>
      <label>Prep time
        <input name="prepTime" maxlength="60" placeholder="e.g. 20 min" />
      </label>
      <label>Cook time
        <input name="cookTime" maxlength="60" placeholder="e.g. 1 hour" />
      </label>
    </div>
  </section>

  <section class="card">
    <h2><span class="step">2</span> Ingredients <span class="req">*</span></h2>
    <p class="hint">Put <strong>one ingredient on each line</strong>. To split into parts, end a line with a colon — like <em>For the glaze:</em></p>
    <textarea name="ingredients" required rows="9" maxlength="6000"
      placeholder="3 cups flour&#10;1 cup honey&#10;3 eggs&#10;&#10;For the glaze:&#10;1 cup powdered sugar"></textarea>
  </section>

  <section class="card">
    <h2><span class="step">3</span> Instructions <span class="req">*</span></h2>
    <p class="hint">Put <strong>one step on each line</strong>. We'll number the steps for you.</p>
    <textarea name="instructions" required rows="9" maxlength="10000"
      placeholder="Preheat the oven to 350°F.&#10;Mix the flour, sugar and spices.&#10;Add the eggs and honey and stir until smooth."></textarea>
  </section>

  <section class="card">
    <h2><span class="step">4</span> The story <span class="hint-inline">(optional)</span></h2>
    <label>The story behind this recipe
      <textarea name="story" rows="4" maxlength="2000"
        placeholder="Who taught you this? When does your family make it?"></textarea>
    </label>
    <label>Tips or variations
      <textarea name="tips" rows="3" maxlength="1500"
        placeholder="e.g. Make it a day ahead — it tastes even better."></textarea>
    </label>
  </section>

  <section class="card">
    <h2><span class="step">5</span> Photo <span class="hint-inline">(optional)</span></h2>
    <p class="hint">A photo of the finished dish. Bright daylight photos print best.</p>
    <div class="photo-box">
      <img class="photo-preview" alt="Recipe photo preview" hidden />
      <div class="photo-buttons">
        <label class="button secondary file-button">
          <input type="file" name="photoFile" accept="image/*" />
          <span class="photo-label">Add a photo</span>
        </label>
        <button type="button" class="button link remove-photo" hidden>Remove photo</button>
      </div>
    </div>
  </section>

  <section class="card">
    <h2><span class="step">6</span> About you</h2>
    <label>Name to print with the recipe <span class="req">*</span>
      <input name="submittedBy" required maxlength="120" placeholder="e.g. The Cohen Family" autocomplete="name" />
    </label>
    <label>Your email <span class="req">*</span>
      <input name="email" type="email" required maxlength="160" placeholder="you@example.com" autocomplete="email" />
      <span class="hint">Only used if we have a question. It won't be printed.</span>
    </label>
    <label class="check">
      <input type="checkbox" name="consent" required />
      <span>I'm happy for this recipe (and photo) to be printed in the HACDS Parents Association cookbook.</span>
    </label>
  </section>

  ${admin ? `
  <section class="card admin-only">
    <h2>Cookbook team</h2>
    <label>Status
      <select name="status">
        ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
      </select>
    </label>
    <label>Private notes <span class="hint-inline">(never printed)</span>
      <textarea name="adminNotes" rows="3" maxlength="2000" placeholder="e.g. Emailed about oven temperature"></textarea>
    </label>
  </section>` : ""}
  `;
}

// Wire up the photo picker inside a form. Returns helpers to read/set the photo.
export function setupPhotoPicker(form) {
  const input = form.elements.photoFile;
  const preview = $(".photo-preview", form);
  const removeBtn = $(".remove-photo", form);
  const label = $(".photo-label", form);
  // photo: undefined = unchanged, null = removed, string = new data URL
  const state = { photo: undefined, onChange: () => {} };

  const render = (src) => {
    preview.src = src || "";
    show(preview, Boolean(src));
    show(removeBtn, Boolean(src));
    label.textContent = src ? "Change photo" : "Add a photo";
  };

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    label.textContent = "Preparing photo…";
    try {
      state.photo = await resizePhoto(file);
      render(state.photo);
      state.onChange();
    } catch (err) {
      alert(err.message);
      render(preview.src);
    }
    input.value = "";
  });

  removeBtn.addEventListener("click", () => {
    state.photo = null;
    render("");
    state.onChange();
  });

  return {
    state,
    showExisting(src) { state.photo = undefined; render(src); },
    reset() { state.photo = undefined; render(""); },
    currentSrc() { return preview.hidden ? "" : preview.src; },
  };
}

// Read every field from the form into a plain object.
export function readForm(form) {
  const f = form.elements;
  const data = {
    title: f.title.value,
    category: f.category.value,
    kosher: form.querySelector('input[name="kosher"]:checked')?.value ?? "",
    holidays: [...form.querySelectorAll('input[name="holidays"]:checked')].map((i) => i.value),
    servings: f.servings.value,
    prepTime: f.prepTime.value,
    cookTime: f.cookTime.value,
    ingredients: f.ingredients.value,
    instructions: f.instructions.value,
    story: f.story.value,
    tips: f.tips.value,
    submittedBy: f.submittedBy.value,
    email: f.email.value,
    consent: f.consent.checked,
  };
  if (f.status) data.status = f.status.value;
  if (f.adminNotes) data.adminNotes = f.adminNotes.value;
  return data;
}

// Put a recipe's values into the form.
export function fillForm(form, r) {
  const f = form.elements;
  for (const name of ["title", "category", "servings", "prepTime", "cookTime", "ingredients",
    "instructions", "story", "tips", "submittedBy", "email", "status", "adminNotes"]) {
    if (f[name] && r[name] !== undefined) f[name].value = r[name];
  }
  form.querySelectorAll('input[name="kosher"]').forEach((i) => { i.checked = i.value === (r.kosher ?? ""); });
  form.querySelectorAll('input[name="holidays"]').forEach((i) => {
    i.checked = (r.holidays ?? []).includes(i.value);
  });
  if (r.consent !== undefined) f.consent.checked = Boolean(r.consent);
}

// ---------- Turning a recipe into book-page HTML ----------

const lines = (text) => String(text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
// People often type "1." or "Step 2:" themselves; we number steps, so drop theirs.
const stripNumber = (line) => line.replace(/^(step\s*)?\d+[.):-]?\s+/i, "");

export function ingredientsHtml(text) {
  let html = "";
  let open = false;
  for (const line of lines(text)) {
    if (line.endsWith(":") && line.length < 60) {
      if (open) html += "</ul>";
      html += `<h4 class="sub">${escapeHtml(line.slice(0, -1))}</h4>`;
      open = false;
    } else {
      if (!open) html += "<ul>";
      open = true;
      html += `<li>${escapeHtml(line.replace(/^[-•*]\s*/, ""))}</li>`;
    }
  }
  return open ? html + "</ul>" : html;
}

export function instructionsHtml(text) {
  let html = "";
  let open = false;
  for (const line of lines(text)) {
    if (line.endsWith(":") && line.length < 60) {
      if (open) html += "</ol>";
      html += `<h4 class="sub">${escapeHtml(line.slice(0, -1))}</h4>`;
      open = false;
    } else {
      if (!open) html += "<ol>";
      open = true;
      html += `<li>${escapeHtml(stripNumber(line))}</li>`;
    }
  }
  return open ? html + "</ol>" : html;
}

export function recipeHtml(r, photoSrc = "") {
  const facts = [
    r.servings && `Serves ${escapeHtml(r.servings)}`,
    r.prepTime && `Prep ${escapeHtml(r.prepTime)}`,
    r.cookTime && `Cook ${escapeHtml(r.cookTime)}`,
  ].filter(Boolean);
  const tags = [r.kosher, ...(r.holidays ?? [])].filter(Boolean);
  return `
  <article class="recipe">
    <header>
      <h3 class="recipe-title">${escapeHtml(r.title || "Untitled recipe")}</h3>
      <p class="byline">From ${escapeHtml(r.submittedBy || "—")}</p>
      ${tags.length ? `<p class="tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</p>` : ""}
      ${facts.length ? `<p class="facts">${facts.join(" &nbsp;·&nbsp; ")}</p>` : ""}
    </header>
    ${r.story ? `<p class="story">${escapeHtml(r.story).replace(/\n+/g, "<br />")}</p>` : ""}
    ${photoSrc ? `<figure class="recipe-photo"><img src="${escapeHtml(photoSrc)}" alt="" /></figure>` : ""}
    <div class="recipe-body">
      <section class="ingredients"><h4>Ingredients</h4>${ingredientsHtml(r.ingredients)}</section>
      <section class="instructions"><h4>Instructions</h4>${instructionsHtml(r.instructions)}</section>
    </div>
    ${r.tips ? `<aside class="tips"><strong>Tip:</strong> ${escapeHtml(r.tips).replace(/\n+/g, "<br />")}</aside>` : ""}
  </article>`;
}

// Fetch a protected photo and return a temporary local URL for an <img>.
export async function photoUrl(photoId, passphrase) {
  const res = await fetch(`/api/photos/${encodeURIComponent(photoId)}`, {
    headers: { "x-passphrase": passphrase },
  });
  if (!res.ok) return "";
  return URL.createObjectURL(await res.blob());
}
