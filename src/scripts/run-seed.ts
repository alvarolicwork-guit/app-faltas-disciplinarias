import { loadEnvConfig } from '@next/env';
import { seedUnidades } from './seed-unidades';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

console.log("Starting seed process...");

seedUnidades().then(() => {
  console.log("Seeding complete.");
  process.exit(0);
}).catch(e => {
  console.error("Error during seeding:", e);
  process.exit(1);
});
