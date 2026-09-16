import { containedProjectPath } from "./project-paths.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  extractArticle,
  readableTitle,
  CONTENT_VERSION,
} from "./article-content.mjs";
export { extractArticle } from "./article-content.mjs";

const execute = promisify(execFile);
const idFor = (value) => {
  const s = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};
export function sourceUrl(input) {
  const url = new URL(input.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error("Paste an HTTP or HTTPS link without embedded credentials.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19].includes(b))
    );
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address); // Global unicast only; excludes mapped IPv4 and local scopes.
}
export async function fetchSource(input, redirects = 0) {
  if (redirects > 4) throw Error("Too many redirects.");
  const url = new URL(sourceUrl(input));
  const addresses = await dns.lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error(
      "Local network addresses cannot be fetched as research sources.",
    );
  const address = addresses[0];
  // Pin this request to the checked DNS answer, including after redirects.
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      {
        lookup: (_h, opts, cb) =>
          opts.all
            ? cb(null, [address])
            : cb(null, address.address, address.family),
        headers: {
          "User-Agent": "Axiovela/0.2 (+research-library)",
          Accept: "text/html,application/pdf,text/plain",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          resolve(
            fetchSource(new URL(res.headers.location, url).href, redirects + 1),
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            Error(
              `The site returned HTTP ${res.statusCode}. The original link is still saved.`,
            ),
          );
          return;
        }
        let size = 0,
          limit = 24 * 1024 * 1024;
        if (/pdf/i.test(res.headers["content-type"] || ""))
          limit = 128 * 1024 * 1024;
        const chunks = [];
        res.on("data", (chunk) => {
          if (!size && chunk.subarray(0, 5).toString() === "%PDF-")
            limit = 128 * 1024 * 1024;
          size += chunk.length;
          if (size > limit)
            res.destroy(Error(`Source exceeds ${limit / 1024 / 1024} MB.`));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            bytes: Buffer.concat(chunks),
            type: res.headers["content-type"] || "",
            url: url.href,
          }),
        );
      },
    );
    const timer = setTimeout(
      () => req.destroy(Error("The site took too long to respond.")),
      45000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
}
export function bookmark(input) {
  const url = sourceUrl(input),
    u = new URL(url);
  return {
    id: idFor(url),
    title: "Source from " + u.hostname,
    sourceUrl: url,
    sourceType: "web",
    notes: "",
    citationKey: "web" + idFor(url).slice(0, 8),
    read: false,
    addedAt: new Date().toISOString(),
  };
}
export async function pdfTitle(file) {
  try {
    const { stdout } = await execute("pdfinfo", [file], {
      timeout: 5000,
      maxBuffer: 128000,
    });
    const title = stdout.match(/^Title:\s+(.+)$/m)?.[1]?.trim();
    if (readableTitle(title)) return { title, titleOrigin: "PDF metadata" };
  } catch {}
  try {
    const { stdout } = await execute(
      "pdftotext",
      ["-f", "1", "-l", "1", "-layout", file, "-"],
      { timeout: 5000, maxBuffer: 256000 },
    );
    const title = stdout
      .split("\n")
      .map((s) => s.trim())
      .find(
        (s) =>
          s.length > 12 &&
          s.length < 200 &&
          !/^(arxiv:|https?:|\d|submitted|published|preprint)/i.test(s),
      );
    if (readableTitle(title)) return { title, titleOrigin: "first-page text" };
  } catch {}
  return {};
}

export async function importSource(
  input,
  data,
  fetcher = fetchSource,
  sourceId,
) {
  const paper = { ...bookmark(input), previewError: null };
  if (sourceId) paper.id = sourceId;
  try {
    let response = await fetcher(paper.sourceUrl);
    let extracted = {};
    if (/html/i.test(response.type)) {
      extracted = extractArticle(
        response.bytes.toString("utf8"),
        response.url || paper.sourceUrl,
      );
      if (extracted.pdfUrl) {
        try {
          const pdf = await fetcher(extracted.pdfUrl);
          if (pdf.bytes.subarray(0, 5).toString() === "%PDF-") response = pdf;
          else
            extracted.attachmentError =
              "The linked PDF did not return a PDF document.";
        } catch (e) {
          extracted.attachmentError = e.message;
        } // Keep the readable abstract if the attachment is unavailable.
      }
    }
    if (response.bytes.subarray(0, 5).toString() === "%PDF-") {
      const file = path.join(data, "papers", paper.id + ".pdf");
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, response.bytes, { flag: "wx" }).catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
      return {
        paper: {
          ...paper,
          sourceType: "pdf",
          contentHash: createHash("sha256")
            .update(response.bytes)
            .digest("hex"),
          ...(await pdfTitle(file)),
          ...(extracted.title
            ? { title: extracted.title, titleOrigin: "publication metadata" }
            : {}),
          ...(extracted.authors?.length ? { authors: extracted.authors } : {}),
          doi: extracted.doi,
          canonicalUrl: extracted.canonicalUrl,
          published: extracted.published,
          contentVersion: CONTENT_VERSION,
          capturedAt: new Date().toISOString(),
        },
        notice: "",
      };
    }
    extracted = /html/i.test(response.type)
      ? extracted
      : /text\/plain/i.test(response.type)
        ? {
            text: response.bytes.toString("utf8").slice(0, 100000),
            contentVersion: CONTENT_VERSION,
          }
        : {};
    return {
      paper: {
        ...paper,
        ...extracted,
        title: extracted.title || paper.title,
        capturedAt: new Date().toISOString(),
        contentVersion: CONTENT_VERSION,
        previewError: extracted.text
          ? null
          : "This site did not provide readable article text.",
      },
      notice: extracted.text
        ? ""
        : "Link saved. Open the original to read this source.",
    };
  } catch (e) {
    return {
      paper: {
        ...paper,
        contentVersion: CONTENT_VERSION,
        capturedAt: new Date().toISOString(),
        previewError: e.message,
      },
      notice: `Link saved. Preview unavailable: ${e.message}`,
    };
  }
}
const imageJobs = new Map();
export async function sourceImage(paper, input, data, fetcher = fetchSource) {
  const url = sourceUrl(input || "");
  if (!paper?.text?.includes("](" + url + ")"))
    throw Error("Image is not part of this saved source.");
  const key = idFor(url),
    file = containedProjectPath(data, "source-images/" + key);
  function type(bytes) {
    if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return "image/png";
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
      return "image/jpeg";
    if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return "image/gif";
    if (
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP"
    )
      return "image/webp";
    throw Error("This figure is not a supported raster image.");
  }
  try {
    const bytes = await fs.readFile(file);
    return { bytes, type: type(bytes) };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!imageJobs.has(file))
    imageJobs.set(
      file,
      (async () => {
        const { bytes } = await fetcher(url);
        if (bytes.length > 16 * 1024 * 1024)
          throw Error("Figure exceeds 16 MB.");
        const mime = type(bytes);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, bytes);
        return { bytes, type: mime };
      })().finally(() => imageJobs.delete(file)),
    );
  return imageJobs.get(file);
}
