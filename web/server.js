import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4000";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

const server = http.createServer(async (request, response) => {
  const requestPath = request.url === "/" ? "/index.html" : request.url;
  const filePath = path.join(__dirname, requestPath || "/index.html");

  try {
    let file = await fs.readFile(filePath);
    const extension = path.extname(filePath);

    if (requestPath === "/index.html") {
      const html = file
        .toString("utf8")
        .replace(
          "</body>",
          `  <script>window.AI_EVENT_PLANNER_CONFIG = ${JSON.stringify({ apiBaseUrl: API_BASE_URL })};</script>\n  </body>`
        );
      file = Buffer.from(html, "utf8");
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "text/plain; charset=utf-8"
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Web app listening on http://localhost:${PORT}`);
});
