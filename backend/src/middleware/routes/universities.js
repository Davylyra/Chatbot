import express from "express";
import { getCollection } from "../../config/db.js";
import { ObjectId } from "mongodb";

const router = express.Router();

/**
 * UNIVERSITIES LISTING - powers the "Buy Admission Forms" page.
 *
 * This is a NEW file, filling in what api.ts already expects at
 * GET /universities, GET /universities/:id, and GET /universities/search.
 * It intentionally does NOT decide on its own whether a university is
 * purchasable - that's driven entirely by the is_available field on each
 * document, which should only be true once real form_inventory stock
 * actually exists for that university. See seed-universities.js for the
 * initial data (Test University available, the real 11 not yet).
 *
 * Field naming: documents are stored with a snake_case university_name as
 * the canonical identifier, because that's what form_inventory.university_name
 * and payment metadata.universityName already key off (see forms.js,
 * paystackController.js). The response below exposes it as BOTH
 * `universityName` and `name`, since the frontend's University type only
 * declares `name` but formsApi.ts actually reads `universityName` at
 * runtime - this avoids relying on either being "the" correct one.
 */

function formatUniversity(doc) {
  return {
    id: doc._id.toString(),
    name: doc.university_name,
    universityName: doc.university_name,
    fullName: doc.full_name || doc.university_name,
    location: doc.location || "",
    region: doc.region || "",
    established: doc.established || null,
    type: doc.type || "public",
    logo: doc.logo || null,
    description: doc.description || "",
    formPrice: doc.form_price ?? null,
    buyPrice: doc.form_price ?? null,
    currency: doc.currency || "GHS",
    deadline: doc.deadline || null,
    isAvailable: doc.is_available === true,
    programs: doc.programs || [],
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

/* GET all universities */
router.get("/", async (req, res) => {
  try {
    const universitiesCollection = await getCollection("universities");
    const universities = await universitiesCollection
      .find({})
      .sort({ university_name: 1 })
      .toArray();

    res.status(200).json({
      success: true,
      data: universities.map(formatUniversity),
    });
  } catch (err) {
    console.error("Error fetching universities:", err.message);
    res.status(500).json({ success: false, message: "Error fetching universities" });
  }
});

/* GET /search?q=... - simple case-insensitive name search.
   IMPORTANT: this must stay defined BEFORE the /:id route below - Express
   matches in definition order, so if /:id came first, a request to
   /universities/search would be caught by /:id with "search" treated as
   the id value, and this route would never be reached. */
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();

  if (!q) {
    return res.status(400).json({ success: false, message: "Query parameter 'q' is required" });
  }

  try {
    const universitiesCollection = await getCollection("universities");
    const safeQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex special chars
    const universities = await universitiesCollection
      .find({ university_name: { $regex: safeQuery, $options: "i" } })
      .toArray();

    res.status(200).json({ success: true, data: universities.map(formatUniversity) });
  } catch (err) {
    console.error("Error searching universities:", err.message);
    res.status(500).json({ success: false, message: "Error searching universities" });
  }
});

/* GET a single university by id */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid university id" });
  }

  try {
    const universitiesCollection = await getCollection("universities");
    const university = await universitiesCollection.findOne({ _id: new ObjectId(id) });

    if (!university) {
      return res.status(404).json({ success: false, message: "University not found" });
    }

    res.status(200).json({ success: true, data: formatUniversity(university) });
  } catch (err) {
    console.error("Error fetching university:", err.message);
    res.status(500).json({ success: false, message: "Error fetching university" });
  }
});

export default router;
