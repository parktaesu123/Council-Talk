import { createConfig } from "./server/bootstrap/config.js";
import { createServerRuntime } from "./server/bootstrap/createServerRuntime.js";
import { createHttpApp } from "./server/interfaces/http/createHttpApp.js";

const config = createConfig();
const runtime = await createServerRuntime({ config });
const app = createHttpApp({ runtime });

app.listen(config.port, "0.0.0.0", () => {
  runtime.logger.info(`Council Talk listening on ${config.port}`);
});
