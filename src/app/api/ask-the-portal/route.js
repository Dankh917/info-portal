import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { ObjectId } from "mongodb";
import zlib from "node:zlib";
import {
  clientPromise,
  getDocumentsCollection,
  getProjectsCollection,
  getUpdatesCollection,
} from "@/lib/mongo";
import { hasAccessToDocument } from "@/lib/document-access";
import { logError } from "@/lib/logger";

const dbName = process.env.MONGODB_DB || "info-portal";
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434")
  .trim()
  .replace(/\/+$/, "");
const OLLAMA_MODEL_DEFAULT = (process.env.OLLAMA_MODEL || "llama3.2:1b").trim();

const MAX_UPDATES = 180;
const MAX_PROJECTS = 160;
const MAX_DOCUMENTS = 220;
const MAX_USERS = 220;
const MAX_CITATIONS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RAW_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 12000;

function normalizeText(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function clipText(value, maxLength = 220) {
  const normalized = (value || "").toString().replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function tokenizeQuery(query) {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  const raw = normalized
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 2);
  return Array.from(new Set(raw)).slice(0, 24);
}

function isDocumentSummaryIntent(query) {
  const normalized = normalizeText(query);
  if (!normalized) return false;
  const wantsSummary =
    /(summarize|summarise|summary|tldr|tl;dr|recap|key points|explain|brief me|overview|synopsis)/.test(
      normalized
    ) || /\bsumm[a-z]{2,12}\b/.test(normalized);
  if (!wantsSummary) return false;

  const hasDocumentHint =
    /\b(document|doc|file|pdf|docx|ppt|pptx|xls|xlsx|report|policy|guide|handbook|manual|proposal|contract|attachment)\b/.test(
      normalized
    ) || /\.(pdf|docx?|pptx?|xlsx?)\b/.test(normalized);

  const hasReferenceHint =
    /\b(this|that)\s+(document|file|pdf|doc|report|policy|guide|handbook|manual|proposal|contract|attachment)\b/.test(
      normalized
    );
  return hasDocumentHint || hasReferenceHint;
}

function inferDocumentSummaryIntent(query, documents) {
  const normalized = normalizeText(query);
  if (!normalized) return false;

  const wantsSummary =
    /(summarize|summarise|summary|tldr|tl;dr|recap|key points|explain|brief me|overview|synopsis)/.test(
      normalized
    ) || /\bsumm[a-z]{2,12}\b/.test(normalized);
  if (!wantsSummary) return false;

  const sourceDocuments = Array.isArray(documents) ? documents : [];
  if (!sourceDocuments.length) return false;

  const queryTokens = tokenizeQuery(query).filter(
    (token) =>
      ![
        "document",
        "file",
        "summary",
        "summarize",
        "summarise",
        "please",
        "latest",
        "recent",
        "today",
        "week",
      ].includes(token)
  );
  if (queryTokens.length === 0) return false;

  let bestScore = 0;
  for (const doc of sourceDocuments) {
    const haystack = normalizeText(`${doc.title} ${doc.originalName || ""}`);
    if (!haystack) continue;

    let score = 0;
    if (haystack.includes(normalized)) {
      score += 4;
    }
    for (const token of queryTokens) {
      if (haystack.includes(token)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore >= 1;
}

function getFileExtension(filename) {
  const match = (filename || "").toString().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function getPreferredTypes(query) {
  const normalized = normalizeText(query);
  const preferred = new Set();

  if (
    /(^|\s)(who|employee|directory|person|people|contact|phone|email|manager|owner)(\s|$)/.test(
      normalized
    )
  ) {
    preferred.add("directory");
  }
  if (/(^|\s)(document|doc|pdf|file|upload|download|policy|guide)(\s|$)/.test(normalized)) {
    preferred.add("document");
  }
  if (
    /(^|\s)(project|task|instruction|deadline|due|blocked|milestone|delivery|risk)(\s|$)/.test(
      normalized
    )
  ) {
    preferred.add("project");
  }
  if (/(^|\s)(update|news|announcement|calendar|event|recent|latest)(\s|$)/.test(normalized)) {
    preferred.add("update");
  }

  return preferred;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatTimeLabel(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return "";
  }
}

function cleanExtractedText(value) {
  return (value || "")
    .toString()
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulText(value) {
  const normalized = cleanExtractedText(value);
  if (normalized.length < 80) return false;
  const words = normalized.split(/\s+/).filter(Boolean).length;
  if (words < 8) return false;
  const alphaChars = (normalized.match(/\p{L}/gu) || []).length;
  const numericChars = (normalized.match(/\p{N}/gu) || []).length;
  return (alphaChars + numericChars) / normalized.length > 0.2;
}

function scoreDecodedCandidate(value) {
  const cleaned = cleanExtractedText(value);
  if (!cleaned) return -1;
  const letters = (cleaned.match(/\p{L}/gu) || []).length;
  const digits = (cleaned.match(/\p{N}/gu) || []).length;
  const spaces = (cleaned.match(/\s/g) || []).length;
  const punctuation = (cleaned.match(/[.,;:!?'"()\[\]{}\-_/\\%$@&*+=#]/g) || []).length;
  const latinLetters = (cleaned.match(/\p{Script=Latin}/gu) || []).length;
  const hebrewLetters = (cleaned.match(/\p{Script=Hebrew}/gu) || []).length;
  const arabicLetters = (cleaned.match(/\p{Script=Arabic}/gu) || []).length;
  const cyrillicLetters = (cleaned.match(/\p{Script=Cyrillic}/gu) || []).length;
  const hanLetters = (cleaned.match(/\p{Script=Han}/gu) || []).length;
  const replacements = (cleaned.match(/\uFFFD/g) || []).length;
  const hasHebrew = hebrewLetters > 0;
  const printableChars = letters + digits + spaces + punctuation;
  const density = printableChars / Math.max(cleaned.length, 1);
  const otherChars = Math.max(cleaned.length - printableChars, 0);
  const dominantScript = Math.max(
    latinLetters,
    hebrewLetters,
    arabicLetters,
    cyrillicLetters,
    hanLetters,
    0
  );
  const dominantScriptRatio = letters > 0 ? dominantScript / letters : 0;
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  return (
    density +
    Math.min(wordCount, 30) * 0.02 +
    dominantScriptRatio * 0.35 +
    (hasHebrew ? 0.08 : 0) -
    (otherChars / Math.max(cleaned.length, 1)) * 1.2 -
    replacements * 0.12
  );
}

function detectScriptForToken(token) {
  if (/[\p{Script=Hebrew}]/u.test(token)) return "hebrew";
  if (/[\p{Script=Arabic}]/u.test(token)) return "arabic";
  if (/[\p{Script=Latin}]/u.test(token)) return "latin";
  if (/[\p{Script=Cyrillic}]/u.test(token)) return "cyrillic";
  if (/[\p{Script=Han}]/u.test(token)) return "han";
  return null;
}

function removeOutlierScriptTokens(text) {
  const cleaned = cleanExtractedText(text);
  if (!cleaned) return cleaned;

  const scriptCounts = {
    hebrew: (cleaned.match(/\p{Script=Hebrew}/gu) || []).length,
    arabic: (cleaned.match(/\p{Script=Arabic}/gu) || []).length,
    latin: (cleaned.match(/\p{Script=Latin}/gu) || []).length,
    cyrillic: (cleaned.match(/\p{Script=Cyrillic}/gu) || []).length,
    han: (cleaned.match(/\p{Script=Han}/gu) || []).length,
  };
  const dominantScript = Object.entries(scriptCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([scriptName]) => scriptName)[0];
  if (!dominantScript || !scriptCounts[dominantScript]) {
    return cleaned;
  }

  const filteredTokens = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const tokenScript = detectScriptForToken(token);
      if (!tokenScript || tokenScript === dominantScript) return true;
      return token.length > 18;
    });

  return cleanExtractedText(filteredTokens.join(" "));
}

function decodeUtf16Be(rawBuffer) {
  if (!rawBuffer || rawBuffer.length < 2) return "";
  const maxBytes = Math.min(rawBuffer.length, 24000);
  let output = "";
  for (let index = 0; index + 1 < maxBytes; index += 2) {
    const codePoint = (rawBuffer[index] << 8) | rawBuffer[index + 1];
    if (codePoint === 0) continue;
    output += String.fromCharCode(codePoint);
  }
  return output;
}

function reverseHebrewRuns(text) {
  return (text || "").replace(/[\u0590-\u05FF]{2,}/gu, (segment) =>
    Array.from(segment).reverse().join("")
  );
}

function decodePdfTextBytes(rawBuffer) {
  if (!rawBuffer || rawBuffer.length === 0) return "";

  const candidates = [];
  const pushCandidate = (value, encoding = "unknown") => {
    const cleaned = cleanExtractedText(value);
    if (cleaned) {
      candidates.push({
        text: cleaned,
        encoding,
      });
    }
  };

  pushCandidate(rawBuffer.toString("utf8"), "utf8");
  pushCandidate(rawBuffer.toString("utf16le"), "utf16le");
  pushCandidate(decodeUtf16Be(rawBuffer), "utf16be");
  pushCandidate(rawBuffer.toString("latin1"), "latin1");

  const textDecoders = [
    "windows-1255",
    "iso-8859-8",
    "windows-1256",
    "windows-1252",
  ];
  for (const encoding of textDecoders) {
    try {
      const decoded = new TextDecoder(encoding).decode(rawBuffer);
      pushCandidate(decoded, encoding);
    } catch (error) {
      // Ignore unsupported decoder labels.
    }
  }

  const hebrewCandidates = candidates.filter(
    (candidate) => (candidate.text.match(/\p{Script=Hebrew}/gu) || []).length >= 3
  );
  const arabicCandidates = candidates.filter(
    (candidate) => (candidate.text.match(/\p{Script=Arabic}/gu) || []).length >= 3
  );
  const candidatePool = hebrewCandidates.length
    ? hebrewCandidates
    : arabicCandidates.length
      ? arabicCandidates
      : candidates;

  let best = "";
  let bestScore = -1;
  for (const candidate of candidatePool) {
    const normalizedCandidate = /[\u0590-\u05FF]/u.test(candidate.text)
      ? reverseHebrewRuns(candidate.text)
      : candidate.text;
    const score = scoreDecodedCandidate(normalizedCandidate);
    if (score > bestScore) {
      bestScore = score;
      best = normalizedCandidate;
    }
  }

  return cleanExtractedText(best);
}

function parsePdfLiteralBytes(token) {
  if (!token) return Buffer.alloc(0);
  const bytes = [];
  for (let index = 0; index < token.length; index += 1) {
    const charCode = token.charCodeAt(index) & 0xff;
    if (charCode !== 0x5c) {
      bytes.push(charCode);
      continue;
    }

    index += 1;
    if (index >= token.length) break;
    const escaped = token.charCodeAt(index) & 0xff;

    if (escaped === 0x6e) {
      bytes.push(0x0a);
      continue;
    }
    if (escaped === 0x72) {
      bytes.push(0x0d);
      continue;
    }
    if (escaped === 0x74) {
      bytes.push(0x09);
      continue;
    }
    if (escaped === 0x62) {
      bytes.push(0x08);
      continue;
    }
    if (escaped === 0x66) {
      bytes.push(0x0c);
      continue;
    }
    if (escaped === 0x0a || escaped === 0x0d) {
      continue;
    }
    if (escaped >= 0x30 && escaped <= 0x37) {
      let octalValue = String.fromCharCode(escaped);
      for (
        let octalIndex = 0;
        octalIndex < 2 &&
        index + 1 < token.length &&
        /[0-7]/.test(token[index + 1]);
        octalIndex += 1
      ) {
        index += 1;
        octalValue += token[index];
      }
      bytes.push(parseInt(octalValue, 8) & 0xff);
      continue;
    }

    bytes.push(escaped);
  }
  return Buffer.from(bytes);
}

function extractPdfTextFromContent(contentText) {
  if (!contentText) return "";
  const blocks = contentText.match(/BT[\s\S]{0,120000}?ET/g) || [];
  if (blocks.length === 0) return "";

  const fragments = [];
  let tokenCount = 0;
  const pushDecodedFragment = (rawBuffer) => {
    const decoded = decodePdfTextBytes(rawBuffer);
    if (decoded && scoreDecodedCandidate(decoded) >= 0.75) {
      fragments.push(decoded);
    }
    tokenCount += 1;
  };

  for (const block of blocks) {
    const singleTextOps = block.matchAll(/\((?:\\.|[^\\)]){2,}\)\s*(Tj|'|")/g);
    for (const opMatch of singleTextOps) {
      const tokenText = opMatch[0].replace(/\s*(Tj|'|")\s*$/, "");
      pushDecodedFragment(parsePdfLiteralBytes(tokenText.slice(1, -1)));
      if (tokenCount >= 500) break;
    }
    if (tokenCount >= 500) break;

    const arrayTextOps = block.matchAll(/\[(.{1,12000}?)\]\s*TJ/gs);
    for (const arrayMatch of arrayTextOps) {
      const arrayPayload = arrayMatch[1] || "";
      const tokens =
        arrayPayload.match(/\((?:\\.|[^\\)]){2,}\)|<([0-9A-Fa-f\s]{4,})>/g) || [];
      for (const token of tokens) {
        if (token.startsWith("(")) {
          pushDecodedFragment(parsePdfLiteralBytes(token.slice(1, -1)));
        } else {
          const normalizedHex = token.slice(1, -1).replace(/\s+/g, "");
          if (!normalizedHex || normalizedHex.length % 2 !== 0 || normalizedHex.length > 8000) {
            continue;
          }
          pushDecodedFragment(Buffer.from(normalizedHex, "hex"));
        }
        if (tokenCount >= 500) break;
      }
      if (tokenCount >= 500) break;
    }
    if (tokenCount >= 500) break;
  }

  return cleanExtractedText(fragments.join(" "));
}

function extractPdfTextFromBuffer(fileBuffer) {
  const streamToken = Buffer.from("stream");
  const endStreamToken = Buffer.from("endstream");
  const preflightSlice = fileBuffer.subarray(0, Math.min(fileBuffer.length, 250000)).toString("latin1");
  const hasEmbeddedImage = /\/Image|DCTDecode|JPXDecode|JBIG2Decode/i.test(preflightSlice);

  const fragments = [];
  let fragmentCharCount = 0;
  let sawPdfTextOperator = false;
  let cursor = 0;
  while (cursor < fileBuffer.length && fragmentCharCount < MAX_EXTRACTED_CHARS * 2) {
    const streamStart = fileBuffer.indexOf(streamToken, cursor);
    if (streamStart < 0) break;

    let payloadStart = streamStart + streamToken.length;
    if (fileBuffer[payloadStart] === 0x0d && fileBuffer[payloadStart + 1] === 0x0a) {
      payloadStart += 2;
    } else if (fileBuffer[payloadStart] === 0x0a || fileBuffer[payloadStart] === 0x0d) {
      payloadStart += 1;
    }

    const streamEnd = fileBuffer.indexOf(endStreamToken, payloadStart);
    if (streamEnd < 0) break;
    const rawStream = fileBuffer.subarray(payloadStart, streamEnd);
    const dictionaryWindow = fileBuffer
      .subarray(Math.max(0, streamStart - 700), streamStart)
      .toString("latin1");
    const isFlate = /\/FlateDecode/i.test(dictionaryWindow);

    let streamContent = rawStream;
    if (isFlate) {
      try {
        streamContent = zlib.inflateSync(rawStream);
      } catch (inflateError) {
        try {
          streamContent = zlib.inflateRawSync(rawStream);
        } catch (inflateRawError) {
          streamContent = Buffer.alloc(0);
        }
      }
    }

    if (streamContent.length > 0) {
      const streamText = streamContent.toString("latin1");
      if (/\bBT\b/.test(streamText) && /\b(Tj|TJ|')\b/.test(streamText)) {
        sawPdfTextOperator = true;
      }
      const extracted = extractPdfTextFromContent(streamText);
      if (extracted) {
        fragments.push(extracted);
        fragmentCharCount += extracted.length;
      }
    }

    cursor = streamEnd + endStreamToken.length;
  }

  const combinedText = removeOutlierScriptTokens(fragments.join(" "));
  return {
    text: combinedText.slice(0, MAX_EXTRACTED_CHARS),
    likelyImageOnly: hasEmbeddedImage && !sawPdfTextOperator,
  };
}

function decodeXmlEntities(value) {
  return (value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, codePoint) => {
      const valueAsNumber = Number(codePoint);
      if (!Number.isFinite(valueAsNumber) || valueAsNumber < 0 || valueAsNumber > 0x10ffff) {
        return "";
      }
      return String.fromCodePoint(valueAsNumber);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) => {
      const valueAsNumber = parseInt(codePoint, 16);
      if (!Number.isFinite(valueAsNumber) || valueAsNumber < 0 || valueAsNumber > 0x10ffff) {
        return "";
      }
      return String.fromCodePoint(valueAsNumber);
    });
}

function extractDocxXmlText(xmlText) {
  if (!xmlText) return "";
  const normalizedXml = xmlText
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<w:cr\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n");
  const textMatches = normalizedXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
  const fragments = [];
  for (const match of textMatches) {
    const fragment = decodeXmlEntities(match[1]);
    if (fragment) {
      fragments.push(fragment);
    }
  }
  return cleanExtractedText(fragments.join(" "));
}

function readZipEntries(zipBuffer) {
  const entries = [];
  let offset = 0;
  const localFileHeaderSignature = 0x04034b50;

  while (offset + 30 <= zipBuffer.length && entries.length < 90) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== localFileHeaderSignature) {
      offset += 1;
      continue;
    }

    const flags = zipBuffer.readUInt16LE(offset + 6);
    const compression = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const nameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraLength = zipBuffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;

    if (nameEnd > zipBuffer.length || dataStart > zipBuffer.length) break;
    const name = zipBuffer.subarray(nameStart, nameEnd).toString("utf8");

    // Data descriptor mode does not expose compressed size in this header.
    if (flags & 0x08) {
      offset = dataStart;
      continue;
    }

    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zipBuffer.length) break;

    entries.push({
      name,
      compression,
      data: zipBuffer.subarray(dataStart, dataEnd),
    });

    offset = dataEnd;
  }

  return entries;
}

function inflateZipEntry(entry) {
  if (!entry) return Buffer.alloc(0);
  if (entry.compression === 0) return entry.data;
  if (entry.compression !== 8) return Buffer.alloc(0);
  try {
    return zlib.inflateRawSync(entry.data);
  } catch (error) {
    return Buffer.alloc(0);
  }
}

function normalizeZipPath(value) {
  return (value || "")
    .toString()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\//, "");
}

function extractDocxTextFromBuffer(fileBuffer) {
  const entries = readZipEntries(fileBuffer);
  if (!entries.length) return "";

  const targetEntries = entries.filter((entry) =>
    /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(entry.name)
  );
  if (!targetEntries.length) return "";

  const fragments = [];
  for (const entry of targetEntries) {
    let xmlBuffer = Buffer.alloc(0);
    if (entry.compression === 0) {
      xmlBuffer = entry.data;
    } else if (entry.compression === 8) {
      try {
        xmlBuffer = zlib.inflateRawSync(entry.data);
      } catch (error) {
        xmlBuffer = Buffer.alloc(0);
      }
    }

    if (!xmlBuffer.length) continue;
    const partText = extractDocxXmlText(xmlBuffer.toString("utf8"));
    if (partText) {
      fragments.push(partText);
    }
    if (cleanExtractedText(fragments.join(" ")).length >= MAX_EXTRACTED_CHARS * 2) {
      break;
    }
  }

  return cleanExtractedText(fragments.join(" ")).slice(0, MAX_EXTRACTED_CHARS);
}

function collectXmlTextTokens(xmlText, tagName) {
  if (!xmlText) return [];
  const escapedTagName = tagName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`<${escapedTagName}[^>]*>([\\s\\S]*?)</${escapedTagName}>`, "g");
  const tokens = [];
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    const value = cleanExtractedText(decodeXmlEntities(match[1] || ""));
    if (value) {
      tokens.push(value);
    }
  }
  return tokens;
}

function parseXlsxSharedStrings(sharedStringsXml) {
  if (!sharedStringsXml) return [];
  const items = [];
  const stringItems = sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g);
  for (const item of stringItems) {
    const value = collectXmlTextTokens(item[1] || "", "t").join("");
    items.push(cleanExtractedText(value));
  }
  return items;
}

function parseWorkbookSheetNameMap(workbookXml, workbookRelsXml) {
  const result = new Map();
  if (!workbookXml || !workbookRelsXml) return result;

  const relMap = new Map();
  const relMatches = workbookRelsXml.matchAll(/<Relationship\b[^>]*>/g);
  for (const relMatch of relMatches) {
    const tag = relMatch[0] || "";
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !target) continue;
    const normalizedTarget = normalizeZipPath(target).replace(/^\.\.\//, "");
    const fullPath = normalizedTarget.startsWith("xl/")
      ? normalizedTarget
      : normalizeZipPath(`xl/${normalizedTarget}`);
    relMap.set(id, fullPath);
  }

  const sheetMatches = workbookXml.matchAll(/<sheet\b[^>]*>/g);
  for (const sheetMatch of sheetMatches) {
    const tag = sheetMatch[0] || "";
    const relationId = tag.match(/\br:id="([^"]+)"/)?.[1];
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    if (!relationId || !name) continue;
    const targetPath = relMap.get(relationId);
    if (targetPath) {
      result.set(targetPath, cleanExtractedText(decodeXmlEntities(name)));
    }
  }

  return result;
}

function extractXlsxCellValue(cellType, cellBody, sharedStrings) {
  const normalizedBody = cellBody || "";
  if (cellType === "inlineStr") {
    const inlineValue = collectXmlTextTokens(normalizedBody, "t").join(" ");
    return cleanExtractedText(inlineValue);
  }

  const rawValue = normalizedBody.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];
  const decodedValue = cleanExtractedText(decodeXmlEntities(rawValue || ""));
  if (!decodedValue && /<f\b/i.test(normalizedBody)) {
    const formula = normalizedBody.match(/<f[^>]*>([\s\S]*?)<\/f>/)?.[1];
    const normalizedFormula = cleanExtractedText(decodeXmlEntities(formula || ""));
    return normalizedFormula ? `formula ${normalizedFormula}` : "";
  }

  if (cellType === "s") {
    const sharedIndex = Number.parseInt(decodedValue, 10);
    if (Number.isFinite(sharedIndex) && sharedIndex >= 0 && sharedIndex < sharedStrings.length) {
      return cleanExtractedText(sharedStrings[sharedIndex] || "");
    }
  }
  if (cellType === "b") {
    return decodedValue === "1" ? "TRUE" : decodedValue === "0" ? "FALSE" : decodedValue;
  }

  return decodedValue;
}

function extractXlsxSheetRows(sheetXml, sharedStrings) {
  const rows = [];
  if (!sheetXml) return rows;

  const rowMatches = sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g);
  let rowCounter = 0;
  for (const rowMatch of rowMatches) {
    rowCounter += 1;
    if (rowCounter > 80) break;

    const rowAttrs = rowMatch[1] || "";
    const rowBody = rowMatch[2] || "";
    const rowNumber = rowAttrs.match(/\br="(\d+)"/)?.[1] || `${rowCounter}`;
    const cells = [];
    const cellMatches = rowBody.matchAll(/<c\b([^>]*?)(?:>([\s\S]*?)<\/c>|\/>)/g);
    let cellCounter = 0;
    for (const cellMatch of cellMatches) {
      cellCounter += 1;
      if (cellCounter > 12) break;

      const cellAttrs = cellMatch[1] || "";
      const cellBody = cellMatch[2] || "";
      const cellRef = (cellAttrs.match(/\br="([^"]+)"/)?.[1] || "").toUpperCase();
      const cellType = (cellAttrs.match(/\bt="([^"]+)"/)?.[1] || "").toLowerCase();
      const rawValue = extractXlsxCellValue(cellType, cellBody, sharedStrings);
      const value = cleanExtractedText(rawValue).slice(0, 120);
      if (!value) continue;

      const columnLabel = cellRef.match(/^[A-Z]+/)?.[0] || `C${cellCounter}`;
      cells.push(`${columnLabel}=${value}`);
    }

    if (cells.length > 0) {
      rows.push(`Row ${rowNumber}: ${cells.join("; ")}.`);
    }
  }

  return rows;
}

