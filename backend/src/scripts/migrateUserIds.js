/**
 * Safe, dry-run-by-default migration script to normalize ObjectId `user_id`
 * values to canonical hex strings across MongoDB collections.
 *
 * Usage:
 *   node src/scripts/migrateUserIds.js           # Dry run (default, reads only)
 *   node src/scripts/migrateUserIds.js --dry-run # Explicit dry run
 *   node src/scripts/migrateUserIds.js --apply   # Apply updates (backup DB first!)
 */

import dotenv from "dotenv";
import { ObjectId } from "mongodb";

dotenv.config();

export const TARGET_COLLECTIONS = [
  "conversations",
  "messages",
  "user_assessments",
  "user_profiles",
  "notifications",
  "payments",
  "form_purchases",
];

export function parseCliArgs(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const dryRun = !apply || argv.includes("--dry-run");
  return { apply: apply && !argv.includes("--dry-run"), dryRun };
}

export async function runMigration({ apply = false } = {}) {
  const { connectDB, getCollection } = await import("../config/db.js");
  await connectDB();

  const summary = [];
  console.log(
    apply
      ? "[migrateUserIds] APPLY MODE: converting ObjectId user_id values to strings..."
      : "[migrateUserIds] DRY-RUN MODE (no writes). Pass --apply to execute."
  );

  for (const name of TARGET_COLLECTIONS) {
    const col = await getCollection(name);
    const filter = { user_id: { $type: "objectId" } };
    const count = await col.countDocuments(filter);

    let modified = 0;
    if (apply && count > 0) {
      const cursor = col.find(filter, { projection: { _id: 1, user_id: 1 } });
      const ops = [];
      for await (const doc of cursor) {
        if (doc.user_id instanceof ObjectId || typeof doc.user_id?.toHexString === "function") {
          ops.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: { user_id: doc.user_id.toHexString() } },
            },
          });
        }
        if (ops.length >= 500) {
          const res = await col.bulkWrite(ops, { ordered: false });
          modified += res.modifiedCount;
          ops.length = 0;
        }
      }
      if (ops.length > 0) {
        const res = await col.bulkWrite(ops, { ordered: false });
        modified += res.modifiedCount;
      }
    }

    summary.push({ collection: name, objectIdCount: count, modified });
    console.log(
      `  - ${name.padEnd(18)} ObjectId user_ids: ${count}` +
        (apply ? ` (converted: ${modified})` : " (dry-run)")
    );
  }

  return summary;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  const { apply } = parseCliArgs();
  runMigration({ apply })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[migrateUserIds] Failed:", err);
      process.exit(1);
    });
}

