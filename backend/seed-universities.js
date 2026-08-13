// Run with: mongosh "<your MONGODB_URI>" seed-universities.js
//
// Seeds the new `universities` collection that universities.js reads from.
//
// - "Test University (Sandbox)" is marked is_available: true and matches
//   the form_price used in seed-test-forms.js, since it's backed by real
//   (test) form_inventory stock - buying it should work end-to-end through
//   the actual Forms page UI, not just via direct API calls.
// - The real 11 universities are inserted as placeholders with
//   is_available: false and form_price/deadline left null, because there's
//   no real form_inventory stock for any of them yet. They'll show as
//   unavailable on the Forms page rather than silently offering something
//   that can't be fulfilled. Once real admission data and real PINs are
//   ready, update these documents (price, deadline, is_available) rather
//   than re-creating them - the university_name values below are the exact
//   strings form_inventory entries need to match.
//
// Safe to re-run - upserts by university_name, won't create duplicates.

const universities = [
  {
    university_name: "Test University (Sandbox)",
    full_name: "Test University (Sandbox)",
    location: "Accra",
    region: "Greater Accra",
    established: 2026,
    type: "public",
    description: "Sandbox entry for testing the purchase flow end-to-end. Not a real university.",
    form_price: 1,
    currency: "GHS",
    deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    is_available: true, // has real (test) form_inventory stock behind it
  },
  {
    university_name: "Kwame Nkrumah University of Science and Technology",
    full_name: "Kwame Nkrumah University of Science and Technology",
    location: "Kumasi",
    region: "Ashanti",
    established: 1952,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false, // no form_inventory stock yet
  },
  {
    university_name: "University of Ghana",
    full_name: "University of Ghana",
    location: "Legon, Accra",
    region: "Greater Accra",
    established: 1948,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
  {
    university_name: "University of Cape Coast",
    full_name: "University of Cape Coast",
    location: "Cape Coast",
    region: "Central",
    established: 1962,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
  {
    university_name: "University for Development Studies",
    full_name: "University for Development Studies",
    location: "Tamale",
    region: "Northern",
    established: 1992,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
  {
    university_name: "University of Energy and Natural Resources",
    full_name: "University of Energy and Natural Resources",
    location: "Sunyani",
    region: "Bono",
    established: 2011,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
  {
    university_name: "University of Education, Winneba",
    full_name: "University of Education, Winneba",
    location: "Winneba",
    region: "Central",
    established: 1992,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
  {
    university_name: "University of Mines and Technology",
    full_name: "University of Mines and Technology",
    location: "Tarkwa",
    region: "Western",
    established: 2004,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
  {
    university_name: "University of Health and Allied Sciences",
    full_name: "University of Health and Allied Sciences",
    location: "Ho",
    region: "Volta",
    established: 2011,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
  {
    university_name: "Ghana Communication Technology University",
    full_name: "Ghana Communication Technology University",
    location: "Accra",
    region: "Greater Accra",
    established: 2005,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
  {
    university_name: "Takoradi Technical University",
    full_name: "Takoradi Technical University",
    location: "Takoradi",
    region: "Western",
    established: 1954,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
  {
    university_name: "University of Professional Studies, Accra",
    full_name: "University of Professional Studies, Accra",
    location: "Accra",
    region: "Greater Accra",
    established: 1965,
    type: "public",
    description: "",
    form_price: null,
    currency: "GHS",
    deadline: null,
    is_available: false,
  },
];

let inserted = 0;
let updated = 0;

universities.forEach((uni) => {
  const now = new Date();
  const result = db.universities.updateOne(
    { university_name: uni.university_name },
    {
      $set: { ...uni, updated_at: now },
      $setOnInsert: { created_at: now },
    },
    { upsert: true }
  );
  if (result.upsertedId) {
    inserted++;
  } else if (result.modifiedCount > 0) {
    updated++;
  }
});

print(`Universities collection seeded: ${inserted} inserted, ${updated} updated, ${universities.length} total.`);
print("Only 'Test University (Sandbox)' is is_available: true - everything else is a placeholder until real inventory exists.");
