import { WycinkaDB } from './schema';

export const CURRENT_VERSION = 3;

interface MigrationStep {
  version: number;
  up: (db: WycinkaDB) => Promise<void>;
}

const migrationSteps: readonly MigrationStep[] = [];

export async function runMigrations(db: WycinkaDB = new WycinkaDB()): Promise<void> {
  for (const step of migrationSteps) {
    if (step.version > CURRENT_VERSION) {
      await step.up(db);
    }
  }
}
