import { runProbe } from "./probe";

runProbe()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((err) => {
    console.error("Probe crashed:", err);
    process.exit(1);
  });
