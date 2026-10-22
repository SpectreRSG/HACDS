// The cookbook's back end. Every request from the web pages comes here.
// It checks the passphrase, then saves or reads recipes from Netlify Blobs.
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

type Role = "contributor" | "admin";

const CATEGORIES = [
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
const KOSHER = ["Meat", "Dairy", "Pareve", ""];
const STATUSES = ["new", "approved", "needs-follow-up"];

// Text fields we accept, with a maximum length for each.
const TEXT_FIELDS: Record<string, number> = {
  title: 120,
  category: 60,
  kosher: 10,
  servings: 60,
  prepTime: 60,
  cookTime: 60,
  ingredients: 6000,
  instructions: 10000,
  story: 2000,
  tips: 1500,
  submittedBy: 120,
  email: 160,
  adminNotes: 2000,
};
const HOLIDAYS = [
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
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const recipes = () => getStore({ name: "recipes", consistency: "strong" });
const photos = () => getStore({ name: "photos", consistency: "strong" });
const settings = () => getStore({ name: "settings", consistency: "strong" });

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
const error = (message: string, status = 400) => json({ error: message }, status);

// Compare passphrases without leaking timing information.
// Passphrases are not case-sensitive and ignore extra spaces, so parents on phones
// don't get tripped up by auto-capitalisation.
function matches(given: string, expected: string | undefined) {
  if (!expected) return false;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const a = createHash("sha256").update(norm(given)).digest();
  const b = createHash("sha256").update(norm(expected)).digest();
  return timingSafeEqual(a, b);
}

function roleFor(req: Request): Role | null {
  const given = req.headers.get("x-passphrase") ?? "";
  if (!given) return null;
  if (matches(given, Netlify.env.get("ADMIN_PASSPHRASE"))) return "admin";
  if (matches(given, Netlify.env.get("CONTRIBUTOR_PASSPHRASE"))) return "contributor";
  return null;
}

// Keep only the fields we know about, trimmed and length-limited.
function clean(input: Record<string, unknown>, isAdmin: boolean) {
  const out: Record<string, unknown> = {};
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    if (field === "adminNotes" && !isAdmin) continue;
    if (input[field] === undefined) continue;
    out[field] = String(input[field] ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
  }
  if (Array.isArray(input.holidays)) {
    out.holidays = input.holidays.filter((h) => HOLIDAYS.includes(String(h)));
  }
  if (input.consent !== undefined) out.consent = input.consent === true;
  if (isAdmin && STATUSES.includes(String(input.status))) out.status = input.status;
  return out;
}

function validate(r: Record<string, any>) {
  if (!r.title) return "Please add a recipe name.";
  if (!CATEGORIES.includes(r.category)) return "Please choose a category.";
  if (r.kosher && !KOSHER.includes(r.kosher)) return "Please choose Meat, Dairy or Pareve.";
  if (!r.ingredients) return "Please list the ingredients.";
  if (!r.instructions) return "Please add the instructions.";
  if (!r.submittedBy) return "Please tell us whose name to print with the recipe.";
  if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return "Please enter a valid email.";
  if (!r.consent) return "Please confirm we may print this recipe.";
  return null;
}

// Photos arrive as "data:image/jpeg;base64,...." strings. Store the raw bytes.
async function savePhoto(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("That photo format isn't supported. Please use a JPG or PNG.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new Error("That photo is too large.");
  const id = randomUUID();
  await photos().set(id, new Blob([bytes], { type: match[1] }), { metadata: { type: match[1] } });
  return id;
}

async function listRecipes() {
  const store = recipes();
  const { blobs } = await store.list();
  const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return all.filter(Boolean).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
}

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const [resource, id] = path.split("/");
  const method = req.method;
  const role = roleFor(req);

  if (!Netlify.env.get("CONTRIBUTOR_PASSPHRASE") || !Netlify.env.get("ADMIN_PASSPHRASE")) {
    console.error("CONTRIBUTOR_PASSPHRASE or ADMIN_PASSPHRASE is not set for this deploy.");
    return error("The cookbook's passphrases haven't been set up yet. Please let the cookbook team know.", 503);
  }
  if (!role) return error("That passphrase isn't right. Please check and try again.", 401);

  try {
    // Lets the login screens check a passphrase and learn which pages it opens.
    if (resource === "check" && method === "POST") return json({ role });

    if (resource === "recipes" && !id && method === "POST") {
      const body = await req.json();
      const recipe: Record<string, any> = {
        holidays: [],
        ...clean(body, role === "admin"),
        id: randomUUID(),
        status: "new",
        createdAt: new Date().toISOString(),
      };
      recipe.updatedAt = recipe.createdAt;
      const problem = validate(recipe);
      if (problem) return error(problem);
      if (typeof body.photo === "string" && body.photo) recipe.photoId = await savePhoto(body.photo);
      await recipes().setJSON(recipe.id, recipe);
      return json({ ok: true, id: recipe.id, title: recipe.title }, 201);
    }

    // Everything below is for the admin only.
    if (role !== "admin") return error("Only the cookbook team can do that.", 403);

    if (resource === "recipes" && !id && method === "GET") {
      return json({ recipes: await listRecipes() });
    }

    if (resource === "recipes" && id) {
      const existing: Record<string, any> | null = await recipes().get(id, { type: "json" });
      if (!existing) return error("That recipe no longer exists.", 404);

      if (method === "GET") return json({ recipe: existing });

      if (method === "PUT") {
        const body = await req.json();
        const updated: Record<string, any> = {
          ...existing,
          ...clean(body, true),
          id,
          updatedAt: new Date().toISOString(),
        };
        const problem = validate(updated);
        if (problem) return error(problem);
        // photo: a new data URL replaces it, null removes it, missing keeps it.
        if (body.photo === null || (typeof body.photo === "string" && body.photo)) {
          if (existing.photoId) await photos().delete(existing.photoId);
          delete updated.photoId;
          if (body.photo) updated.photoId = await savePhoto(body.photo);
        }
        await recipes().setJSON(id, updated);
        return json({ recipe: updated });
      }

      if (method === "DELETE") {
        if (existing.photoId) await photos().delete(existing.photoId);
        await recipes().delete(id);
        return json({ ok: true });
      }
    }

    if (resource === "photos" && id && method === "GET") {
      const photo = await photos().getWithMetadata(id, { type: "arrayBuffer" });
      if (!photo) return error("Photo not found.", 404);
      return new Response(photo.data, {
        headers: {
          "content-type": String(photo.metadata.type ?? "image/jpeg"),
          "cache-control": "private, max-age=86400",
        },
      });
    }

    if (resource === "settings") {
      if (method === "GET") {
        return json({ settings: (await settings().get("book", { type: "json" })) ?? {} });
      }
      if (method === "PUT") {
        const body = await req.json();
        const book = {
          title: String(body.title ?? "").slice(0, 120),
          subtitle: String(body.subtitle ?? "").slice(0, 200),
          intro: String(body.intro ?? "").slice(0, 5000),
          pageSize: ["letter", "8x10", "6x9"].includes(body.pageSize) ? body.pageSize : "8x10",
          onlyApproved: body.onlyApproved !== false,
        };
        await settings().setJSON("book", book);
        return json({ settings: book });
      }
    }

    return error("Not found.", 404);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return error(message, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
