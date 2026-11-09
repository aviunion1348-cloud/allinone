#!/usr/bin/env node
/**
 * Fetches the shared Excalidraw pipeline/roadmap scene, decrypts it
 * (AES-128-GCM + pako/zlib, Excalidraw share-link format) and writes:
 *   - docs/pipeline.excalidraw.json  (full element list, binary files stripped)
 *   - docs/pipeline.md               (spatially ordered text extract)
 *
 * Runs on GitHub Actions (full network egress). Local sandboxes with
 * allowlisted egress can also run it if json.excalidraw.com is reachable.
 */
import { writeFile, mkdir } from "node:fs/promises";
import zlib from "node:zlib";
import crypto from "node:crypto";

const SCENE_ID = "_z6CsPYBItOKkslJ_wN30";
const DECRYPTION_KEY = "tWCP-uOrZB1_YFF7Qr03Wg";
const ENDPOINT = `https://json.excalidraw.com/api/v2/${SCENE_ID}`;

/** Excalidraw concatBuffers format: [u32be version][u32be len][bytes]... */
function splitBuffers(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let cursor = 0;
  const version = view.getUint32(cursor);
  cursor += 4;
  if (version > 1) throw new Error(`unsupported buffer version ${version}`);
  const chunks = [];
  while (cursor < buf.byteLength) {
    const size = view.getUint32(cursor);
    cursor += 4;
    if (cursor + size > buf.byteLength) throw new Error("corrupt chunk framing");
    chunks.push(buf.subarray(cursor, cursor + size));
    cursor += size;
  }
  return chunks;
}

function decryptAesGcm(iv, payload, keyB64Url) {
  const key = Buffer.from(keyB64Url, "base64url"); // 16 bytes -> AES-128
  if (key.length !== 16) throw new Error("unexpected key length");
  const tag = payload.subarray(payload.length - 16);
  const body = payload.subarray(0, payload.length - 16);
  const decipher = crypto.createDecipheriv("aes-128-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

function decodeScene(buffer) {
  try {
    const [encodingMeta, iv, payload] = splitBuffers(buffer);
    const meta = JSON.parse(new TextDecoder().decode(encodingMeta));
    if (meta.encryption !== "AES-GCM") throw new Error(`encryption ${meta.encryption}`);
    const decrypted = decryptAesGcm(iv, payload, DECRYPTION_KEY);
    const plain = meta.compression ? zlib.inflateSync(decrypted) : decrypted;
    const [contentsMeta, contents] = splitBuffers(plain);
    JSON.parse(new TextDecoder().decode(contentsMeta)); // validates metadata
    return JSON.parse(new TextDecoder().decode(contents));
  } catch (err) {
    // Legacy format: [12-byte iv][ciphertext||tag] directly, no framing.
    const iv = buffer.subarray(0, 12);
    const plain = decryptAesGcm(iv, buffer.subarray(12), DECRYPTION_KEY);
    return JSON.parse(new TextDecoder().decode(plain));
  }
}

/** Spatially ordered, human-readable text extract of the board. */
function extractText(scene) {
  const elements = (scene.elements || []).filter((el) => !el.isDeleted);

  // Container labels (rectangle/ellipse/arrow labels) are bound text elements;
  // they already exist as their own `text` elements, so collecting `text` covers all.
  const texts = elements
    .filter((el) => el.type === "text" && (el.text || "").trim())
    .map((el) => ({
      text: el.text.replace(/\r/g, ""),
      x: el.x,
      y: el.y,
      w: el.width || 0,
      h: el.height || 0,
      fontSize: el.fontSize || 16,
    }));

  // Frame titles help section the document.
  const frames = elements
    .filter((el) => el.type === "frame" && el.name)
    .map((el) => ({ text: el.name, x: el.x, y: el.y, w: el.width, h: el.height, fontSize: 20 }));

  const all = [...texts, ...frames];
  if (!all.length) return "# Excalidraw pipeline\n\n_(no text elements found)_\n";

  // Group into visual rows (tolerance scaled by font size), then order rows by y, items by x.
  const sorted = [...all].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const item of sorted) {
    const tol = Math.max(12, item.fontSize * 0.9);
    const row = rows.find((r) => Math.abs(r.y - item.y) <= tol);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  rows.sort((a, b) => a.y - b.y);

  const lines = ["# Pipeline & Roadmap (Excalidraw extract)", ""];
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    const line = row.items.map((i) => i.text.replace(/\n+/g, " / ")).join("    ");
    lines.push(line);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  console.log(`Fetching ${ENDPOINT}`);
  const res = await fetch(ENDPOINT, { headers: { accept: "application/octet-stream" } });
  if (!res.ok) throw new Error(`scene fetch failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  console.log(`received ${bytes.length} bytes`);

  const scene = decodeScene(bytes);
  const elements = scene.elements || [];
  const counts = elements.reduce((acc, el) => {
    acc[el.type] = (acc[el.type] || 0) + 1;
    return acc;
  }, {});
  console.log(`decrypted OK — ${elements.length} elements`, counts);

  const markdown = extractText(scene);
  const leanScene = {
    type: scene.type,
    version: scene.version,
    source: scene.source,
    sceneVersion: scene.sceneVersion,
    elements,
    extractedAt: new Date().toISOString(),
  };

  await mkdir("docs", { recursive: true });
  await writeFile("docs/pipeline.excalidraw.json", JSON.stringify(leanScene, null, 2));
  await writeFile("docs/pipeline.md", markdown);
  console.log("wrote docs/pipeline.excalidraw.json and docs/pipeline.md");
  console.log("---- preview ----");
  console.log(markdown.slice(0, 4000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
