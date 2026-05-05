import { startControlWorker } from "./start-control-worker.js";

process.emitWarning(
  "`src/temporal/worker/run-worker.ts` is a legacy alias. Use `src/temporal/worker/run-control-worker.ts`.",
  {
    code: "TEMPORAL_LEGACY_WORKER_ENTRYPOINT",
  },
);

startControlWorker().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
