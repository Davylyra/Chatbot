import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ghanaUniversitiesDatabase,
  getAllUniversities as getFallbackUniversities,
} from "../data/ghanaUniversitiesDatabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default path to the shared per-university JSON directory in the monorepo
const DEFAULT_JSON_DIR = path.resolve(
  __dirname,
  "../../../ai-rag-service/data/universities"
);

function inferCategory(name = "", college = "") {
  const text = `${name} ${college}`.toLowerCase();
  if (/(medicine|mbchb|nursing|midwifery|pharmacy|pharmd|health|dental|medical|public health|optometry|physiotherapy|biomedical)/.test(text)) {
    return "Health Sciences";
  }
  if (/(engineering|computer|software|information technology|math|physics|chemistry|biology|science|mining|geolog|petroleum|energy|telecom|architecture|actuarial|statistics|agriculture)/.test(text)) {
    return "STEM";
  }
  if (/(business|accounting|finance|marketing|management|commerce|banking|economics|procurement|logistics|human resource|entrepreneurship|administration)/.test(text)) {
    return "Business";
  }
  if (/(education|teaching|pedagogy|early childhood)/.test(text)) {
    return "Education";
  }
  return "Social Sciences";
}

function inferCareerFields(name = "", prospects = "") {
  const fields = new Set();
  if (typeof prospects === "string" && prospects.trim()) {
    for (const part of prospects.split(/[,;/]/)) {
      const cleaned = part.trim();
      if (cleaned) fields.add(cleaned);
    }
  }
  if (fields.size === 0 && name) {
    fields.add(name.replace(/^(BSc\.?|BA\.?|B\.?Ed\.?|LLB|MBChB|PharmD|BBA)\s+/i, "").trim());
  }
  return Array.from(fields);
}

function parseCutoff(raw) {
  if (typeof raw === "number") return raw;
  const match = String(raw || "").match(/(\d{1,2})/);
  return match ? parseInt(match[1], 10) : 24;
}

function normalizeJsonUniversity(doc) {
  const name = doc.name;
  const fallbackMatch = Object.values(ghanaUniversitiesDatabase).find(
    (u) => String(u?.name || "").toLowerCase() === String(name || "").toLowerCase()
  );

  const programs = {};
  const addProgram = (progName, progData = {}, collegeName = "") => {
    if (!progName) return;
    const category = inferCategory(progName, collegeName);
    const cutoffVal = parseCutoff(progData.cutoff);
    programs[progName] = {
      name: progName,
      category,
      cutoff: progData.cutoff || `Aggregate ${cutoffVal}`,
      cutoff_numeric: cutoffVal,
      duration: progData.duration || "4 years",
      career_fields: inferCareerFields(progName, progData.career_prospects),
      required_subjects: Array.isArray(progData.subjects)
        ? progData.subjects
        : typeof progData.subjects === "string"
        ? progData.subjects.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        : [],
    };
  };

  if (doc.colleges && typeof doc.colleges === "object") {
    for (const [collegeName, collegeData] of Object.entries(doc.colleges)) {
      const list = Array.isArray(collegeData?.programs) ? collegeData.programs : [];
      for (const prog of list) {
        if (typeof prog === "string") {
          addProgram(prog, {}, collegeName);
        } else if (prog && typeof prog === "object") {
          addProgram(prog.name, prog, collegeName);
        }
      }
    }
  }

  if (doc.programs && typeof doc.programs === "object") {
    if (Array.isArray(doc.programs)) {
      for (const prog of doc.programs) {
        if (typeof prog === "string") addProgram(prog);
        else if (prog && typeof prog === "object") addProgram(prog.name, prog);
      }
    } else {
      for (const [progName, progData] of Object.entries(doc.programs)) {
        addProgram(progName, typeof progData === "object" ? progData : {});
      }
    }
  }

  const locationStr = String(doc.location || fallbackMatch?.location || "Ghana");
  const [city, regionPart] = locationStr.split(",").map((s) => s.trim());
  const region = (regionPart || fallbackMatch?.region || "Ghana").replace(/\s+Region$/i, "");

  const categories = Array.from(new Set(Object.values(programs).map((p) => p.category)));

  return {
    ...(fallbackMatch || {}),
    slug: doc.slug,
    name,
    aliases: doc.aliases || [],
    location: city || locationStr,
    region,
    type: doc.type || fallbackMatch?.type || "Public",
    established: doc.established || fallbackMatch?.established || "",
    website: doc.website || fallbackMatch?.website || "",
    strength_areas: fallbackMatch?.strength_areas || categories,
    specializations: fallbackMatch?.specializations || categories,
    programs: Object.keys(programs).length > 0 ? programs : (fallbackMatch?.programs || {}),
    admission_requirements: doc.admission_requirements || fallbackMatch?.admission_requirements || {},
    source: "shared_json",
  };
}

let cachedUniversities = null;
let cachedDir = null;

/**
 * Load universities from the shared per-university JSON directory
 * (`ai-rag-service/data/universities/` or `process.env.UNIVERSITIES_DATA_DIR`),
 * falling back cleanly to `ghanaUniversitiesDatabase.js` if absent.
 */
export function loadSharedUniversities(customDir = null) {
  const targetDir = customDir || process.env.UNIVERSITIES_DATA_DIR || DEFAULT_JSON_DIR;
  if (!customDir && cachedUniversities && cachedDir === targetDir) {
    return cachedUniversities;
  }

  if (fs.existsSync(targetDir)) {
    try {
      const files = fs
        .readdirSync(targetDir)
        .filter((f) => f.endsWith(".json"))
        .sort();

      const loaded = [];
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(targetDir, file), "utf-8");
          const doc = JSON.parse(raw);
          if (doc?.name) {
            loaded.push(normalizeJsonUniversity(doc));
          }
        } catch (fileErr) {
          console.warn(`[universityDataLoader] Skipping invalid JSON ${file}: ${fileErr.message}`);
        }
      }

      if (loaded.length > 0) {
        if (!customDir) {
          cachedUniversities = loaded;
          cachedDir = targetDir;
        }
        return loaded;
      }
    } catch (dirErr) {
      console.warn(`[universityDataLoader] Falling back to static DB: ${dirErr.message}`);
    }
  }

  return getFallbackUniversities();
}

export function clearUniversityCache() {
  cachedUniversities = null;
  cachedDir = null;
}