function extractXlsxTextFromBuffer(fileBuffer) {
  const entries = readZipEntries(fileBuffer);
  if (!entries.length) return "";

  const xmlParts = new Map();
  for (const entry of entries) {
    const normalizedName = normalizeZipPath(entry.name);
    if (
      !/^xl\/(worksheets\/[^/]+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/i.test(
        normalizedName
      )
    ) {
      continue;
    }

    const xmlBuffer = inflateZipEntry(entry);
    if (!xmlBuffer.length) continue;
    xmlParts.set(normalizedName, xmlBuffer.toString("utf8"));
  }

  const sharedStrings = parseXlsxSharedStrings(xmlParts.get("xl/sharedStrings.xml") || "");
  const sheetNameMap = parseWorkbookSheetNameMap(
    xmlParts.get("xl/workbook.xml") || "",
    xmlParts.get("xl/_rels/workbook.xml.rels") || ""
  );
  const sheetPaths = Array.from(xmlParts.keys())
    .filter((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const fragments = [];
  let sheetCount = 0;
  for (const sheetPath of sheetPaths) {
    sheetCount += 1;
    if (sheetCount > 4) break;

    const sheetLabel =
      sheetNameMap.get(sheetPath) ||
      cleanExtractedText(
        sheetPath.replace(/^xl\/worksheets\//i, "").replace(/\.xml$/i, "")
      );
    const sheetRows = extractXlsxSheetRows(xmlParts.get(sheetPath) || "", sharedStrings);
    if (!sheetRows.length) continue;

    fragments.push(`Worksheet ${sheetLabel}.`);
    fragments.push(...sheetRows);
    fragments.push("");
    if (cleanExtractedText(fragments.join(" ")).length >= MAX_EXTRACTED_CHARS * 2) {
      break;
    }
  }

  return cleanExtractedText(fragments.join(" ")).slice(0, MAX_EXTRACTED_CHARS);
}

function extractPrintableStrings(latinText) {
  const matches =
    latinText.match(/[A-Za-z0-9][A-Za-z0-9 ,.;:!?'"()\-_/\\@#$%^&*+=\[\]{}|<>]{24,}/g) || [];
  const unique = [];
  for (const chunk of matches) {
    const cleaned = cleanExtractedText(chunk);
    if (!cleaned) continue;
    if (cleaned.split(" ").length < 4) continue;
    if (!unique.includes(cleaned)) {
      unique.push(cleaned);
    }
    if (unique.length >= 220) break;
  }
  return unique.join("\n");
}

function extractPdfParenthesisText(latinText) {
  const fragments = [];
  const regex = /\(([^()]{30,500})\)/g;
  let match;
  while ((match = regex.exec(latinText)) !== null) {
    const cleaned = cleanExtractedText(match[1]);
    if (!cleaned) continue;
    if (cleaned.split(" ").length < 5) continue;
    fragments.push(cleaned);
    if (fragments.length >= 220) break;
  }
  return fragments.join("\n");
}

function getFileBuffer(fileValue) {
  if (Buffer.isBuffer(fileValue)) return fileValue;
  return Buffer.from(
    fileValue?.buffer ?? fileValue?.value?.(true) ?? fileValue?.value?.() ?? []
  );
}

function extractTextFromBuffer(fileBuffer, contentType, filename) {
  if (!fileBuffer || fileBuffer.length === 0) {
    return { text: "", status: "empty_file" };
  }

  const workingBuffer =
    fileBuffer.length > MAX_RAW_FILE_BYTES
      ? fileBuffer.subarray(0, MAX_RAW_FILE_BYTES)
      : fileBuffer;
  const extension = getFileExtension(filename);
  const mime = (contentType || "").toLowerCase();
  const isLikelyTextFile =
    mime.startsWith("text/") ||
    ["txt", "md", "csv", "json", "xml", "html"].includes(extension);

  if (isLikelyTextFile) {
    const directText = cleanExtractedText(workingBuffer.toString("utf8"));
    if (isUsefulText(directText)) {
      return {
        text: directText.slice(0, MAX_EXTRACTED_CHARS),
        status: "plain_text",
      };
    }
  }

  if (mime.includes("pdf") || extension === "pdf") {
    const pdfResult = extractPdfTextFromBuffer(workingBuffer);
    if (isUsefulText(pdfResult.text)) {
      return {
        text: pdfResult.text.slice(0, MAX_EXTRACTED_CHARS),
        status: "pdf_text",
      };
    }

    const latinText = workingBuffer.toString("latin1");
    const fallbackText = cleanExtractedText(
      [extractPdfParenthesisText(latinText), extractPrintableStrings(latinText)].join("\n")
    );
    if (isUsefulText(fallbackText)) {
      return {
        text: fallbackText.slice(0, MAX_EXTRACTED_CHARS),
        status: "pdf_fallback_text",
      };
    }

    return {
      text: "",
      status: pdfResult.likelyImageOnly ? "pdf_ocr_required" : "pdf_text_unavailable",
    };
  }

  if (
    mime.includes("officedocument.wordprocessingml.document") ||
    extension === "docx"
  ) {
    const docxText = extractDocxTextFromBuffer(workingBuffer);
    if (isUsefulText(docxText)) {
      return {
        text: docxText.slice(0, MAX_EXTRACTED_CHARS),
        status: "docx_text",
      };
    }
    return { text: "", status: "docx_text_unavailable" };
  }

  if (
    mime.includes("officedocument.spreadsheetml.sheet") ||
    extension === "xlsx"
  ) {
    const xlsxText = extractXlsxTextFromBuffer(workingBuffer);
    if (isUsefulText(xlsxText)) {
      return {
        text: xlsxText.slice(0, MAX_EXTRACTED_CHARS),
        status: "xlsx_text",
      };
    }
    return { text: "", status: "xlsx_text_unavailable" };
  }

  if (mime.includes("vnd.ms-excel") || extension === "xls") {
    return { text: "", status: "xls_text_unavailable" };
  }

  if (
    mime.includes("officedocument.presentationml.presentation") ||
    extension === "pptx" ||
    mime.includes("vnd.ms-powerpoint") ||
    extension === "ppt"
  ) {
    return { text: "", status: "presentation_text_unavailable" };
  }

  const utf16Text = cleanExtractedText(workingBuffer.toString("utf16le"));
  if (isUsefulText(utf16Text)) {
    return {
      text: utf16Text.slice(0, MAX_EXTRACTED_CHARS),
      status: "utf16_text",
    };
  }

  const latinText = workingBuffer.toString("latin1");
  const fallbackText = extractPrintableStrings(latinText);
  if (isUsefulText(fallbackText)) {
    return {
      text: cleanExtractedText(fallbackText).slice(0, MAX_EXTRACTED_CHARS),
      status: "binary_text",
    };
  }

  return { text: "", status: "text_unavailable" };
}

function summarizeExtractedText(text) {
  const normalized = cleanExtractedText(text);
  if (!normalized) return "";

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 30);
  if (sentences.length > 0) {
    return sentences.slice(0, 4).join(" ").slice(0, 680);
  }

  const chunks = normalized
    .split(/[;|]\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 20);
  if (chunks.length > 0) {
    return chunks.slice(0, 4).join(". ").slice(0, 680);
  }

  return normalized.slice(0, 680);
}

function summarizeSpreadsheetExtract(text) {
  const normalized = cleanExtractedText(text);
  if (!normalized) return "";

  const rows = [];
  const rowMatches = normalized.matchAll(/Row\s+(\d+):\s+([^.]*)\./g);
  for (const rowMatch of rowMatches) {
    const rowNumber = Number.parseInt(rowMatch[1], 10);
    const rowBody = rowMatch[2] || "";
    if (!Number.isFinite(rowNumber)) continue;

    const cells = {};
    for (const cellPart of rowBody.split(";")) {
      const trimmed = cellPart.trim();
      const cellMatch = trimmed.match(/^([A-Z]+)=([\s\S]+)$/);
      if (!cellMatch) continue;
      const key = cellMatch[1];
      const value = cleanExtractedText(cellMatch[2]);
      if (value) {
        cells[key] = value;
      }
    }

    if (Object.keys(cells).length > 0) {
      rows.push({ rowNumber, cells });
    }
  }

  if (rows.length === 0) {
    return summarizeExtractedText(normalized);
  }

  const headerRow = rows.find((row) => row.rowNumber === 1) || rows[0];
  const headers = Object.entries(headerRow.cells)
    .map(([column, value]) => `${column}: ${value}`)
    .slice(0, 6);

  const dataRows = rows.filter((row) => row.rowNumber !== headerRow.rowNumber);
  const numericByColumn = new Map();
  for (const row of dataRows) {
    for (const [column, value] of Object.entries(row.cells)) {
      const parsed = Number.parseFloat(value.replace(/,/g, ""));
      if (!Number.isFinite(parsed)) continue;
      if (!numericByColumn.has(column)) {
        numericByColumn.set(column, []);
      }
      numericByColumn.get(column).push(parsed);
    }
  }

  let bestNumericColumn = null;
  let bestNumericValues = [];
  for (const [column, values] of numericByColumn.entries()) {
    if (values.length > bestNumericValues.length) {
      bestNumericColumn = column;
      bestNumericValues = values;
    }
  }

  let numericSummary = "";
  if (bestNumericColumn && bestNumericValues.length >= 3) {
    const total = bestNumericValues.reduce((sum, value) => sum + value, 0);
    const average = total / bestNumericValues.length;
    const minValue = Math.min(...bestNumericValues);
    const maxValue = Math.max(...bestNumericValues);
    const passCount = bestNumericValues.filter((value) => value >= 60).length;
    numericSummary = `Column ${bestNumericColumn} appears numeric with ${bestNumericValues.length} entries (avg ${average.toFixed(2)}, min ${minValue}, max ${maxValue}, >=60 count ${passCount}).`;
  }

  let commentSummary = "";
  const textHeavyCells = dataRows.filter((row) =>
    Object.values(row.cells).some((value) => value.split(/\s+/).length >= 6)
  );
  if (textHeavyCells.length > 0) {
    commentSummary = `${textHeavyCells.length} row(s) contain longer free-text notes/comments.`;
  }

  let explicitAverageSummary = "";
  const averageRow = dataRows.find((row) =>
    Object.values(row.cells).some((value) => /\b(average|avg|ממוצע)\b/i.test(value))
  );
  if (averageRow) {
    const averageCells = Object.entries(averageRow.cells)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
    explicitAverageSummary = `An explicit average row is present: ${averageCells}.`;
  }

  const parts = [
    `Spreadsheet rows parsed: ${rows.length}.`,
    headers.length ? `Header snapshot: ${headers.join(" | ")}.` : "",
    numericSummary,
    commentSummary,
    explicitAverageSummary,
  ].filter(Boolean);

  return clipText(parts.join(" "), 900);
}

function parseJsonFromText(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (nestedError) {
        return null;
      }
    }
    return null;
  }
}

async function getUserDepartments(token) {
  let dbDepartments = [];
  try {
    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection("users");
    const userQuery =
      token?.sub && ObjectId.isValid(token.sub)
        ? { _id: new ObjectId(token.sub) }
        : { email: token?.email };
    const userRecord = await usersCollection.findOne(userQuery, {
      projection: { departments: 1, department: 1 },
    });
    if (userRecord) {
      if (Array.isArray(userRecord.departments)) {
        dbDepartments = userRecord.departments.filter(Boolean);
      } else if (userRecord.department) {
        dbDepartments = [userRecord.department];
      }
    }
  } catch (error) {
    await logError("Failed to load user departments for Ask-the-Portal", error, {
      route: "/api/ask-the-portal",
      userId: token?.sub,
    });
  }

  return dbDepartments.length
    ? dbDepartments
    : Array.isArray(token?.departments)
      ? token.departments.filter(Boolean)
      : token?.department
        ? [token.department]
        : [];
}

async function loadUpdates(token, userDepartments) {
  const updatesCollection = await getUpdatesCollection();
  const visibilityFilters = [{ departments: { $in: ["General"] } }, { authorId: token.sub }];
  if (userDepartments.length > 0) {
    visibilityFilters.push({ departments: { $in: userDepartments } });
  }

  const updates = await updatesCollection
    .find({
      $or: visibilityFilters,
      createdAt: { $gte: new Date(Date.now() - 120 * DAY_MS) },
    })
    .project({
      title: 1,
      message: 1,
      tags: 1,
      departments: 1,
      createdAt: 1,
      happensAt: 1,
      authorName: 1,
      source: 1,
    })
    .sort({ createdAt: -1 })
    .limit(MAX_UPDATES)
    .toArray();

  return updates.map((item) => {
    const id = item?._id?.toString?.() || "";
    const tagNames = Array.isArray(item.tags)
      ? item.tags
          .map((tag) => (typeof tag === "string" ? tag : tag?.name))
          .filter(Boolean)
      : [];
    const eventTime = item.happensAt || item.createdAt || null;
    const summaryParts = [
      clipText(item.message, 220),
      tagNames.length ? `Tags: ${tagNames.join(", ")}` : "",
      Array.isArray(item.departments) && item.departments.length
        ? `Departments: ${item.departments.join(", ")}`
        : "",
      item.authorName ? `Author: ${item.authorName}` : "",
      eventTime ? `Time: ${formatTimeLabel(eventTime)}` : "",
    ].filter(Boolean);

    return {
      sourceId: id,
      type: "update",
      title: item.title || "Untitled update",
      excerpt: summaryParts.join(" | "),
      searchText: [
        item.title,
        item.message,
        tagNames.join(" "),
        Array.isArray(item.departments) ? item.departments.join(" ") : "",
        item.authorName,
      ]
        .filter(Boolean)
        .join(" "),
      path: "/",
      timestamp: toIsoOrNull(eventTime),
    };
  });
}

function collectTaskSnippet(project, userId) {
  const assignments = Array.isArray(project.assignments) ? project.assignments : [];
  const assignment = assignments.find(
    (item) => item?.userId?.toString?.() === userId?.toString?.()
  );
  if (!assignment || !Array.isArray(assignment.instructions)) return "";
  const open = assignment.instructions
    .filter((instruction) => !instruction?.done && instruction?.text)
    .map((instruction) => instruction.text.toString().trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!open.length) return "";
  return `Open assignments: ${open.join(" | ")}`;
}

async function loadProjects(token, userDepartments) {
  const projectsCollection = await getProjectsCollection();
  const role = (token?.role || "general").toLowerCase();
  const isAdmin = role === "admin";
  const isPm = role === "pm";
  const query = isAdmin
    ? {}
    : isPm
      ? userDepartments.length
        ? { departments: { $in: userDepartments } }
        : { _id: null }
      : { "assignments.userId": token.sub };

  const projects = await projectsCollection
    .find(query)
    .project({
      title: 1,
      summary: 1,
      status: 1,
      dueDate: 1,
      departments: 1,
      tags: 1,
      assignments: 1,
      updatedAt: 1,
      createdAt: 1,
      generalInstructions: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(MAX_PROJECTS)
    .toArray();

  return projects.map((project) => {
    const id = project?._id?.toString?.() || "";
    const dueLabel = project?.dueDate ? formatTimeLabel(project.dueDate) : "";
    const taskSnippet = collectTaskSnippet(project, token.sub);
    const status = (project?.status || "planned").toString().toLowerCase();
    const generalInstructions = Array.isArray(project.generalInstructions)
      ? project.generalInstructions
          .map((instruction) => instruction?.text?.toString?.().trim())
          .filter(Boolean)
          .slice(0, 1)
      : [];

    const summaryParts = [
      clipText(project.summary, 180),
      `Status: ${status}`,
      dueLabel ? `Due: ${dueLabel}` : "",
      Array.isArray(project.departments) && project.departments.length
        ? `Departments: ${project.departments.join(", ")}`
        : "",
      Array.isArray(project.tags) && project.tags.length
        ? `Tags: ${project.tags.join(", ")}`
        : "",
      taskSnippet,
      generalInstructions.length ? `Instruction: ${generalInstructions.join(" | ")}` : "",
    ].filter(Boolean);

    return {
      sourceId: id,
      type: "project",
      title: project.title || "Untitled project",
      excerpt: summaryParts.join(" | "),
      searchText: [
        project.title,
        project.summary,
        status,
        Array.isArray(project.tags) ? project.tags.join(" ") : "",
        Array.isArray(project.departments) ? project.departments.join(" ") : "",
        taskSnippet,
        generalInstructions.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
      path: `/projects?id=${encodeURIComponent(id)}`,
      timestamp: toIsoOrNull(project.updatedAt || project.createdAt || project.dueDate),
    };
  });
}

async function loadDocuments(token) {
  const documentsCollection = await getDocumentsCollection();
  const allDocuments = await documentsCollection
    .find({}, { projection: { file: 0 } })
    .sort({ createdAt: -1 })
    .limit(MAX_DOCUMENTS)
    .toArray();

  const allowed = allDocuments.filter((doc) => hasAccessToDocument(doc, token));

  return allowed.map((doc) => {
    const id = doc?._id?.toString?.() || "";
    const title = doc.title || doc.originalName || "Untitled document";
    const visibility = doc.isPrivate ? "private" : `level ${doc.hierarchyLevel ?? 3}`;
    const projectPart = doc.projectId ? `Linked project id: ${doc.projectId}` : "";
    const sizePart =
      Number.isFinite(doc.size) && doc.size > 0 ? `Size: ${(doc.size / 1024).toFixed(1)} KB` : "";

    return {
      sourceId: id,
      type: "document",
      title,
      originalName: doc.originalName || "",
      contentType: doc.contentType || "",
      excerpt: [clipText(doc.description || "", 120), `Visibility: ${visibility}`, projectPart, sizePart]
        .filter(Boolean)
        .join(" | "),
      searchText: [
        doc.title,
        doc.originalName,
        doc.uploadedByUsername,
        doc.uploadedByEmail,
        Array.isArray(doc.accessRoles) ? doc.accessRoles.join(" ") : "",
        doc.projectId,
      ]
        .filter(Boolean)
        .join(" "),
      path: `/documentation?highlight=${encodeURIComponent(id)}`,
      timestamp: toIsoOrNull(doc.createdAt),
    };
  });
}

async function loadDirectoryUsers() {
  const client = await clientPromise;
  const usersCollection = client.db(dbName).collection("users");
  const users = await usersCollection
    .find(
      {},
      {
        projection: {
          _id: 1,
          name: 1,
          email: 1,
          username: 1,
          normalizedUsername: 1,
          role: 1,
          departments: 1,
          bio: 1,
          phone: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      }
    )
    .limit(MAX_USERS)
    .toArray();

  return users.map((user) => {
    const username = user.username || user.normalizedUsername || "";
    const profilePath = username
      ? `/profile/${encodeURIComponent(username)}`
      : "/directory";
    const name = user.name || user.email || "User";
    const role = (user.role || "general").toString();
    const depts = Array.isArray(user.departments) ? user.departments : [];

    return {
      sourceId: user?._id?.toString?.() || "",
      type: "directory",
      title: name,
      excerpt: [
        user.email ? `Email: ${user.email}` : "",
        user.phone ? `Phone: ${user.phone}` : "",
        role ? `Role: ${role}` : "",
        depts.length ? `Departments: ${depts.join(", ")}` : "",
        clipText(user.bio, 120),
      ]
        .filter(Boolean)
        .join(" | "),
      searchText: [name, user.email, user.phone, role, depts.join(" "), user.bio]
        .filter(Boolean)
        .join(" "),
      path: profilePath,
      timestamp: toIsoOrNull(user.updatedAt || user.createdAt),
    };
  });
}

function scoreEntry(entry, query, queryTokens, preferredTypes) {
  const titleNorm = normalizeText(entry.title);
  const excerptNorm = normalizeText(entry.excerpt);
  const searchNorm = normalizeText(entry.searchText);
  const normalizedQuery = normalizeText(query);

  let score = 0;
  if (preferredTypes.has(entry.type)) score += 14;
  if (normalizedQuery && titleNorm.includes(normalizedQuery)) score += 26;
  if (normalizedQuery && excerptNorm.includes(normalizedQuery)) score += 16;
  if (normalizedQuery && searchNorm.includes(normalizedQuery)) score += 10;

  for (const token of queryTokens) {
    if (titleNorm.includes(token)) {
      score += 8;
      continue;
    }
    if (excerptNorm.includes(token)) {
      score += 5;
      continue;
    }
    if (searchNorm.includes(token)) {
      score += 3;
    }
  }

  if (entry.timestamp) {
    const ageMs = Date.now() - new Date(entry.timestamp).getTime();
    if (Number.isFinite(ageMs)) {
      if (ageMs <= 3 * DAY_MS) score += 5;
      else if (ageMs <= 14 * DAY_MS) score += 4;
      else if (ageMs <= 60 * DAY_MS) score += 2;
      else if (ageMs <= 180 * DAY_MS) score += 1;
    }
  }

  return score;
}

function rankEntries(query, entries) {
  const queryTokens = tokenizeQuery(query);
  const preferredTypes = getPreferredTypes(query);

  const scored = entries
    .map((entry) => ({
      ...entry,
      score: scoreEntry(entry, query, queryTokens, preferredTypes),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });

  return scored.slice(0, 20);
}

function buildCitationPayload(entries) {
  return entries.slice(0, MAX_CITATIONS).map((entry, index) => ({
    id: `C${index + 1}`,
    type: entry.type,
    title: entry.title,
    excerpt: clipText(entry.excerpt, 280),
    path: entry.path,
    timestamp: entry.timestamp || null,
  }));
}

function prioritizeDocumentCitation(citations, documentContext) {
  if (!documentContext?.path) return citations;
  const promoted = {
    id: "C1",
    type: "document",
    title: documentContext.title,
    excerpt: clipText(
      documentContext.previewText || documentContext.excerpt || "Document selected for summary.",
      280
    ),
    path: documentContext.path,
    timestamp: documentContext.timestamp || null,
  };
  const merged = [promoted, ...citations.filter((item) => item.path !== promoted.path)];
  return merged.slice(0, MAX_CITATIONS).map((item, index) => ({
    ...item,
    id: `C${index + 1}`,
  }));
}

function restrictCitationsForDocumentSummary(citations, preferredPath) {
  const source = Array.isArray(citations) ? citations : [];
  if (source.length === 0) return [];
  const prioritized = preferredPath
    ? source.find((citation) => citation.path === preferredPath)
    : source.find((citation) => citation.type === "document") || source[0];

  if (!prioritized) return [];
  return [
    {
      ...prioritized,
      id: "C1",
    },
  ];
}

function pickDocumentForSummary({ query, documents, ranked }) {
  const rankedDocuments = ranked.filter((entry) => entry.type === "document");
  const sourceDocuments = Array.isArray(documents) ? documents : [];
  const docMap = new Map(sourceDocuments.map((doc) => [doc.sourceId, doc]));

  const quotedMatch = query.match(/["'`]{1}([^"'`]{4,})["'`]{1}/);
  if (quotedMatch?.[1]) {
    const needle = normalizeText(quotedMatch[1]);
    const quotedHit = sourceDocuments.find((doc) =>
      normalizeText(`${doc.title} ${doc.originalName || ""}`).includes(needle)
    );
    if (quotedHit) return quotedHit;
  }

  const queryTokens = tokenizeQuery(query).filter(
    (token) =>
      !["document", "file", "summary", "summarize", "summarise", "please"].includes(token)
  );

  let best = null;
  let bestScore = -1;
  for (const doc of sourceDocuments) {
    const haystack = normalizeText(`${doc.title} ${doc.originalName || ""} ${doc.excerpt || ""}`);
    let score = 0;
    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = doc;
    }
  }

  if (best && bestScore > 0) {
    return best;
  }

  if (rankedDocuments.length > 0) {
    return docMap.get(rankedDocuments[0].sourceId) || rankedDocuments[0];
  }

  return sourceDocuments[0] || null;
}

async function loadDocumentSummaryContext({ documentId, token }) {
  if (!documentId || !ObjectId.isValid(documentId)) return null;
  const documentsCollection = await getDocumentsCollection();
  const document = await documentsCollection.findOne({ _id: new ObjectId(documentId) });
  if (!document) return null;
  if (!hasAccessToDocument(document, token)) return null;

  const fileBuffer = getFileBuffer(document.file);
  const extraction = extractTextFromBuffer(
    fileBuffer,
    document.contentType,
    document.originalName || document.title || ""
  );

  return {
    sourceId: documentId,
    title: document.title || document.originalName || "Untitled document",
    path: `/documentation?highlight=${encodeURIComponent(documentId)}`,
    contentType: document.contentType || "",
    timestamp: toIsoOrNull(document.createdAt),
    excerpt: clipText(document.description || "", 180),
    previewText: summarizeExtractedText(extraction.text),
    text: extraction.text,
    extractStatus: extraction.status,
  };
}

function buildFallbackAnswer(query, citations, options = {}) {
  const { documentSummaryContext } = options;
  if (documentSummaryContext && !documentSummaryContext.text) {
    const sourceId =
      citations.find((citation) => citation.path === documentSummaryContext.path)?.id ||
      citations[0]?.id;
    let extractionHint =
      "I could not extract readable text from this file format. Upload a text-searchable PDF/DOCX or paste the content, then ask me again.";
    if (documentSummaryContext.extractStatus === "pdf_ocr_required") {
      extractionHint =
        "This file appears to be a scanned/image PDF. Run OCR on it (or upload a text-searchable version), then ask me again.";
    } else if (documentSummaryContext.extractStatus === "xlsx_text_unavailable") {
      extractionHint =
        "I could not read worksheet cells from this XLSX file. Save it as CSV (or clean XLSX with normal cell text) and upload again.";
    } else if (documentSummaryContext.extractStatus === "xls_text_unavailable") {
      extractionHint =
        "Legacy XLS is not supported for reliable extraction. Save it as XLSX or CSV and upload again.";
    } else if (documentSummaryContext.extractStatus === "presentation_text_unavailable") {
      extractionHint =
        "PowerPoint extraction is limited right now. Export slides to PDF/DOCX or paste slide text and ask again.";
    }
    return `I found "${documentSummaryContext.title}", but ${extractionHint}${
      sourceId ? ` [${sourceId}]` : ""
    }.`;
  }
  if (documentSummaryContext?.text) {
    const sourceId =
      citations.find((citation) => citation.path === documentSummaryContext.path)?.id ||
      citations[0]?.id;
    const summary =
      documentSummaryContext.extractStatus === "xlsx_text"
        ? summarizeSpreadsheetExtract(documentSummaryContext.text)
        : summarizeExtractedText(documentSummaryContext.text);
    if (summary) {
      return `Summary of "${documentSummaryContext.title}": ${summary}${
        sourceId ? ` [${sourceId}]` : ""
      }`;
    }
  }

  if (!citations.length) {
    return `I could not find matching records for "${query}". Try adding names, project titles, tags, or time context.`;
  }

  const lead = `I found ${citations.length} relevant portal source${
    citations.length === 1 ? "" : "s"
  } for "${query}".`;
  const lines = citations.slice(0, 4).map((citation) => {
    const excerpt = citation.excerpt ? ` ${citation.excerpt}` : "";
    return `- ${citation.title}.${excerpt} [${citation.id}]`;
  });

  return [lead, ...lines].join("\n");
}

function isLowQualitySummaryAnswer(answer, documentSummaryContext) {
  const normalized = cleanExtractedText(answer).toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 40) return true;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 7) return true;

  const titleNormalized = normalizeText(documentSummaryContext?.title || "");
  const titleWithoutExtension = titleNormalized.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  if (titleNormalized && (normalized === titleNormalized || normalized === titleWithoutExtension)) {
    return true;
  }

  return false;
}

function buildPrompt({ query, citations, documentSummaryContext }) {
  const isSpreadsheetSummary =
    documentSummaryContext?.contentType?.includes("spreadsheetml") ||
    /\.xlsx$/i.test(documentSummaryContext?.title || "");
  const evidenceLines = citations.map((citation) => {
    const timeLabel = citation.timestamp ? ` | time=${formatTimeLabel(citation.timestamp)}` : "";
    return `${citation.id} | type=${citation.type} | title=${citation.title} | excerpt=${citation.excerpt} | path=${citation.path}${timeLabel}`;
  });

  const promptLines = [
    "You are Ask-the-Portal Assistant for an internal company hub.",
    "Answer only from the provided evidence.",
    "If evidence is insufficient, say that clearly.",
    "Use citation tags inline like [C1], [C2].",
    "Keep the answer concise, factual, and directly useful.",
    "If a target document content block is provided, prioritize summarizing that document.",
    'Return strict JSON with schema: {"answer": string, "citationIds": string[]}.',
    "",
    `Question: ${query}`,
    "",
    "Evidence:",
    ...evidenceLines,
  ];

  if (documentSummaryContext?.text) {
    promptLines.push(
      "",
      "Target document content for summary:",
      `title=${documentSummaryContext.title}`,
      `contentType=${documentSummaryContext.contentType || "unknown"}`,
      documentSummaryContext.text,
      "",
      "If this is a summary request, provide 3-6 short factual bullet points and include dates/names when present."
    );
    if (isSpreadsheetSummary) {
      promptLines.push(
        "For spreadsheet content, identify likely column headers, notable rows, and obvious outliers/totals."
      );
    }
  }

  return promptLines.join("\n");
}

async function generateOllamaAnswer({ query, citations, documentSummaryContext }) {
  if (!OLLAMA_BASE_URL || !OLLAMA_MODEL_DEFAULT) {
    throw new Error("Ollama configuration missing.");
  }

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL_DEFAULT,
      prompt: buildPrompt({ query, citations, documentSummaryContext }),
      stream: false,
      format: "json",
      options: {
        temperature: 0.15,
        num_predict: 700,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Ollama request failed (${response.status}).`);
  }
  if (payload?.error) {
    throw new Error(payload.error);
  }

  const rawText = typeof payload?.response === "string" ? payload.response.trim() : "";
  const parsed = parseJsonFromText(rawText);
  if (!parsed || typeof parsed.answer !== "string") {
    throw new Error("Ollama returned invalid Ask-the-Portal JSON.");
  }

  const answer = clipText(parsed.answer, 1800);
  const requestedIds = Array.isArray(parsed.citationIds)
    ? parsed.citationIds
        .map((value) => value?.toString?.().trim())
        .filter(Boolean)
        .slice(0, MAX_CITATIONS)
    : [];
  const validCitationIdSet = new Set(citations.map((citation) => citation.id));
  const requestedValidIds = Array.from(
    new Set(requestedIds.filter((id) => validCitationIdSet.has(id)))
  );

  const selectedCitationIds = requestedValidIds.length
    ? requestedValidIds
    : citations.slice(0, 4).map((citation) => citation.id);
  const sanitizedAnswer = answer
    .replace(/\[(C\d+)\]/g, (match, id) => (validCitationIdSet.has(id) ? match : ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    source: "ollama",
    model: OLLAMA_MODEL_DEFAULT,
    answer:
      selectedCitationIds.length > 0 &&
      !/\[C\d+\]/.test(sanitizedAnswer)
        ? `${sanitizedAnswer}\n\nSources: ${selectedCitationIds.map((id) => `[${id}]`).join(", ")}`
        : sanitizedAnswer,
  };
}

export async function POST(request) {
  let token;

  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.sub) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const query = (body?.query || "").toString().trim();
    if (query.length < 4) {
      return NextResponse.json(
        { error: "Please enter a more specific question (at least 4 characters)." },
        { status: 400 }
      );
    }
    if (query.length > 500) {
      return NextResponse.json(
        { error: "Question is too long. Keep it under 500 characters." },
        { status: 400 }
      );
    }

    const userDepartments = await getUserDepartments(token);

    const [updates, projects, documents, directory] = await Promise.all([
      loadUpdates(token, userDepartments),
      loadProjects(token, userDepartments),
      loadDocuments(token),
      loadDirectoryUsers(),
    ]);

    const ranked = rankEntries(query, [...updates, ...projects, ...documents, ...directory]);
    let citations = buildCitationPayload(ranked);
    const warnings = [];
    const summaryIntent =
      isDocumentSummaryIntent(query) || inferDocumentSummaryIntent(query, documents);
    let documentSummaryContext = null;
    let forceLocalSummaryOnly = false;

    if (summaryIntent) {
      const targetDocument = pickDocumentForSummary({
        query,
        documents,
        ranked,
      });

      if (targetDocument?.sourceId) {
        try {
          documentSummaryContext = await loadDocumentSummaryContext({
            documentId: targetDocument.sourceId,
            token,
          });

          if (!documentSummaryContext) {
            forceLocalSummaryOnly = true;
            warnings.push(
              "I could not access the requested document for summarization."
            );
          } else {
            citations = prioritizeDocumentCitation(citations, documentSummaryContext);
            citations = restrictCitationsForDocumentSummary(
              citations,
              documentSummaryContext.path
            );
            if (!documentSummaryContext.text) {
              forceLocalSummaryOnly = true;
              let extractionWarning =
                "Document text extraction is limited for this file format; summary may use only available metadata.";
              if (documentSummaryContext.extractStatus === "pdf_ocr_required") {
                extractionWarning =
                  "This file appears to be scanned/image-based. Run OCR or upload a text-searchable version for accurate summarization.";
              } else if (documentSummaryContext.extractStatus === "xlsx_text_unavailable") {
                extractionWarning =
                  "Spreadsheet extraction failed for this XLSX. Save as CSV or simplify the sheet structure, then upload again.";
              } else if (documentSummaryContext.extractStatus === "xls_text_unavailable") {
                extractionWarning =
                  "Legacy XLS is not supported for extraction. Save as XLSX or CSV and upload again.";
              } else if (documentSummaryContext.extractStatus === "presentation_text_unavailable") {
                extractionWarning =
                  "PowerPoint extraction is limited. Export to PDF/DOCX or paste slide text for summarization.";
              }
              warnings.push(
                extractionWarning
              );
            }
          }
        } catch (summaryError) {
          forceLocalSummaryOnly = true;
          warnings.push(
            "Unable to load document content right now, so I used metadata only."
          );
          await logError("Failed to load target document for summary intent", summaryError, {
            route: "/api/ask-the-portal",
            userId: token?.sub,
            documentId: targetDocument?.sourceId,
          });
        }
      } else {
        forceLocalSummaryOnly = true;
        warnings.push(
          "I could not identify which document to summarize. Mention part of the document title."
        );
      }
    }

    let result = {
      source: "fallback",
      model: "retrieval-fallback",
      answer: buildFallbackAnswer(query, citations, { documentSummaryContext }),
    };

    if (citations.length > 0 && !(summaryIntent && forceLocalSummaryOnly)) {
      try {
        result = await generateOllamaAnswer({
          query,
          citations,
          documentSummaryContext,
        });
        if (
          summaryIntent &&
          documentSummaryContext?.text &&
          isLowQualitySummaryAnswer(result.answer, documentSummaryContext)
        ) {
          warnings.push(
            "Model summary was too short or low-confidence; deterministic summary was used instead."
          );
          result = {
            source: "fallback",
            model: "retrieval-fallback",
            answer: buildFallbackAnswer(query, citations, { documentSummaryContext }),
          };
        }
      } catch (generationError) {
        warnings.push(
          `LLM answer unavailable (${generationError.message || "unknown error"}). Fallback answer was used.`
        );
        await logError("Ask-the-Portal Ollama generation failed; using fallback", generationError, {
          route: "/api/ask-the-portal",
          userId: token?.sub,
        });
      }
    } else if (citations.length === 0) {
      warnings.push("No direct evidence match was found in accessible records.");
    }

    return NextResponse.json({
      query,
      source: result.source,
      model: result.model,
      generatedAt: new Date().toISOString(),
      answer: result.answer,
      citations,
      warnings,
      documentSummaryTarget: documentSummaryContext
        ? {
            title: documentSummaryContext.title,
            path: documentSummaryContext.path,
            extractedText: Boolean(documentSummaryContext.text),
            extractionStatus: documentSummaryContext.extractStatus || null,
          }
        : null,
      signals: {
        updates: updates.length,
        projects: projects.length,
        documents: documents.length,
        directory: directory.length,
      },
    });
  } catch (error) {
    await logError("Failed to answer Ask-the-Portal query", error, {
      route: "/api/ask-the-portal",
      method: request?.method,
      url: request?.url,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to answer your question right now." },
      { status: 500 }
    );
  }
}
