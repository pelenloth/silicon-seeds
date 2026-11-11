import { Hono } from "hono";
import { Utils } from "../utils/utils";
import { Metadata } from "../meta/meta";
import { not_found } from "./not_found";
import { Logger } from "../logger/logger";
import apiRoutes from "./api/index";
import jobsRoutes from "./jobs/jobs";
import { parseRange } from "./range";

const app = new Hono();

export namespace ApiServer {
  let server: Bun.Server<undefined>;
  const MAX_REQUEST_BODY_SIZE = 1024 * 1024 * 1024;

  export function start() {
    const hostname = Bun.env.HOST || "127.0.0.1";
    const parsedPort = parseInt(Bun.env.PORT || "3000", 10);
    const port =
      Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
        ? parsedPort
        : 3000;
    server = Bun.serve({
      hostname,
      port,
      idleTimeout: Metadata.TIMEOUT,
      maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
      fetch: app.fetch,
    });
    Logger.info(`Listening on ${hostname}:${port}`);
  }
  export function stop() {
    server.stop();
  }
}

function isCompressibleContentType(ct: string): boolean {
  return (
    ct.startsWith("text/") ||
    ct === "application/json" ||
    ct === "application/javascript" ||
    ct === "text/css" ||
    ct === "image/svg+xml"
  );
}

// Serve static files with caching, ETag, and compression
app.use("/static/*", async (c) => {
  const filePath = `.${c.req.path}`;
  const file = Bun.file(filePath);
  if (await file.exists()) {
    const contentType = filePath.endsWith(".css")
      ? "text/css; charset=utf-8"
      : filePath.endsWith(".js")
        ? "application/javascript; charset=utf-8"
        : Utils.getContentType(filePath);
    const stats = await file.stat();
    const etag = `"${stats.size}-${stats.mtime.getTime()}"`;
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, max-age=3600, must-revalidate",
          Vary: "Accept-Encoding",
        },
      });
    }
    const acceptEnc = c.req.header("Accept-Encoding") || "";
    const shouldCompress =
      acceptEnc.includes("gzip") &&
      isCompressibleContentType(contentType) &&
      stats.size > 1024;
    if (shouldCompress) {
      const buf = await file.arrayBuffer();
      const compressed = Bun.gzipSync(Buffer.from(buf));
      return new Response(compressed as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": compressed.length.toString(),
          "Cache-Control": "public, max-age=3600, must-revalidate",
          ETag: etag,
          Vary: "Accept-Encoding",
          "Content-Encoding": "gzip",
          "Accept-Ranges": "bytes",
        },
      });
    }
    return new Response(file as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, must-revalidate",
        ETag: etag,
        Vary: "Accept-Encoding",
        "Accept-Ranges": "bytes",
      },
    });
  }
  Logger.warn(`${filePath} is not found, you access ${c.req.path}`);
  return c.text("Not found", 404);
});

// Serve Vite client assets first (dist/client/assets/*) before falling back to OUTPUT_DIR
app.use("/assets/*", async (c, next) => {
  const vitePath = `dist/client${c.req.path}`;
  const viteFile = Bun.file(vitePath);
  if (await viteFile.exists()) {
    const contentType = vitePath.endsWith(".js")
      ? "application/javascript; charset=utf-8"
      : vitePath.endsWith(".css")
        ? "text/css; charset=utf-8"
        : Utils.getContentType(vitePath);
    const stats = await viteFile.stat();
    const etag = `"${stats.size}-${stats.mtime.getTime()}"`;
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    return new Response(viteFile as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
        "Accept-Ranges": "bytes",
      },
    });
  }
  await next();
});

// Serve media files under /assets/* from OUTPUT_DIR
app.use("/assets/*", async (c) => {
  const pathAfterAssets = c.req.path.replace("/assets", "");
  const filePath = `${Bun.env.OUTPUT_DIR}${pathAfterAssets}`;
  const file = Bun.file(filePath);

  if (await file.exists()) {
    const contentType = Utils.getContentType(filePath);
    const stats = await file.stat();
    const etag = `"${stats.size}-${stats.mtime.getTime()}"`;
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    const parsed = parseRange(c.req.header("Range"), stats.size);
    if (parsed === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${stats.size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
    if (parsed) {
      const { start, end } = parsed;
      return new Response(file.slice(start, end + 1) as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${stats.size}`,
          "Cache-Control": "public, max-age=31536000, immutable",
          ETag: etag,
          "Accept-Ranges": "bytes",
        },
      });
    }
    const acceptEnc = c.req.header("Accept-Encoding") || "";
    if (acceptEnc.includes("gzip") && isCompressibleContentType(contentType)) {
      const buf = await file.arrayBuffer();
      if (buf.byteLength > 1024) {
        const compressed = Bun.gzipSync(Buffer.from(buf));
        return new Response(compressed as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Length": compressed.length.toString(),
            "Cache-Control": "public, max-age=31536000, immutable",
            ETag: etag,
            "Accept-Ranges": "bytes",
            Vary: "Accept-Encoding",
            "Content-Encoding": "gzip",
          },
        });
      }
    }
    return new Response(file as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
        "Accept-Ranges": "bytes",
        Vary: "Accept-Encoding",
      },
    });
  }

  Logger.warn(`${filePath} is not found, you access ${c.req.path}`);
  return c.text("Not found", 404);
});

app.onError((error, c) => {
  Logger.error("[API] error", error);
  return c.json(
    {
      error: error.message,
      message: error.message,
      name: error.name,
    },
    500,
  );
});

// JSON APIs + SSE (jobs stream)
app.route("/api", apiRoutes);
app.route("/jobs", jobsRoutes);

// SPA fallback: serve built SolidJS index.html for non-API routes
app.use("/*", async (c, next) => {
  const accept = c.req.header("Accept") || "";
  const path = c.req.path;
  const isApi =
    path.startsWith("/api/") ||
    path.startsWith("/assets/") ||
    path.startsWith("/static/");
  // Allow SSE path to pass through
  if (path.startsWith("/jobs/stream")) return next();
  if (!isApi) {
    const viteIndex = Bun.file("dist/client/index.html");
    if (
      (await viteIndex.exists()) &&
      (accept.includes("text/html") || path === "/" || !path.includes("."))
    ) {
      const html = await viteIndex.text();
      return c.html(html);
    }
  }
  await next();
});

app.notFound((_c) => {
  return not_found();
});
