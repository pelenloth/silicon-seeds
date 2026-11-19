import { DB } from "./db";
import { Migrator, FileMigrationProvider } from "kysely";
import * as fs from "fs";
import * as path from "path";

const migrationFolder = path.join(import.meta.dir, "../../migrations");

export const migrator = new Migrator({
  db: DB.db,
  provider: new FileMigrationProvider({
    fs: {
      async readdir(p) {
        return await fs.promises.readdir(p);
      },
    },
    path: {
      join(...paths) {
        return paths.join("/");
      },
    },
    migrationFolder,
  }),
});

if (import.meta.main) {
  const { error, results } = await migrator.migrateToLatest();

  if (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`✓ Migration "${it.migrationName}" executed`);
    }
  });
}
