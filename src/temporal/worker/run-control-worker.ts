import { startControlWorker } from "./start-control-worker.js";

startControlWorker().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
