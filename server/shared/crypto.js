import { createHash } from "node:crypto";

export const hashPin = (pin) => createHash("sha256").update(String(pin)).digest("hex");
