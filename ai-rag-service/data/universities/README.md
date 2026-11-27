# Ghanaian Universities Knowledge Base (JSON)

One JSON file per university, loaded at startup by `ai-rag-service/retrieval.py`
and shared with `backend/src/utils/universityDataLoader.js` for the Career Assessment.

## File Naming
`<slug>.json` (e.g. `ug.json`, `knust.json`, `ucc.json`, `ashesi.json`).

## Schema
```json
{
  "slug": "ug",
  "name": "University of Ghana",
  "aliases": ["UG", "Legon", "UG Legon"],
  "website": "ug.edu.gh",
  "location": "Legon, Accra",
  "type": "Public",
  "established": 1948,
  "admission_requirements": {
    "wassce": "...",
    "application_deadline": "...",
    "application_fee": "..."
  },
  "colleges": {
    "College Name": {
      "programs": [
        {
          "name": "BSc Computer Science",
          "cutoff": "07-09",
          "duration": "4 years",
          "subjects": "...",
          "career_prospects": "..."
        }
      ]
    }
  },
  "programs": {
    "Program Name": {
      "cutoff": "...",
      "requirements": "..."
    }
  },
  "fees": {},
  "scholarships": {},
  "contact": {}
}
```

- Universities may organize programmes under `colleges` (nested list) or `programs` (map/list); both `retrieval.py` and `universityDataLoader.js` normalize both shapes.
- To update data for a new admission cycle, edit the relevant `<slug>.json` file and re-run `python ai-rag-service/eval/run_eval.py`.

