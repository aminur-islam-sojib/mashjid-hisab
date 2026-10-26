import cookieParser from "cookie-parser";
import express, { Application, Request, Response } from "express";
import cors from "cors";

import config from "./config/index.js";
import apiRouter from "./routes/index.js";
import { globalErrorHandler } from "./middlewares/globalErrorHandler.js";
import { notFound } from "./middlewares/notFound.js";

const app: Application = express();

// ---------------------------------------------------------------------------
// BigInt JSON serialization patch — converts minor unit poisha to string
// ---------------------------------------------------------------------------
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(cookieParser());

const allowedOrigins: string[] = [
  config.CLIENT_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

if (config.CLIENT_URL && config.CLIENT_URL.includes(",")) {
  config.CLIENT_URL.split(",").forEach((url) => allowedOrigins.push(url.trim()));
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      try {
        const parsed = new URL(origin);
        if (
          allowedOrigins.includes(origin) ||
          parsed.hostname.endsWith(".vercel.app") ||
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1"
        ) {
          return callback(null, true);
        }
      } catch {
        // Ignore parsing errors
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/", (_req: Request, res: Response) => {
  res.json({ success: true, message: "Mashjid Hisab API is running." });
});

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", apiRouter);

// ---------------------------------------------------------------------------
// Error handling — must be last
// ---------------------------------------------------------------------------
app.use(notFound);
app.use(globalErrorHandler);

export default app;