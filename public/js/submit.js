// The parent-facing page: passphrase → recipe form → thank you.
import {
  $, show, api, storage, recipeFieldsHtml, setupPhotoPicker, readForm, fillForm, recipeHtml,
} from "./common.js";

const PASS_KEY = "cookbook-passphrase";
const DRAFT_KEY = "cookbook-draft";
const CONTACT_KEY = "cookbook-contact";

const gate = $("#gate");
const gateForm = $("#gate-form");
const form = $("#recipe-form");
const thanks = $("#thanks");

$("#fields").innerHTML = recipeFieldsHtml();
const photo = setupPhotoPicker(form);
let passphrase = storage.get("localStorage", PASS_KEY) || "";

// ---------- Passphrase ----------
async function unlock(value, { quiet = false } = {}) {
  try {
    await api("check", { method: "POST", passphrase: value });
    passphrase = value;
    storage.set("localStorage", PASS_KEY, value);
    show(gate, false);
    show(form, true);
    restoreDraft();
  } catch (err) {
    storage.remove("localStorage", PASS_KEY);
    if (!quiet) {
      $("#gate-error").textContent = err.message;
      show($("#gate-error"));
    }
  }
}

gateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = gateForm.elements.passphrase.value;
  if (value.trim()) unlock(value);
});

if (passphrase) unlock(passphrase, { quiet: true });

// ---------- Save a draft as they type, so nothing is lost ----------
function saveDraft() {
  const data = readForm(form);
  if (typeof photo.state.photo === "string") data.photo = photo.state.photo;
  storage.set("localStorage", DRAFT_KEY, JSON.stringify(data));
}

function restoreDraft() {
  const contact = JSON.parse(storage.get("localStorage", CONTACT_KEY) || "{}");
  fillForm(form, contact);
  const draft = JSON.parse(storage.get("localStorage", DRAFT_KEY) || "null");
  if (!draft) return;
  fillForm(form, draft);
  if (draft.photo) {
    photo.showExisting(draft.photo);
    photo.state.photo = draft.photo;
  }
}

let timer;
form.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(saveDraft, 400);
});
photo.state.onChange = saveDraft;

// ---------- Preview ----------
const previewDialog = $("#preview");
$("#preview-btn").addEventListener("click", () => {
  $("#preview-body").innerHTML = recipeHtml(readForm(form), photo.currentSrc());
  previewDialog.showModal();
});
previewDialog.querySelector("[data-close]").addEventListener("click", () => previewDialog.close());

// ---------- Submit ----------
function firstProblem() {
  const fields = [...form.querySelectorAll("[required]")];
  const bad = fields.find((el) => (el.type === "checkbox" ? !el.checked : !el.value.trim()) || !el.checkValidity());
  if (!bad) return null;
  const label = bad.closest("label")?.childNodes[0]?.textContent?.trim()
    || bad.closest("section")?.querySelector("h2")?.textContent.replace(/[*\d]/g, "").trim();
  return { el: bad, message: bad.name === "consent" ? "Please tick the box to say we may print your recipe." : `Please fill in: ${label}` };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = $("#form-error");
  show(errorBox, false);

  const problem = firstProblem();
  if (problem) {
    errorBox.textContent = problem.message;
    show(errorBox);
    problem.el.scrollIntoView({ behavior: "smooth", block: "center" });
    problem.el.focus({ preventScroll: true });
    return;
  }

  const button = $("#submit-btn");
  button.disabled = true;
  button.textContent = "Sending…";
  try {
    const data = readForm(form);
    const result = await api("recipes", {
      method: "POST",
      passphrase,
      body: { ...data, photo: typeof photo.state.photo === "string" ? photo.state.photo : undefined },
    });
    storage.remove("localStorage", DRAFT_KEY);
    storage.set("localStorage", CONTACT_KEY, JSON.stringify({ submittedBy: data.submittedBy, email: data.email }));
    $("#thanks-title").textContent = `“${result.title}”`;
    show(form, false);
    show(thanks, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    if (err.status === 401) {
      storage.remove("localStorage", PASS_KEY);
      show(form, false);
      show(gate, true);
      $("#gate-error").textContent = "The passphrase has changed. Please enter the new one — your recipe is still saved.";
      show($("#gate-error"));
      return;
    }
    errorBox.textContent = err.message;
    show(errorBox);
  } finally {
    button.disabled = false;
    button.textContent = "Submit recipe";
  }
});

// Start over: wipe the recipe and its saved draft, but keep their name and email.
$("#clear-btn").addEventListener("click", () => {
  if (!confirm("Clear this recipe and start over? Your name and email will be kept.")) return;
  const contact = { submittedBy: form.elements.submittedBy.value, email: form.elements.email.value };
  storage.remove("localStorage", DRAFT_KEY);
  form.reset();
  photo.reset();
  fillForm(form, contact);
  show($("#form-error"), false);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#another-btn").addEventListener("click", () => {
  form.reset();
  photo.reset();
  restoreDraft();
  show(thanks, false);
  show(form, true);
  window.scrollTo({ top: 0 });
});
