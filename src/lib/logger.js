import fs from "fs";
import path from "path";

const logDir = path.join(process.cwd(), "logs");
const logFile = path.join(logDir, "app.log");

function ensureLogDir() {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to ensure log directory", error);
  }
}

function serializeMeta(meta) {
  try {
    return JSON.stringify(meta);
  } catch (error) {
    return JSON.stringify({ metaStringifyError: error?.message || "serialize failed" });
  }
}

export async function logError(message, error, meta = {}) {
  try {
    ensureLogDir();
    const timestamp = new Date().toISOString();
    const entryMeta = {
      ...meta,
      errorName: error?.name,
      errorMessage: error?.message,
      stack: error?.stack,
    };
    const line = `${timestamp} [ERROR] ${message} ${serializeMeta(entryMeta)}\n`;
    await fs.promises.appendFile(logFile, line, "utf8");
  } catch (loggingError) {
    console.error("Logger failed", loggingError);
  }
}
