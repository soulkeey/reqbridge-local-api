(() => {
  "use strict";

  const REQBRIDGE_CONFIG = {
    extensionId: "soulkey-tools.reqbridge-local-api",
    marketplaceUrl: "https://marketplace.visualstudio.com/items?itemName=soulkey-tools.reqbridge-local-api",
    repoUrl: "https://github.com/soulkeey/reqbridge-local-api",
    vsixReleaseUrl: "https://github.com/soulkeey/reqbridge-local-api/releases/latest",
    cliInstallCommand: "code --install-extension soulkey-tools.reqbridge-local-api",
    supportEmail: "soulkey529@gmail.com",
    reservationEndpoint: "",
    checkout: {
      personal: {
        label: "$19 one-time (RMB 139)",
        mianbaoduoUrl: "",
        creemUrl: "",
        gumroadUrl: "",
      },
      team: {
        label: "$29 one-time (RMB 199)",
        mianbaoduoUrl: "",
        creemUrl: "",
        gumroadUrl: "",
      },
    },
  };

  if (typeof globalThis !== "undefined") {
    globalThis.REQBRIDGE_CONFIG = REQBRIDGE_CONFIG;
  }

  document.documentElement.classList.add("js-ready");

  // 1. Progressive scroll reveal (guarded for Node vm sandbox)
  const revealEls = [...document.querySelectorAll(".reveal")];
  function revealVisible() {
    const vh = typeof window !== "undefined" && window.innerHeight ? window.innerHeight : 900;
    for (const el of revealEls) {
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { top: 0 };
      if (rect.top < vh * 0.96) el.classList.add("is-visible");
    }
  }
  if (typeof IntersectionObserver !== "undefined") {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08 }
    );
    revealEls.forEach((el) => io.observe(el));
    revealVisible();
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("scroll", revealVisible, { passive: true });
  }
  setTimeout(() => revealEls.forEach((el) => el.classList.add("is-visible")), 1200);

  // 2. Pure-JS Helpers (no Node builtins, no unguarded Web APIs)
  function safeNowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  function encodeUtf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(str);
    }
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const c2 = str.charCodeAt(++i);
        const cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
        out.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f)
        );
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function utf8ToBase64(str) {
    const bytes = encodeUtf8Bytes(str);
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      const triplet = (b0 << 16) | (b1 << 8) | b2;
      out += B64_ALPHABET[(triplet >> 18) & 63];
      out += B64_ALPHABET[(triplet >> 12) & 63];
      out += i + 1 < bytes.length ? B64_ALPHABET[(triplet >> 6) & 63] : "=";
      out += i + 2 < bytes.length ? B64_ALPHABET[triplet & 63] : "=";
    }
    return out;
  }

  function base64UrlToUtf8(b64url) {
    const norm = String(b64url || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
    const bytes = [];
    for (let i = 0; i < padded.length; i += 4) {
      const c0 = B64_ALPHABET.indexOf(padded[i]);
      const c1 = B64_ALPHABET.indexOf(padded[i + 1]);
      const c2 = padded[i + 2] === "=" ? -1 : B64_ALPHABET.indexOf(padded[i + 2]);
      const c3 = padded[i + 3] === "=" ? -1 : B64_ALPHABET.indexOf(padded[i + 3]);
      if (c0 < 0 || c1 < 0) throw new Error("Invalid base64url");
      const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
      bytes.push((n >> 16) & 255);
      if (c2 >= 0) bytes.push((n >> 8) & 255);
      if (c3 >= 0) bytes.push(n & 255);
    }
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(new Uint8Array(bytes));
    }
    return bytes.map((b) => String.fromCharCode(b)).join("");
  }

  async function copyText(text, btn) {
    const prev = btn ? btn.textContent : "";
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        if (typeof document.execCommand === "function") document.execCommand("copy");
        document.body.removeChild(ta);
      }
      if (btn) btn.textContent = "Copied!";
    } catch {
      if (btn) btn.textContent = "Copy manually";
    }
    if (btn) {
      setTimeout(() => {
        btn.textContent = prev;
      }, 1500);
    }
  }

  function triggerBlobDownload(filename, blobOrText, mimeType) {
    if (typeof Blob === "undefined") return null;
    const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: mimeType || "text/plain" });
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (typeof URL.revokeObjectURL === "function") {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
    return blob;
  }

  // Pure-JS CRC-32 + PKZIP STORE (method 0) builder
  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildZipBytes(files) {
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encodeUtf8Bytes(file.name);
      const dataBytes = encodeUtf8Bytes(file.content);
      const sum = crc32(dataBytes);

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, sum, true);
      lv.setUint32(18, dataBytes.length, true);
      lv.setUint32(22, dataBytes.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      localChunks.push(localHeader, dataBytes);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, sum, true);
      cv.setUint32(20, dataBytes.length, true);
      cv.setUint32(24, dataBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralChunks.push(central);

      offset += localHeader.length + dataBytes.length;
    }

    const centralSize = centralChunks.reduce((acc, c) => acc + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const totalLen = offset + centralSize + eocd.length;
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of localChunks) { out.set(c, pos); pos += c.length; }
    for (const c of centralChunks) { out.set(c, pos); pos += c.length; }
    out.set(eocd, pos);
    return out;
  }

  // 3. IDE Tab Switching
  const tabBtns = [...document.querySelectorAll(".ide-tab[data-tab]")];
  const panels = [...document.querySelectorAll(".ide-panel[data-panel]")];
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      tabBtns.forEach((b) => {
        const active = b.dataset.tab === target;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((p) => {
        p.hidden = p.dataset.panel !== target;
      });
    });
  });

  // 4. Core-Parity Multi-Format Parsers & Transpilers (Tab 1)
  const BRU_BLOCK_RE =
    /^(?:meta|get|post|put|patch|delete|head|options|headers|query|params:query|params:path|body(?::[a-z0-9-]+)?|auth(?::[a-z0-9-]+)?|vars(?::[a-z0-9-]+)?|tests|assert)\s*\{/m;
  const HTTP_LINE_RE = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/m;
  const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
  const BUILTIN_VARS = new Set(["$guid", "$randomInt", "$timestamp", "$datetime", "$localDatetime"]);

  function safeDecode(val) {
    if (val.includes("{{")) return val;
    try {
      return decodeURIComponent(val.replace(/\+/g, " "));
    } catch {
      return val;
    }
  }

  function splitUrlAndQuery(rawUrl) {
    const qIdx = rawUrl.indexOf("?");
    if (qIdx === -1) return { baseUrl: rawUrl, query: [] };
    const baseUrl = rawUrl.slice(0, qIdx);
    const query = [];
    for (const part of rawUrl.slice(qIdx + 1).split("&")) {
      if (!part) continue;
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) query.push({ key: safeDecode(part), value: "" });
      else query.push({ key: safeDecode(part.slice(0, eqIdx)), value: safeDecode(part.slice(eqIdx + 1)) });
    }
    return { baseUrl, query };
  }

  function makeRequestId(name, index) {
    const slug = String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return slug ? `${slug}_${index + 1}` : `req_${index + 1}`;
  }

  function kvArrayToMap(arr) {
    const out = {};
    if (!Array.isArray(arr)) return out;
    for (const entry of arr) {
      if (entry && typeof entry === "object" && entry.key) {
        out[String(entry.key)] = String(entry.value ?? "");
      }
    }
    return out;
  }

  function parsePostmanAuth(raw) {
    if (!raw || typeof raw !== "object") return undefined;
    const type = String(raw.type || "").toLowerCase();
    if (type === "noauth" || type === "none") return { type: "none" };
    if (type === "bearer") {
      const kv = kvArrayToMap(raw.bearer);
      return { type: "bearer", token: kv.token ?? "{{token}}" };
    }
    if (type === "apikey") {
      const kv = kvArrayToMap(raw.apikey);
      return {
        type: "apikey",
        key: kv.key || "X-Api-Key",
        value: kv.value ?? "{{apiKey}}",
        in: kv.in === "query" ? "query" : "header",
      };
    }
    if (type === "basic") {
      const kv = kvArrayToMap(raw.basic);
      return { type: "basic", username: kv.username ?? "", password: kv.password ?? "" };
    }
    return undefined;
  }

  function parsePostmanUrl(rawUrl) {
    if (typeof rawUrl === "string") return splitUrlAndQuery(rawUrl);
    if (!rawUrl || typeof rawUrl !== "object") return { baseUrl: "{{baseUrl}}/", query: [] };
    let baseStr = "";
    if (typeof rawUrl.raw === "string" && rawUrl.raw.trim()) {
      baseStr = rawUrl.raw.trim();
    } else {
      const proto = typeof rawUrl.protocol === "string" ? `${rawUrl.protocol}://` : "";
      const host = Array.isArray(rawUrl.host) ? rawUrl.host.join(".") : String(rawUrl.host || "");
      const port = rawUrl.port !== undefined && rawUrl.port !== null && String(rawUrl.port).trim() ? `:${String(rawUrl.port).trim()}` : "";
      const rawPath = Array.isArray(rawUrl.path) ? rawUrl.path.join("/") : String(rawUrl.path || "").replace(/^\/+/, "");
      const p = rawPath ? `/${rawPath}` : "";
      baseStr = `${proto}${host}${port}${p}`;
    }
    const split = splitUrlAndQuery(baseStr);
    if (Array.isArray(rawUrl.query)) {
      const structured = [];
      for (const q of rawUrl.query) {
        if (q && typeof q === "object" && !q.disabled && q.key) {
          structured.push({ key: String(q.key), value: String(q.value ?? "") });
        }
      }
      return { baseUrl: split.baseUrl, query: structured };
    }
    return split;
  }

  function parsePostmanBody(body, headers) {
    if (!body || typeof body !== "object") return undefined;
    const mode = String(body.mode || "none").toLowerCase();
    const ctHeader = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1];
    if (mode === "raw" && typeof body.raw === "string") {
      const lang = body.options?.raw?.language;
      const inferredCt = lang === "json" ? "application/json" : lang === "xml" ? "application/xml" : lang === "text" ? "text/plain" : undefined;
      return { mode: "raw", raw: body.raw, contentType: ctHeader || inferredCt };
    }
    if (mode === "urlencoded" && Array.isArray(body.urlencoded)) {
      const fields = body.urlencoded
        .filter((p) => p && typeof p === "object" && !p.disabled && p.key)
        .map((p) => ({ key: String(p.key), value: String(p.value ?? "") }));
      return {
        mode: "urlencoded",
        contentType: ctHeader || "application/x-www-form-urlencoded",
        fields,
        raw: fields.map((f) => `${f.key}=${f.value}`).join("&"),
      };
    }
    if (mode === "formdata" && Array.isArray(body.formdata)) {
      const fields = body.formdata
        .filter((p) => p && typeof p === "object" && !p.disabled && p.key)
        .map((p) => ({
          key: String(p.key),
          value: String(p.type === "file" ? p.src ?? "" : p.value ?? ""),
          type: p.type === "file" ? "file" : "text",
        }));
      return { mode: "formdata", contentType: ctHeader || "multipart/form-data", fields };
    }
    return undefined;
  }

  function parsePostmanCollection(obj) {
    if (!Array.isArray(obj.item)) {
      throw new Error("Postman Collection v2.1 JSON must include an 'item' array.");
    }
    const variables = {};
    if (Array.isArray(obj.variable)) {
      for (const v of obj.variable) {
        if (v && typeof v === "object" && v.key && !v.disabled) {
          variables[String(v.key)] = String(v.value ?? "");
        }
      }
    }
    const requests = [];
    const warnings = [];
    const rootAuth = parsePostmanAuth(obj.auth);

    function walk(items, parentAuth, folders) {
      for (const node of items) {
        if (!node || typeof node !== "object") continue;
        const folderAuth = parsePostmanAuth(node.auth) ?? parentAuth;
        if (Array.isArray(node.item)) {
          walk(node.item, folderAuth, [...folders, String(node.name || "Folder")]);
          continue;
        }
        if (!node.request || typeof node.request !== "object") continue;
        const req = node.request;
        const method = String(req.method || "GET").toUpperCase();
        const { baseUrl, query } = parsePostmanUrl(req.url);
        const headers = {};
        if (Array.isArray(req.header)) {
          for (const h of req.header) {
            if (h && typeof h === "object" && !h.disabled && h.key) {
              headers[String(h.key)] = String(h.value ?? "");
            }
          }
        }
        const explicitAuth = parsePostmanAuth(req.auth);
        const effectiveAuth = explicitAuth ?? folderAuth;
        const inheritedAuth = !explicitAuth && Boolean(folderAuth && folderAuth.type !== "none");
        const tests = [];
        if (Array.isArray(node.event)) {
          for (const ev of node.event) {
            if (!ev || typeof ev !== "object") continue;
            const exec = ev.script?.exec;
            const lines = Array.isArray(exec) ? exec.map((l) => String(l).trim()).filter(Boolean) : [];
            if (ev.listen === "test") tests.push(...lines);
            else if (ev.listen === "prerequest" && lines.length > 0) {
              warnings.push(`Pre-request script detected on "${String(node.name || method)}".`);
            }
          }
        }
        const name = String(node.name || `${method} ${baseUrl}`);
        requests.push({
          id: makeRequestId(name, requests.length),
          name,
          folder: folders,
          method,
          url: baseUrl || "/",
          headers,
          query,
          body: parsePostmanBody(req.body, headers),
          auth: effectiveAuth,
          tests,
          sourceFormat: "postman",
          inheritedAuth,
        });
      }
    }

    walk(obj.item, rootAuth, []);
    return {
      name: String(obj.info?.name || "Postman Collection"),
      baseUrl: variables.baseUrl || variables.base_url,
      variables,
      requests,
      warnings,
    };
  }

  function buildFolderPath(containerId, folderMap) {
    const out = [];
    const visited = new Set();
    let cur = containerId;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const folder = folderMap.get(cur);
      if (!folder) break;
      out.unshift(folder.name);
      cur = folder.containerId;
    }
    return out;
  }

  function parseThunderAuth(raw) {
    if (!raw || typeof raw !== "object") return undefined;
    const type = String(raw.type || "").toLowerCase();
    if (type === "none") return { type: "none" };
    if (type === "bearer") return { type: "bearer", token: String(raw.bearer ?? "{{token}}") };
    if (type === "basic") return { type: "basic", username: String(raw.username ?? ""), password: String(raw.password ?? "") };
    if (type === "api-key" || type === "apikey") {
      return {
        type: "apikey",
        key: String(raw.apiKeyPrefix || raw.key || "X-Api-Key"),
        value: String(raw.apiKeyValue || raw.value || "{{apiKey}}"),
        in: raw.apiKeyIn === "query" ? "query" : "header",
      };
    }
    return undefined;
  }

  function parseThunderBody(raw) {
    if (!raw || typeof raw !== "object") return undefined;
    const type = String(raw.type || "").toLowerCase();
    if (type === "json" || type === "text" || type === "xml") {
      const contentType = type === "json" ? "application/json" : type === "xml" ? "application/xml" : "text/plain";
      return { mode: "raw", raw: typeof raw.raw === "string" ? raw.raw : JSON.stringify(raw.raw ?? ""), contentType };
    }
    if ((type === "formencoded" || type === "form") && Array.isArray(raw.form)) {
      const fields = raw.form
        .filter((f) => f && typeof f === "object" && f.name)
        .map((f) => ({ key: String(f.name), value: String(f.value ?? "") }));
      return { mode: "urlencoded", contentType: "application/x-www-form-urlencoded", fields, raw: fields.map((f) => `${f.key}=${f.value}`).join("&") };
    }
    if (type === "formdata" && Array.isArray(raw.form)) {
      const fields = raw.form
        .filter((f) => f && typeof f === "object" && f.name)
        .map((f) => ({ key: String(f.name), value: String(f.value ?? ""), type: f.isFile ? "file" : "text" }));
      return { mode: "formdata", contentType: "multipart/form-data", fields };
    }
    return undefined;
  }

  function parseThunderCollection(obj) {
    if (!Array.isArray(obj.requests)) {
      throw new Error("Thunder Client JSON must include a 'requests' array.");
    }
    const folderMap = new Map();
    if (Array.isArray(obj.folders)) {
      for (const f of obj.folders) {
        if (f && typeof f === "object" && typeof f._id === "string") {
          folderMap.set(f._id, { name: String(f.name || "Folder"), containerId: typeof f.containerId === "string" ? f.containerId : undefined });
        }
      }
    }
    const requests = [];
    obj.requests.forEach((rec, idx) => {
      if (!rec || typeof rec !== "object") return;
      const method = String(rec.method || "GET").toUpperCase();
      const { baseUrl, query } = splitUrlAndQuery(String(rec.url || ""));
      if (Array.isArray(rec.params)) {
        for (const p of rec.params) {
          if (p && typeof p === "object" && !p.isDisabled && p.name && !p.isPath) {
            const key = String(p.name);
            const value = String(p.value ?? "");
            if (!query.some((q) => q.key === key && q.value === value)) query.push({ key, value });
          }
        }
      }
      const headers = {};
      if (Array.isArray(rec.headers)) {
        for (const h of rec.headers) {
          if (h && typeof h === "object" && !h.isDisabled && h.name) headers[String(h.name)] = String(h.value ?? "");
        }
      }
      const tests = [];
      if (Array.isArray(rec.tests)) {
        for (const t of rec.tests) {
          if (!t || typeof t !== "object") continue;
          if (t.type === "res-code" && t.value !== undefined) tests.push(`status == ${String(t.value)}`);
          else if (t.type === "json-query" && t.custom && t.value !== undefined) tests.push(`${String(t.custom)} == ${String(t.value)}`);
          else if (t.type && t.value !== undefined) tests.push(`${String(t.type)}: ${String(t.value)}`);
        }
      }
      const name = String(rec.name || `${method} ${baseUrl}`);
      requests.push({
        id: makeRequestId(name, idx),
        name,
        folder: buildFolderPath(typeof rec.containerId === "string" ? rec.containerId : undefined, folderMap),
        method,
        url: baseUrl || "/",
        headers,
        query,
        body: parseThunderBody(rec.body),
        auth: parseThunderAuth(rec.auth),
        tests,
        sourceFormat: "thunder",
      });
    });
    return { name: String(obj.collectionName || obj.name || "Thunder Client Collection"), variables: {}, requests, warnings: [] };
  }

  function scanBruBlocks(rawText) {
    const blocks = [];
    const text = rawText.replace(/\r\n/g, "\n");
    let i = 0;
    let line = 1;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\n") { line++; i++; continue; }
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === "#") { while (i < text.length && text[i] !== "\n") i++; continue; }
      const headerStart = i;
      const startLine = line;
      while (i < text.length && text[i] !== "{" && text[i] !== "\n") i++;
      if (i >= text.length || text[i] !== "{") {
        throw new Error(`Invalid .bru syntax near line ${startLine}: expected '{'.`);
      }
      const name = text.slice(headerStart, i).trim();
      if (!name) throw new Error(`Missing block name at line ${startLine}.`);
      i++;
      const bodyStart = i;
      const lowerName = name.toLowerCase();
      const isJson = lowerName === "body:json";
      const isJs = lowerName === "tests" || lowerName.startsWith("script:");
      let depth = 1;
      let quote = null;
      let escaped = false;
      while (i < text.length && depth > 0) {
        const c = text[i];
        if (isJson || isJs) {
          if (quote) {
            if (c === "\n") { line++; if (quote !== "`") quote = null; escaped = false; }
            else if (escaped) escaped = false;
            else if (c === "\\") escaped = true;
            else if (c === quote) quote = null;
          } else {
            if (isJs && c === "/" && text[i + 1] === "/") {
              while (i < text.length && text[i] !== "\n") i++;
              continue;
            }
            if (isJs && c === "/" && text[i + 1] === "*") {
              i += 2;
              while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
                if (text[i] === "\n") line++;
                i++;
              }
              if (i < text.length) i += 2;
              continue;
            }
            if (c === "\n") line++;
            else if ((isJson && c === '"') || (isJs && (c === '"' || c === "'" || c === "`"))) quote = c;
            else if (c === "{") depth++;
            else if (c === "}") depth--;
          }
        } else {
          if (c === "\n") line++;
          else if (c === "{") depth++;
          else if (c === "}") depth--;
        }
        i++;
      }
      if (depth !== 0) throw new Error(`Unclosed '{' in block '${name}' at line ${startLine}.`);
      blocks.push({ name, body: text.slice(bodyStart, i - 1), startLine });
    }
    return blocks;
  }

  function parseKvBlock(body) {
    const result = {};
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith("~")) continue;
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const key = line.slice(0, colon).trim();
      if (key) result[key] = line.slice(colon + 1).trim();
    }
    return result;
  }

  function unindentBlock(body) {
    const lines = body.replace(/^\n+|\n+$/g, "").split("\n");
    const indents = lines.filter((l) => l.trim().length > 0).map((l) => (l.match(/^\s*/) || [""])[0].length);
    const minIndent = indents.length ? Math.min(...indents) : 0;
    return lines.map((l) => l.slice(minIndent)).join("\n");
  }

  function extractBruAuth(blocks) {
    const methodBlock = blocks.find((b) => HTTP_METHODS.has(b.name.toLowerCase()));
    const authBlock = blocks.find((b) => b.name.toLowerCase() === "auth");
    const authMode = (
      (methodBlock ? parseKvBlock(methodBlock.body).auth : undefined) ??
      (authBlock ? parseKvBlock(authBlock.body).mode : undefined)
    )?.toLowerCase();
    if (authMode === "none") return { auth: { type: "none" }, authMode };
    if (authMode === "inherit") return { auth: undefined, authMode };
    for (const b of blocks) {
      const lower = b.name.toLowerCase();
      const kv = parseKvBlock(b.body);
      if (lower === "auth:none") return { auth: { type: "none" }, authMode: authMode ?? "none" };
      if (lower === "auth:bearer") return { auth: { type: "bearer", token: kv.token ?? "{{token}}" }, authMode };
      if (lower === "auth:basic") return { auth: { type: "basic", username: kv.username ?? "", password: kv.password ?? "" }, authMode };
      if (lower === "auth:apikey") {
        return {
          auth: { type: "apikey", key: kv.key ?? "X-Api-Key", value: kv.value ?? "{{apiKey}}", in: kv.placement === "query" ? "query" : "header" },
          authMode,
        };
      }
    }
    return { authMode };
  }

  function parseSingleBru(rawText) {
    const blocks = scanBruBlocks(rawText);
    const metaBlock = blocks.find((b) => b.name === "meta");
    const meta = metaBlock ? parseKvBlock(metaBlock.body) : {};
    const methodBlock = blocks.find((b) => HTTP_METHODS.has(b.name.toLowerCase()));
    if (!methodBlock) throw new Error("Bruno .bru file is missing an HTTP method block.");
    const methodKv = parseKvBlock(methodBlock.body);
    if (!methodKv.url) throw new Error(`Bruno '${methodBlock.name}' block is missing a url field.`);

    const { baseUrl, query } = splitUrlAndQuery(methodKv.url);
    const headers = {};
    let body;
    const tests = [];

    for (const b of blocks) {
      const lower = b.name.toLowerCase();
      if (lower === "headers") Object.assign(headers, parseKvBlock(b.body));
      else if (lower === "query" || lower === "params:query") {
        for (const [key, value] of Object.entries(parseKvBlock(b.body))) query.push({ key, value });
      } else if (lower === "body:json" || lower === "body:text" || lower === "body:xml") {
        const contentType = lower === "body:json" ? "application/json" : lower === "body:xml" ? "application/xml" : "text/plain";
        body = { mode: "raw", raw: unindentBlock(b.body), contentType };
      } else if (lower === "body:form-urlencoded") {
        const fields = Object.entries(parseKvBlock(b.body)).map(([key, value]) => ({ key, value }));
        body = { mode: "urlencoded", contentType: "application/x-www-form-urlencoded", fields, raw: fields.map((f) => `${f.key}=${f.value}`).join("&") };
      } else if (lower === "body:multipart-form") {
        const fields = Object.entries(parseKvBlock(b.body)).map(([key, value]) => ({ key, value, type: value.startsWith("@file(") ? "file" : "text" }));
        body = { mode: "formdata", contentType: "multipart/form-data", fields };
      } else if (lower === "assert") {
        for (const [k, v] of Object.entries(parseKvBlock(b.body))) tests.push(`${k}: ${v}`);
      } else if (lower === "tests") {
        for (const line of unindentBlock(b.body).split("\n")) if (line.trim()) tests.push(line.trim());
      }
    }

    const { auth } = extractBruAuth(blocks);
    const name = meta.name || `${methodBlock.name.toUpperCase()} ${baseUrl}`;
    return {
      name,
      variables: {},
      requests: [{
        id: makeRequestId(name, 0),
        name,
        folder: [],
        method: methodBlock.name.toUpperCase(),
        url: baseUrl,
        headers,
        query,
        body,
        auth,
        tests,
        sourceFormat: "bruno",
        inheritedAuth: false,
      }],
      warnings: [],
    };
  }

  function parseHttpFile(rawText) {
    const lines = rawText.replace(/\r\n/g, "\n").split("\n");
    const variables = {};
    const blocks = [];
    let currentBlock = [];
    const varRe = /^\s*@([A-Za-z0-9_.-]+)\s*=\s*(.*)$/;

    for (const line of lines) {
      if (/^\s*###/.test(line)) {
        if (currentBlock.some((l) => l.trim() !== "")) blocks.push(currentBlock);
        currentBlock = [line];
        continue;
      }
      currentBlock.push(line);
    }
    if (currentBlock.some((l) => l.trim() !== "")) blocks.push(currentBlock);

    const requests = [];
    for (const block of blocks) {
      let title = "";
      let customName = "";
      let reqLineIdx = -1;
      const tests = [];
      for (let i = 0; i < block.length; i++) {
        const trimmed = block[i].trim();
        const varMatch = block[i].match(varRe);
        if (varMatch) { variables[varMatch[1]] = varMatch[2].trim(); continue; }
        if (trimmed.startsWith("###")) title = trimmed.replace(/^###\s*/, "").trim();
        else if (/^#\s*@name\s+/i.test(trimmed)) customName = trimmed.replace(/^#\s*@name\s+/i, "").trim();
        else if (/^#\s*@assert\s+/i.test(trimmed)) tests.push(trimmed.replace(/^#\s*@assert\s+/i, "").trim());
        else if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/i.test(trimmed)) { reqLineIdx = i; break; }
      }
      if (reqLineIdx === -1) continue;

      const reqParts = block[reqLineIdx].trim().split(/\s+/);
      const method = reqParts[0].toUpperCase();
      let fullUrl = reqParts[1];
      let idx = reqLineIdx + 1;
      while (idx < block.length && /^\s*[?&]\S+/.test(block[idx])) { fullUrl += block[idx].trim(); idx++; }

      const headers = {};
      while (idx < block.length && block[idx].trim() !== "") {
        const line = block[idx];
        const varMatch = line.match(varRe);
        if (varMatch) { variables[varMatch[1]] = varMatch[2].trim(); idx++; continue; }
        if (/^\s*[#\/]/.test(line)) {
          if (/^#\s*@assert\s+/i.test(line.trim())) tests.push(line.trim().replace(/^#\s*@assert\s+/i, "").trim());
          idx++; continue;
        }
        const colon = line.indexOf(":");
        if (colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
        idx++;
      }

      const bodyLines = [];
      for (let j = idx + 1; j < block.length; j++) {
        const trimmed = block[j].trim();
        if (/^#\s*@assert\s+/i.test(trimmed)) tests.push(trimmed.replace(/^#\s*@assert\s+/i, "").trim());
        else bodyLines.push(block[j]);
      }
      let cut = bodyLines.length;
      for (let k = bodyLines.length - 1; k >= 0; k--) {
        const trimmed = bodyLines[k].trim();
        const varMatch = bodyLines[k].match(varRe);
        if (varMatch) { variables[varMatch[1]] = varMatch[2].trim(); cut = k; }
        else if (trimmed === "" || /^[#/]/.test(trimmed)) continue;
        else break;
      }
      bodyLines.length = cut;
      const rawBody = bodyLines.join("\n").trim();
      const { baseUrl, query } = splitUrlAndQuery(fullUrl);
      const name = title || customName || `${method} ${baseUrl}`;
      const ctKey = Object.keys(headers).find((k) => k.toLowerCase() === "content-type");
      requests.push({
        id: makeRequestId(customName || name, requests.length),
        name,
        folder: [],
        method,
        url: baseUrl,
        headers,
        query,
        body: rawBody ? { mode: "raw", raw: rawBody, contentType: ctKey ? headers[ctKey] : undefined } : undefined,
        tests,
        sourceFormat: "http",
      });
    }
    if (requests.length === 0) throw new Error("No valid HTTP request lines found in .http file.");
    return { name: "HTTP File Collection", variables, requests, warnings: [] };
  }

  const OPENAPI_HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

  function stripYamlComment(line) {
    let quote = null;
    let esc = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (esc) esc = false;
        else if (quote === '"' && ch === "\\") esc = true;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
    }
    return line.trimEnd();
  }

  function unquoteYamlScalar(raw) {
    const s = raw.trim();
    if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
      try { return JSON.parse(s); } catch { return s.slice(1, -1); }
    }
    if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
    return s;
  }

  function parseYamlScalarValue(raw) {
    const s = raw.trim();
    if (s === "" || s === "null" || s === "~") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "{}") return {};
    if (s === "[]") return [];
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
      try { return JSON.parse(s); } catch { /* fall through */ }
      if (s.startsWith("[")) return s.slice(1, -1).split(",").map((x) => parseYamlScalarValue(x)).filter((x) => x !== null && x !== "");
    }
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return unquoteYamlScalar(s);
    if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
    return s;
  }

  function splitYamlColon(text) {
    let quote = null;
    let esc = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (esc) esc = false;
        else if (quote === '"' && ch === "\\") esc = true;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ":" && (i + 1 === text.length || /\s/.test(text[i + 1]))) return i;
    }
    return -1;
  }

  function parseYamlBlock(lines, idx, minIndent) {
    if (idx >= lines.length || lines[idx].indent < minIndent) return { value: {}, next: idx };
    if (lines[idx].text === "-" || lines[idx].text.startsWith("- ")) {
      const arr = [];
      const baseIndent = lines[idx].indent;
      while (idx < lines.length && lines[idx].indent === baseIndent && (lines[idx].text === "-" || lines[idx].text.startsWith("- "))) {
        const rest = lines[idx++].text.slice(1).trim();
        if (!rest) {
          const sub = idx < lines.length && lines[idx].indent > baseIndent ? parseYamlBlock(lines, idx, baseIndent + 1) : { value: null, next: idx };
          arr.push(sub.value); idx = sub.next;
        } else {
          const colon = splitYamlColon(rest);
          if (colon > 0) {
            const itemObj = {};
            const k = unquoteYamlScalar(rest.slice(0, colon));
            const vRaw = rest.slice(colon + 1).trim();
            if (vRaw === "" || vRaw === "|" || vRaw === ">") {
              const sub = idx < lines.length && lines[idx].indent > baseIndent ? parseYamlBlock(lines, idx, baseIndent + 1) : { value: {}, next: idx };
              itemObj[k] = sub.value; idx = sub.next;
            } else itemObj[k] = parseYamlScalarValue(vRaw);
            if (idx < lines.length && lines[idx].indent > baseIndent && !lines[idx].text.startsWith("-")) {
              const extra = parseYamlBlock(lines, idx, baseIndent + 1);
              if (extra.value && typeof extra.value === "object" && !Array.isArray(extra.value)) Object.assign(itemObj, extra.value);
              idx = extra.next;
            }
            arr.push(itemObj);
          } else arr.push(parseYamlScalarValue(rest));
        }
      }
      return { value: arr, next: idx };
    }
    const obj = {};
    const baseIndent = lines[idx].indent;
    while (idx < lines.length && lines[idx].indent === baseIndent && !lines[idx].text.startsWith("- ")) {
      const colon = splitYamlColon(lines[idx].text);
      if (colon <= 0) { idx++; continue; }
      const key = unquoteYamlScalar(lines[idx].text.slice(0, colon));
      const vRaw = lines[idx].text.slice(colon + 1).trim();
      idx++;
      if (vRaw === "|" || vRaw === ">") {
        const blockLines = [];
        const textIndent = idx < lines.length && lines[idx].indent > baseIndent ? lines[idx].indent : baseIndent + 2;
        while (idx < lines.length && lines[idx].indent >= textIndent) blockLines.push(lines[idx++].text);
        obj[key] = blockLines.join("\n");
      } else if (!vRaw) {
        const sub = idx < lines.length && lines[idx].indent > baseIndent ? parseYamlBlock(lines, idx, baseIndent + 1) : { value: {}, next: idx };
        obj[key] = sub.value; idx = sub.next;
      } else obj[key] = parseYamlScalarValue(vRaw);
    }
    return { value: obj, next: idx };
  }

  function parseSimpleYaml(rawText) {
    const lines = [];
    for (const raw of rawText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n")) {
      const cleaned = stripYamlComment(raw);
      const trimmed = cleaned.trim();
      if (!trimmed || trimmed === "---" || trimmed === "...") continue;
      lines.push({ indent: cleaned.length - cleaned.trimStart().length, text: trimmed });
    }
    if (lines.length === 0) return {};
    const parsed = parseYamlBlock(lines, 0, lines[0].indent).value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected YAML mapping object for OpenAPI specification.");
    }
    return parsed;
  }

  function resolveOpenApiRef(doc, node, seen = new Set()) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return node;
    const ref = node.$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/") || seen.has(ref)) return node;
    seen.add(ref);
    let cur = doc;
    for (const seg of ref.slice(2).split("/")) {
      if (!cur || typeof cur !== "object") return node;
      cur = cur[seg.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    return cur ? resolveOpenApiRef(doc, cur, seen) : node;
  }

  function sampleOpenApiSchema(doc, schemaNode, depth = 0, seen = new Set()) {
    if (depth > 5 || !schemaNode || typeof schemaNode !== "object") return "string";
    if (typeof schemaNode.$ref === "string") {
      if (seen.has(schemaNode.$ref)) return {};
      seen.add(schemaNode.$ref);
      const res = sampleOpenApiSchema(doc, resolveOpenApiRef(doc, schemaNode), depth + 1, seen);
      seen.delete(schemaNode.$ref);
      return res;
    }
    if (schemaNode.example !== undefined) return schemaNode.example;
    if (schemaNode.default !== undefined) return schemaNode.default;
    if (Array.isArray(schemaNode.enum) && schemaNode.enum.length > 0) return schemaNode.enum[0];
    if (Array.isArray(schemaNode.oneOf) && schemaNode.oneOf.length > 0) return sampleOpenApiSchema(doc, schemaNode.oneOf[0], depth + 1, seen);
    if (Array.isArray(schemaNode.anyOf) && schemaNode.anyOf.length > 0) return sampleOpenApiSchema(doc, schemaNode.anyOf[0], depth + 1, seen);
    const t = Array.isArray(schemaNode.type) ? schemaNode.type[0] : schemaNode.type;
    if (t === "object" || schemaNode.properties) {
      const out = {};
      for (const [k, v] of Object.entries(schemaNode.properties || {})) out[k] = sampleOpenApiSchema(doc, v, depth + 1, seen);
      return out;
    }
    if (t === "array") return [sampleOpenApiSchema(doc, schemaNode.items, depth + 1, seen)];
    if (t === "integer") return 1;
    if (t === "number") return 19.0;
    if (t === "boolean") return true;
    return schemaNode.format === "email" ? "dev@example.com" : "example";
  }

  function resolveOpenApiAuth(doc, secList) {
    const schemes = doc.components?.securitySchemes || doc.securityDefinitions || {};
    if (!Array.isArray(secList) || secList.length === 0) return undefined;
    for (const entry of secList) {
      if (!entry || typeof entry !== "object") continue;
      for (const name of Object.keys(entry)) {
        const s = resolveOpenApiRef(doc, schemes[name]);
        if (!s) continue;
        const type = String(s.type || "").toLowerCase();
        if (type === "http") return String(s.scheme || "").toLowerCase() === "basic" ? { type: "basic", username: "{{username}}", password: "{{password}}" } : { type: "bearer", token: "{{apiToken}}" };
        if (type === "apikey") return { type: "apikey", key: String(s.name || "X-Api-Key"), value: "{{apiKey}}", in: s.in === "query" ? "query" : "header" };
        if (type === "basic") return { type: "basic", username: "{{username}}", password: "{{password}}" };
        if (type === "oauth2" || type === "openidconnect") return { type: "bearer", token: "{{apiToken}}" };
      }
    }
    return undefined;
  }

  function parseOpenApiSpec(input) {
    const doc = typeof input === "string"
      ? (/^[{\[]/.test(input.trim()) ? JSON.parse(input) : parseSimpleYaml(input))
      : input;
    if (!doc || typeof doc !== "object" || (!doc.openapi && !doc.swagger) || !doc.paths || typeof doc.paths !== "object") {
      throw new Error("OpenAPI document must include openapi (3.x) or swagger (2.0) and a paths object.");
    }
    let baseUrl = typeof doc.servers?.[0]?.url === "string" ? doc.servers[0].url.trim() : "";
    if (!baseUrl && typeof doc.host === "string") {
      const scheme = Array.isArray(doc.schemes) && doc.schemes[0] ? String(doc.schemes[0]) : "https";
      baseUrl = `${scheme}://${doc.host}${typeof doc.basePath === "string" ? doc.basePath : ""}`;
    }
    const variables = { baseUrl: (baseUrl || "https://api.example.com").replace(/\/+$/, "") };
    const requests = [];
    for (const [rawPath, pathObj] of Object.entries(doc.paths)) {
      if (!pathObj || typeof pathObj !== "object") continue;
      const pathParams = Array.isArray(pathObj.parameters) ? pathObj.parameters : [];
      for (const [mKey, op] of Object.entries(pathObj)) {
        if (!OPENAPI_HTTP_METHODS.has(mKey.toLowerCase()) || !op || typeof op !== "object") continue;
        const query = [];
        const headers = {};
        for (const pRaw of [...pathParams, ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
          const p = resolveOpenApiRef(doc, pRaw);
          if (!p || typeof p !== "object" || !p.name) continue;
          const pName = String(p.name);
          const ex = p.example ?? p.schema?.example ?? p.schema?.default;
          if (p.in === "query") query.push({ key: pName, value: ex !== undefined ? String(ex) : `{{${pName}}}` });
          else if (p.in === "header") headers[pName] = ex !== undefined ? String(ex) : `{{${pName}}}`;
          else if (p.in === "path" && !(pName in variables)) variables[pName] = ex !== undefined ? String(ex) : `sample_${pName}`;
        }
        let body;
        const reqBody = resolveOpenApiRef(doc, op.requestBody);
        const content = reqBody?.content;
        if (content && typeof content === "object") {
          const ct = Object.keys(content).find((k) => k.includes("json")) || Object.keys(content)[0];
          if (ct) {
            const media = content[ct] || {};
            const firstEx = media.examples ? Object.values(media.examples)[0]?.value : undefined;
            const sample = media.example ?? firstEx ?? (media.schema ? sampleOpenApiSchema(doc, media.schema) : {});
            if (ct.includes("x-www-form-urlencoded") && sample && typeof sample === "object") {
              const fields = Object.entries(sample).map(([key, v]) => ({ key, value: String(v ?? "") }));
              body = { mode: "urlencoded", contentType: ct, fields, raw: fields.map((f) => `${f.key}=${f.value}`).join("&") };
            } else {
              body = { mode: "raw", contentType: ct, raw: typeof sample === "string" ? sample : JSON.stringify(sample, null, 2) };
            }
          }
        }
        const normPath = rawPath.replace(/\{([^}]+)\}/g, "{{$1}}");
        const fullUrl = normPath.startsWith("http") ? normPath : `{{baseUrl}}${normPath.startsWith("/") ? normPath : `/${normPath}`}`;
        const name = String(op.summary || op.operationId || `${mKey.toUpperCase()} ${rawPath}`);
        const okCode = Object.keys(op.responses || {}).find((c) => /^2\d\d$/.test(c));
        requests.push({
          id: makeRequestId(String(op.operationId || name), requests.length),
          name,
          folder: Array.isArray(op.tags) ? op.tags.slice(0, 1).map(String) : [],
          method: mKey.toUpperCase(),
          url: fullUrl,
          headers,
          query,
          body,
          auth: resolveOpenApiAuth(doc, op.security ?? doc.security),
          tests: okCode ? [`status == ${okCode}`] : [],
          sourceFormat: "openapi",
        });
      }
    }
    if (requests.length === 0) throw new Error("No HTTP operations found inside OpenAPI paths.");
    return { name: String(doc.info?.title || "OpenAPI Collection"), baseUrl: variables.baseUrl, variables, requests, warnings: [] };
  }

  function tokenizeCurl(raw) {
    const joined = String(raw || "").replace(/\\\r?\n/g, " ").replace(/\^\r?\n/g, " ").trim();
    const tokens = [];
    let cur = "", quote = null, hasToken = false;
    for (let i = 0; i < joined.length; i++) {
      const ch = joined[i];
      if (quote) {
        if (quote === "'" && ch === "'") quote = null;
        else if (quote === '"' && ch === "\\" && i + 1 < joined.length) cur += joined[++i];
        else if (quote === '"' && ch === '"') quote = null;
        else cur += ch;
        continue;
      }
      if (ch === "$" && joined[i + 1] === "'") { quote = "'"; hasToken = true; i++; continue; }
      if (ch === "'" || ch === '"') { quote = ch; hasToken = true; continue; }
      if (/\s/.test(ch)) { if (hasToken) { tokens.push(cur); cur = ""; hasToken = false; } continue; }
      if (ch === "\\" && i + 1 < joined.length) { cur += joined[++i]; hasToken = true; continue; }
      cur += ch; hasToken = true;
    }
    if (hasToken) tokens.push(cur);
    return tokens;
  }

  function parseCurlCommand(rawText) {
    const tokens = tokenizeCurl(rawText);
    if (tokens.length === 0 || !/^curl(?:\.exe)?$/i.test(tokens[0])) {
      throw new Error("Input is not a valid cURL command.");
    }
    let method = "", rawUrl = "", forceGet = false, auth;
    const headers = {}, dataParts = [], formFields = [];
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      const next = () => (i + 1 < tokens.length ? tokens[++i] : "");
      if (t === "-X" || t === "--request") method = next().toUpperCase();
      else if (t.startsWith("-X") && t.length > 2) method = t.slice(2).toUpperCase();
      else if (t === "--url") rawUrl = next();
      else if (t === "-I" || t === "--head") method = "HEAD";
      else if (t === "-G" || t === "--get") forceGet = true;
      else if (t === "-H" || t === "--header") {
        const h = next(); const c = h.indexOf(":");
        if (c > 0) headers[h.slice(0, c).trim()] = h.slice(c + 1).trim();
      } else if (t === "-A" || t === "--user-agent") headers["User-Agent"] = next();
      else if (t === "-b" || t === "--cookie") headers.Cookie = next();
      else if (t === "-u" || t === "--user") {
        const u = next(); const c = u.indexOf(":");
        auth = { type: "basic", username: c >= 0 ? u.slice(0, c) : u, password: c >= 0 ? u.slice(c + 1) : "" };
      } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary" || t === "--data-urlencode") {
        dataParts.push(next());
      } else if (t === "-F" || t === "--form") {
        const f = next(); const eq = f.indexOf("=");
        if (eq > 0) {
          const val = f.slice(eq + 1);
          formFields.push({ key: f.slice(0, eq), value: val.startsWith("@") ? val.slice(1) : val, type: val.startsWith("@") ? "file" : "text" });
        }
      } else if (!t.startsWith("-") && !rawUrl) rawUrl = t;
    }
    if (!rawUrl) throw new Error("cURL command is missing a target URL.");
    if (!/^https?:\/\//i.test(rawUrl) && !rawUrl.startsWith("{{")) rawUrl = `https://${rawUrl}`;
    const { baseUrl, query } = splitUrlAndQuery(rawUrl);
    const authHdrKey = Object.keys(headers).find((k) => k.toLowerCase() === "authorization");
    if (authHdrKey && !auth) {
      const val = headers[authHdrKey];
      if (/^Bearer\s+/i.test(val)) { auth = { type: "bearer", token: val.replace(/^Bearer\s+/i, "").trim() }; delete headers[authHdrKey]; }
    }
    let body;
    const joinedData = dataParts.join("&");
    if (forceGet && joinedData) {
      for (const part of joinedData.split("&")) {
        const eq = part.indexOf("=");
        query.push(eq >= 0 ? { key: part.slice(0, eq), value: part.slice(eq + 1) } : { key: part, value: "" });
      }
    } else if (formFields.length > 0) {
      body = { mode: "formdata", contentType: "multipart/form-data", fields: formFields };
    } else if (joinedData) {
      const ctKey = Object.keys(headers).find((k) => k.toLowerCase() === "content-type");
      const inferredCt = ctKey ? headers[ctKey] : /^[\[{]/.test(joinedData.trim()) ? "application/json" : "application/x-www-form-urlencoded";
      body = { mode: "raw", raw: joinedData, contentType: inferredCt };
    }
    const finalMethod = forceGet ? "GET" : method || (body ? "POST" : "GET");
    const name = `${finalMethod} ${baseUrl}`;
    return {
      name: "Imported cURL",
      variables: {},
      requests: [{ id: makeRequestId(name, 0), name, folder: [], method: finalMethod, url: baseUrl, headers, query, body, auth, tests: [], sourceFormat: "curl" }],
      warnings: [],
    };
  }

  function parseInputCollection(rawText, hintFormat = "auto") {
    const cleaned = String(rawText || "").replace(/^\uFEFF/, "").trim();
    if (!cleaned) throw new Error("Input collection text is empty.");

    let detected;
    let parsedJson = null;
    if (hintFormat === "postman" || hintFormat === "thunder" || ((hintFormat === "auto" || hintFormat === "openapi") && /^[{\[]/.test(cleaned))) {
      const val = JSON.parse(cleaned);
      if (!val || typeof val !== "object" || Array.isArray(val)) {
        throw new Error("Expected a JSON object for Postman, Thunder, or OpenAPI collection.");
      }
      parsedJson = val;
      if (hintFormat === "postman") detected = "postman";
      else if (hintFormat === "thunder") detected = "thunder";
      else if (hintFormat === "openapi") detected = "openapi";
      else if (Array.isArray(parsedJson.item)) detected = "postman";
      else if (Array.isArray(parsedJson.requests)) detected = "thunder";
      else if ((parsedJson.openapi || parsedJson.swagger) && parsedJson.paths) detected = "openapi";
      else throw new Error("Unrecognized JSON schema: expected Postman (item[]), Thunder Client (requests[]), or OpenAPI (paths).");
    } else if (hintFormat === "openapi" || (hintFormat === "auto" && /^(?:openapi|swagger)\s*:/m.test(cleaned) && /^paths\s*:/m.test(cleaned))) {
      detected = "openapi";
    } else if (hintFormat === "curl" || (hintFormat === "auto" && /^\s*curl(?:\.exe)?(?:\s+|$)/i.test(cleaned))) {
      detected = "curl";
    } else if (hintFormat === "bruno") {
      detected = "bruno";
    } else if (hintFormat === "http") {
      detected = "http";
    } else if (BRU_BLOCK_RE.test(cleaned)) {
      detected = "bruno";
    } else if (HTTP_LINE_RE.test(cleaned) || /^###/m.test(cleaned) || /^@[A-Za-z0-9_.-]+\s*=/m.test(cleaned)) {
      detected = "http";
    } else {
      throw new Error("Unable to detect input format (expected Postman, Thunder Client, Bruno .bru, .http, OpenAPI YAML/JSON, or cURL).");
    }

    if (detected === "postman") return { format: detected, collection: parsePostmanCollection(parsedJson) };
    if (detected === "thunder") return { format: detected, collection: parseThunderCollection(parsedJson) };
    if (detected === "openapi") return { format: detected, collection: parseOpenApiSpec(parsedJson ?? cleaned) };
    if (detected === "curl") return { format: detected, collection: parseCurlCommand(cleaned) };
    if (detected === "http") return { format: detected, collection: parseHttpFile(cleaned) };
    return { format: "bruno", collection: parseSingleBru(cleaned) };
  }

  function collectVarsFromText(text, out) {
    for (const m of text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
      const token = m[1].trim();
      if (token.startsWith("$dotenv ")) {
        const envName = token.slice("$dotenv ".length).trim();
        if (envName) out.add(envName);
      } else if (!BUILTIN_VARS.has(token) && !token.startsWith("$")) {
        out.add(token);
      }
    }
  }

  function resolveAuthForHttp(req) {
    const auth = req.auth;
    if (!auth || auth.type === "none") return {};
    if (auth.type === "bearer") return { header: { key: "Authorization", value: `Bearer ${auth.token || "{{token}}"}` } };
    if (auth.type === "basic") {
      const user = auth.username || "";
      const pass = auth.password || "";
      if (user && !user.includes("{{") && !pass.includes("{{")) {
        return { header: { key: "Authorization", value: `Basic ${utf8ToBase64(`${user}:${pass}`)}` } };
      }
      return { header: { key: "Authorization", value: "Basic {{basicCredentials}}" } };
    }
    if (auth.type === "apikey") {
      const k = auth.key || "X-Api-Key";
      const v = auth.value || "{{apiKey}}";
      if (auth.in === "query") return { queryParam: { key: k, value: v } };
      return { header: { key: k, value: v } };
    }
    return {};
  }

  function buildFullUrl(req, extraQuery) {
    const allQuery = [...req.query];
    if (extraQuery) allQuery.push(extraQuery);
    if (allQuery.length === 0) return req.url;
    const sep = req.url.includes("?") ? "&" : "?";
    return `${req.url}${sep}${allQuery.map((q) => `${q.key}=${q.value}`).join("&")}`;
  }

  function toHttpFile(col) {
    const lines = [
      "# Generated locally by ReqBridge Local API (0 network uploads)",
      `# Collection: ${col.name || "Exported Collection"}`,
      "",
    ];
    const referencedVars = new Set();
    for (const [k, v] of Object.entries(col.variables)) {
      const isSecret = /token|secret|key|pass|auth|credential/i.test(k);
      lines.push(isSecret ? `# @${k} configured via .env` : `@${k} = ${v}`);
      referencedVars.add(k);
    }
    if (Object.keys(col.variables).length > 0) lines.push("");

    for (const req of col.requests) {
      const folderPrefix = req.folder.length > 0 ? `${req.folder.join(" / ")} / ` : "";
      lines.push(`### ${folderPrefix}${req.name}`);
      lines.push(`# @name ${req.id}`);
      if (req.inheritedAuth) lines.push("# [Inherited parent folder auth preserved]");

      const resolvedAuth = resolveAuthForHttp(req);
      const fullUrl = buildFullUrl(req, resolvedAuth.queryParam);
      lines.push(`${req.method} ${fullUrl}`);
      collectVarsFromText(fullUrl, referencedVars);

      const emittedHeaders = new Map();
      if (resolvedAuth.header) {
        emittedHeaders.set(resolvedAuth.header.key.toLowerCase(), { name: resolvedAuth.header.key, value: resolvedAuth.header.value });
      }
      for (const [k, v] of Object.entries(req.headers)) {
        emittedHeaders.set(k.toLowerCase(), { name: k, value: v });
      }
      if (req.body && req.body.mode !== "none" && req.body.contentType && !emittedHeaders.has("content-type")) {
        emittedHeaders.set("content-type", { name: "Content-Type", value: req.body.contentType });
      }
      for (const { name, value } of emittedHeaders.values()) {
        lines.push(`${name}: ${value}`);
        collectVarsFromText(value, referencedVars);
      }
      if (req.body && req.body.mode !== "none") {
        if (req.body.raw) {
          lines.push("", req.body.raw);
          collectVarsFromText(req.body.raw, referencedVars);
        } else if (req.body.fields && req.body.fields.length > 0) {
          lines.push("");
          for (const f of req.body.fields) {
            lines.push(`# ${f.key}=${f.value}`);
            collectVarsFromText(f.value, referencedVars);
          }
        }
      }
      if (req.tests.length > 0) {
        lines.push("");
        for (const t of req.tests) lines.push(`# @assert ${t}`);
      }
      lines.push("");
    }

    const envLines = ["# ReqBridge .env.example (fill in local secrets — never commit real .env)"];
    for (const key of [...referencedVars].sort()) {
      const isSecret = /token|secret|key|pass|auth|credential/i.test(key);
      const defaultVal = !isSecret && col.variables[key] ? col.variables[key] : "";
      envLines.push(`${key}=${defaultVal}`);
    }
    return { httpContent: lines.join("\n"), envExample: `${envLines.join("\n")}\n` };
  }

  const quoteYaml = (s) =>
    JSON.stringify(s).replace(/[\u0085\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

  function yamlScalar(val) {
    if (val === null) return "null";
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    const str = String(val);
    if (
      str === "" || str === "=" || str === "<<" || str === "..." ||
      /^(?:true|false|null|yes|no|on|off|y|n|~|[+-]?\.inf|\.nan)$/i.test(str) ||
      /^[+-]?(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?$/.test(str) ||
      /^[+-]?0[xXoObB][0-9a-fA-F_]+$/.test(str) ||
      /^\d{4}-\d{1,2}-\d{1,2}(?:[Tt ]\d|$)/.test(str) ||
      /^[-?]/.test(str) ||
      /[:#{}[\],&*!|>'"%@`\\\n\r\x00-\x1f\x7f\u0085\u2028\u2029]/.test(str) ||
      /^\s|\s$/.test(str)
    ) {
      return quoteYaml(str);
    }
    return str;
  }

  function yamlKey(k) {
    if (/^[A-Za-z_/][A-Za-z0-9_./{}-]*$/.test(k) && !/^(?:true|false|null|yes|no|on|off|y|n)$/i.test(k)) {
      return k;
    }
    return quoteYaml(k);
  }

  function toYamlLines(val, indent = 0) {
    const pad = " ".repeat(indent);
    if (Array.isArray(val)) {
      if (val.length === 0) return [`${pad}[]`];
      const lines = [];
      for (const item of val) {
        if (item !== null && typeof item === "object") {
          const sub = toYamlLines(item, indent + 2);
          if (sub.length > 0) {
            lines.push(`${pad}- ${sub[0].trimStart()}`);
            lines.push(...sub.slice(1));
          } else {
            lines.push(`${pad}- {}`);
          }
        } else {
          lines.push(`${pad}- ${yamlScalar(item)}`);
        }
      }
      return lines;
    }
    if (val !== null && typeof val === "object") {
      const entries = Object.entries(val).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return [`${pad}{}`];
      const lines = [];
      for (const [k, v] of entries) {
        const keyStr = yamlKey(k);
        if (v !== null && typeof v === "object") {
          const isEmpty = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
          if (isEmpty) {
            lines.push(`${pad}${keyStr}: ${Array.isArray(v) ? "[]" : "{}"}`);
          } else {
            lines.push(`${pad}${keyStr}:`);
            lines.push(...toYamlLines(v, indent + 2));
          }
        } else {
          lines.push(`${pad}${keyStr}: ${yamlScalar(v)}`);
        }
      }
      return lines;
    }
    return [`${pad}${yamlScalar(val)}`];
  }

  function normalizeOpenApiPath(rawUrl) {
    let p = String(rawUrl || "")
      .split("?")[0]
      .trim()
      .replace(/^(?:https?|\{\{[^}]+\}\}):\/\/[^/?#]+/i, "")
      .replace(/^(?:[A-Za-z0-9_.-]+|\{\{[^}]+\}\}):(?:\d+|\{\{[^}]+\}\})(?=\/|$)/, "")
      .replace(/^\{\{[^}]+\}\}/, "");
    p = p.replace(/\{\{([A-Za-z0-9_.-]+)\}\}/g, "{$1}");
    p = p.replace(/(^|\/):([A-Za-z_][A-Za-z0-9_-]*)/g, "$1{$2}");
    if (!p) return "/";
    return p.startsWith("/") ? p : `/${p}`;
  }

  function inferJsonSchema(val) {
    if (val === null) return { type: "null" };
    if (Array.isArray(val)) return { type: "array", items: val.length > 0 ? inferJsonSchema(val[0]) : { type: "string" } };
    if (typeof val === "object") {
      const properties = {};
      for (const [k, v] of Object.entries(val)) properties[k] = inferJsonSchema(v);
      return { type: "object", properties };
    }
    if (typeof val === "number") return { type: Number.isInteger(val) ? "integer" : "number" };
    if (typeof val === "boolean") return { type: "boolean" };
    return { type: "string" };
  }

  function parseTemplatedJson(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      let out = "";
      let inStr = false;
      let esc = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inStr) {
          out += ch;
          if (esc) esc = false;
          else if (ch === "\\") esc = true;
          else if (ch === '"') inStr = false;
        } else if (ch === '"') {
          inStr = true;
          out += ch;
        } else if (ch === "{" && raw[i + 1] === "{") {
          const close = raw.indexOf("}}", i + 2);
          if (close !== -1) {
            out += '"placeholder"';
            i = close + 1;
            continue;
          }
          out += ch;
        } else {
          out += ch;
        }
      }
      try { return JSON.parse(out); } catch { return undefined; }
    }
  }

  function inferStatusCodes(tests) {
    const codes = new Set();
    for (const t of tests) {
      const matches = t.matchAll(
        /(?:have\.status\(\s*(\d{3})\s*\)|(?<!\.)status\s*===?\s*(\d{3})|res\.status:?\s*eq\s*(\d{3})|(?:getStatus\(\)|res\.status)\)?\.to\.(?:equal|eql)\(\s*(\d{3})\s*\))/gi
      );
      for (const m of matches) {
        const code = m[1] || m[2] || m[3] || m[4];
        if (code) codes.add(code);
      }
    }
    return codes.size > 0 ? [...codes] : ["200"];
  }

  function buildOperation(req, normalizedPath, securitySchemes) {
    const parameters = [];
    for (const m of normalizedPath.matchAll(/\{([^}]+)\}/g)) {
      parameters.push({ name: m[1], in: "path", required: true, schema: { type: "string" } });
    }
    for (const q of req.query) {
      parameters.push({ name: q.key, in: "query", required: false, schema: { type: "string" } });
    }
    for (const [k] of Object.entries(req.headers)) {
      const lower = k.toLowerCase();
      if (lower === "authorization" || lower === "content-type") continue;
      if (req.auth?.type === "apikey" && req.auth.key?.toLowerCase() === lower) continue;
      parameters.push({ name: k, in: "header", required: false, schema: { type: "string" } });
    }
    let security;
    if (req.auth && req.auth.type !== "none") {
      if (req.auth.type === "bearer") {
        securitySchemes.bearerAuth = { type: "http", scheme: "bearer" };
        security = [{ bearerAuth: [] }];
      } else if (req.auth.type === "basic") {
        securitySchemes.basicAuth = { type: "http", scheme: "basic" };
        security = [{ basicAuth: [] }];
      } else if (req.auth.type === "apikey") {
        securitySchemes.apiKeyAuth = { type: "apiKey", in: req.auth.in === "query" ? "query" : "header", name: req.auth.key || "X-Api-Key" };
        security = [{ apiKeyAuth: [] }];
      }
    }
    let requestBody;
    if (req.body && req.body.mode !== "none") {
      const ct = req.body.contentType || "application/json";
      if (req.body.mode === "raw" && req.body.raw) {
        const parsed = parseTemplatedJson(req.body.raw);
        requestBody = { required: true, content: { [ct]: { schema: parsed !== undefined ? inferJsonSchema(parsed) : { type: "string" } } } };
      } else if (req.body.fields && req.body.fields.length > 0) {
        const properties = {};
        for (const f of req.body.fields) properties[f.key] = f.type === "file" ? { type: "string", format: "binary" } : { type: "string" };
        requestBody = { required: true, content: { [ct]: { schema: { type: "object", properties } } } };
      }
    }
    const responses = {};
    for (const code of inferStatusCodes(req.tests)) responses[code] = { description: `Response ${code}` };
    const op = { summary: req.name, operationId: req.id };
    if (req.folder.length > 0) op.tags = [req.folder.join(" / ")];
    if (parameters.length > 0) op.parameters = parameters;
    if (security) op.security = security;
    if (requestBody) op.requestBody = requestBody;
    if (req.tests.length > 0) op["x-reqbridge-assertions"] = req.tests;
    op.responses = responses;
    return op;
  }

  function mergeRequests(a, b) {
    const query = [...a.query];
    for (const q of b.query) {
      if (!query.some((x) => x.key === q.key)) query.push(q);
    }
    const tests = [...a.tests];
    for (const t of b.tests) {
      if (!tests.includes(t)) tests.push(t);
    }
    return { ...a, headers: { ...b.headers, ...a.headers }, query, body: a.body || b.body, auth: a.auth || b.auth, tests };
  }

  function toOpenApiYaml(col) {
    const baseServer =
      col.baseUrl ||
      Object.entries(col.variables).find(([k]) => /base/i.test(k))?.[1] ||
      "https://api.example.com";

    const groupedPaths = new Map();
    for (const req of col.requests) {
      const normPath = normalizeOpenApiPath(req.url);
      const method = req.method.toLowerCase();
      let methodsMap = groupedPaths.get(normPath);
      if (!methodsMap) {
        methodsMap = new Map();
        groupedPaths.set(normPath, methodsMap);
      }
      const existing = methodsMap.get(method);
      methodsMap.set(method, existing ? mergeRequests(existing, req) : req);
    }

    const securitySchemes = {};
    const pathsObj = {};
    for (const [normPath, methodsMap] of groupedPaths.entries()) {
      pathsObj[normPath] = {};
      for (const [method, req] of methodsMap.entries()) {
        pathsObj[normPath][method] = buildOperation(req, normPath, securitySchemes);
      }
    }

    const doc = {
      openapi: "3.1.0",
      info: { title: col.name || "ReqBridge Exported API", version: "1.0.0" },
      servers: [{ url: baseServer }],
      paths: pathsObj,
    };
    if (Object.keys(securitySchemes).length > 0) doc.components = { securitySchemes };
    return `${toYamlLines(doc).join("\n")}\n`;
  }

  const PRESETS = {
    orders: JSON.stringify(
      {
        info: {
          name: "Orders API (Postman v2.1)",
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        variable: [
          { key: "baseUrl", value: "https://staging-api.acme.dev" },
          { key: "apiToken", value: "{{$dotenv STAGING_TOKEN}}" },
        ],
        auth: { type: "bearer", bearer: [{ key: "token", value: "{{apiToken}}", type: "string" }] },
        item: [
          {
            name: "Orders Folder",
            item: [
              {
                name: "List Recent Orders",
                request: {
                  method: "GET",
                  header: [{ key: "Accept", value: "application/json" }],
                  url: {
                    raw: "{{baseUrl}}/v2/orders?status=paid&limit=25",
                    query: [{ key: "status", value: "paid" }, { key: "limit", value: "25" }],
                  },
                },
                event: [{ listen: "test", script: { exec: ['pm.test("Status is 200", function () { pm.response.to.have.status(200); });'] } }],
              },
              {
                name: "Create Order",
                request: {
                  method: "POST",
                  header: [{ key: "Content-Type", value: "application/json" }],
                  body: { mode: "raw", raw: '{\n  "customer": "Alice",\n  "amount": 1900\n}' },
                  url: { raw: "{{baseUrl}}/v2/orders" },
                },
                event: [{ listen: "test", script: { exec: ['pm.test("Created 201", function () { pm.response.to.have.status(201); });'] } }],
              },
            ],
          },
        ],
      },
      null,
      2
    ),
    webhooks: JSON.stringify(
      {
        info: {
          name: "Billing Webhooks (Postman v2.1)",
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        variable: [
          { key: "baseUrl", value: "http://localhost:8787" },
          { key: "webhookSecret", value: "{{$dotenv CREEM_WEBHOOK_KEY}}" },
        ],
        auth: {
          type: "apikey",
          apikey: [{ key: "key", value: "X-Api-Key" }, { key: "value", value: "{{webhookSecret}}" }],
        },
        item: [
          {
            name: "Simulate Checkout Completed",
            request: {
              method: "POST",
              header: [{ key: "Content-Type", value: "application/json" }],
              body: { mode: "raw", raw: '{\n  "eventType": "checkout.completed",\n  "licenseKey": "REQ-TEST-19-DEMO"\n}' },
              url: { raw: "{{baseUrl}}/webhooks/creem" },
            },
            event: [{ listen: "test", script: { exec: ['pm.test("Signature verified", function () { pm.response.to.have.status(200); });'] } }],
          },
          {
            name: "Validate License Seat",
            request: {
              method: "POST",
              header: [{ key: "Content-Type", value: "application/json" }],
              body: { mode: "raw", raw: '{\n  "key": "REQ-TEST-19-DEMO",\n  "instanceId": "win-dev-01"\n}' },
              url: { raw: "{{baseUrl}}/v1/licenses/validate" },
            },
          },
        ],
      },
      null,
      2
    ),
    thunder: JSON.stringify(
      {
        client: "Thunder Client",
        collectionName: "Orders API (Thunder Client)",
        requests: [
          {
            name: "Get Orders",
            method: "GET",
            url: "{{baseUrl}}/v2/orders?status=paid",
            headers: [{ name: "Accept", value: "application/json" }],
            auth: { type: "bearer", bearer: "{{apiToken}}" },
            tests: [{ type: "res-code", value: "200" }],
          },
          {
            name: "Create Order",
            method: "POST",
            url: "{{baseUrl}}/v2/orders",
            body: { type: "json", raw: '{\n  "orderId": "ord_101",\n  "amount": 1900\n}' },
            tests: [{ type: "res-code", value: "201" }],
          },
        ],
      },
      null,
      2
    ),
    bruno: [
      "meta {",
      "  name: Create Refund",
      "  type: http",
      "  seq: 1",
      "}",
      "",
      "post {",
      "  url: {{baseUrl}}/v2/orders/{{orderId}}/refund",
      "  body: json",
      "  auth: bearer",
      "}",
      "",
      "auth:bearer {",
      "  token: {{apiToken}}",
      "}",
      "",
      "query {",
      "  dryRun: false",
      "}",
      "",
      "body:json {",
      '  {',
      '    "reason": "duplicate_charge"',
      '  }',
      "}",
      "",
      "assert {",
      "  res.status: eq 201",
      "}",
    ].join("\n"),
    http: [
      "@baseUrl = https://staging-api.acme.dev",
      "@apiToken = {{$dotenv STAGING_TOKEN}}",
      "",
      "### List Paid Orders",
      "GET {{baseUrl}}/v2/orders?status=paid",
      "Authorization: Bearer {{apiToken}}",
      "# @assert status == 200",
      "",
      "### Create Order",
      "POST {{baseUrl}}/v2/orders",
      "Content-Type: application/json",
      "",
      '{"customer": "Alice", "amount": 1900}',
      "# @assert status == 201",
    ].join("\n"),
    openapi: [
      "openapi: 3.1.0",
      "info:",
      "  title: Orders OpenAPI Spec",
      "  version: 1.0.0",
      "servers:",
      "  - url: https://staging-api.acme.dev",
      "components:",
      "  securitySchemes:",
      "    bearerAuth:",
      "      type: http",
      "      scheme: bearer",
      "paths:",
      "  /v2/orders/{orderId}:",
      "    get:",
      "      summary: Fetch Order by ID",
      "      security:",
      "        - bearerAuth: []",
      "      parameters:",
      "        - name: orderId",
      "          in: path",
      "          required: true",
      "          example: ord_101",
      "        - name: includeItems",
      "          in: query",
      "          example: true",
      "      responses:",
      "        '200':",
      "          description: OK",
      "  /v2/orders:",
      "    post:",
      "      summary: Create Order",
      "      security:",
      "        - bearerAuth: []",
      "      requestBody:",
      "        content:",
      "          application/json:",
      "            schema:",
      "              type: object",
      "              properties:",
      "                customer:",
      "                  type: string",
      "                  example: Alice",
      "                amount:",
      "                  type: integer",
      "                  example: 1900",
      "      responses:",
      "        '201':",
      "          description: Created",
    ].join("\n"),
    curl: [
      "curl -X POST 'https://staging-api.acme.dev/v2/orders?env=staging' \\",
      "  -H 'Authorization: Bearer {{apiToken}}' \\",
      "  -H 'Content-Type: application/json' \\",
      "  -d '{\"customer\":\"Alice\",\"amount\":1900}'",
    ].join("\n"),
  };

  const postmanInput = document.getElementById("postman-input");
  const converterOutput = document.getElementById("converter-output");
  const converterStatus = document.getElementById("converter-status");
  const formatSelect = document.getElementById("converter-format-select");
  const converterFileInput = document.getElementById("converter-file-input");
  const converterDropzone = document.getElementById("converter-dropzone");
  const presetBtns = [...document.querySelectorAll(".preset-btn")];
  const formatBtns = [...document.querySelectorAll(".format-btn")];
  const copyConverterBtn = document.getElementById("copy-converter-btn");
  const downloadConverterBtn = document.getElementById("download-converter-btn");
  const downloadZipBtn = document.getElementById("download-zip-btn");

  let activeFormat = "http";
  let lastOutputs = null;

  function updateConverterOutputView() {
    if (!lastOutputs || !converterOutput) return;
    if (activeFormat === "openapi") converterOutput.textContent = lastOutputs.openapi;
    else if (activeFormat === "env") converterOutput.textContent = lastOutputs.envExample;
    else converterOutput.textContent = lastOutputs.httpContent;
  }

  function renderConversion() {
    if (!postmanInput || !converterOutput || !converterStatus) return;
    try {
      const hint = formatSelect ? formatSelect.value || "auto" : "auto";
      const { format, collection } = parseInputCollection(postmanInput.value, hint);
      const { httpContent, envExample } = toHttpFile(collection);
      const openapi = toOpenApiYaml(collection);
      const inheritedCount = collection.requests.filter((r) => r.inheritedAuth).length;
      const assertionCount = collection.requests.reduce((acc, r) => acc + r.tests.length, 0);
      lastOutputs = { format, httpContent, envExample, openapi };
      updateConverterOutputView();
      converterStatus.className = "status-ok";
      converterStatus.textContent =
        `Detected ${format.toUpperCase()} · ${collection.requests.length} requests · ` +
        `${inheritedCount} inherited auth · ${assertionCount} assertions · 0 bytes left browser`;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      lastOutputs = null;
      converterOutput.textContent = `// Parse error: ${errMsg}`;
      converterStatus.className = "status-err";
      converterStatus.textContent = `Parse error: ${errMsg}`;
    }
  }

  if (postmanInput) {
    postmanInput.value = PRESETS.orders;
    renderConversion();
    let timer = null;
    postmanInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(renderConversion, 90);
    });
    postmanInput.addEventListener("change", () => {
      clearTimeout(timer);
      renderConversion();
    });
  }

  if (formatSelect) {
    formatSelect.addEventListener("change", renderConversion);
  }

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.preset;
      if (!PRESETS[key] || !postmanInput) return;
      presetBtns.forEach((b) => b.classList.toggle("active", b === btn));
      if (formatSelect) formatSelect.value = "auto";
      postmanInput.value = PRESETS[key];
      renderConversion();
    });
  });

  formatBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFormat = btn.dataset.format || "http";
      formatBtns.forEach((b) => b.classList.toggle("active", b === btn));
      updateConverterOutputView();
    });
  });

  if (copyConverterBtn && converterOutput) {
    copyConverterBtn.addEventListener("click", () => copyText(converterOutput.textContent || "", copyConverterBtn));
  }

  if (downloadConverterBtn) {
    downloadConverterBtn.addEventListener("click", () => {
      if (!lastOutputs) return;
      const meta =
        activeFormat === "openapi"
          ? { name: "openapi.yaml", text: lastOutputs.openapi, mime: "application/yaml" }
          : activeFormat === "env"
            ? { name: ".env.example", text: lastOutputs.envExample, mime: "text/plain" }
            : { name: "requests.http", text: lastOutputs.httpContent, mime: "text/plain" };
      triggerBlobDownload(meta.name, meta.text, meta.mime);
    });
  }

  if (downloadZipBtn) {
    downloadZipBtn.addEventListener("click", () => {
      if (!lastOutputs) return;
      const zipBytes = buildZipBytes([
        { name: "requests.http", content: lastOutputs.httpContent },
        { name: ".env.example", content: lastOutputs.envExample },
        { name: "openapi.yaml", content: lastOutputs.openapi },
      ]);
      triggerBlobDownload("reqbridge-export.zip", zipBytes, "application/zip");
    });
  }

  function loadUploadedFile(file) {
    if (!file || !postmanInput) return;
    if (typeof file.text === "function") {
      file.text().then((txt) => {
        if (formatSelect) formatSelect.value = "auto";
        postmanInput.value = txt;
        renderConversion();
      });
      return;
    }
    if (typeof FileReader !== "undefined") {
      const reader = new FileReader();
      reader.onload = () => {
        if (formatSelect) formatSelect.value = "auto";
        postmanInput.value = String(reader.result || "");
        renderConversion();
      };
      reader.readAsText(file);
    }
  }

  if (converterFileInput) {
    converterFileInput.addEventListener("change", () => {
      const f = converterFileInput.files && converterFileInput.files[0];
      if (f) loadUploadedFile(f);
    });
  }

  if (converterDropzone) {
    converterDropzone.addEventListener("dragover", (e) => {
      if (e.preventDefault) e.preventDefault();
      converterDropzone.classList.add("dropzone-active");
    });
    converterDropzone.addEventListener("dragleave", () => {
      converterDropzone.classList.remove("dropzone-active");
    });
    converterDropzone.addEventListener("drop", (e) => {
      if (e.preventDefault) e.preventDefault();
      converterDropzone.classList.remove("dropzone-active");
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadUploadedFile(f);
    });
  }

  // 5. Tab 2: Real CSV Batch Runner (RFC-4180 + real fetch(), zero fake timers)
  function parseCsvRows(csvText) {
    const text = String(csvText || "").replace(/^\uFEFF/, "");
    if (!text.trim()) return [];
    const records = [];
    let currentRow = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        currentRow.push(field);
        field = "";
      } else if (ch === "\r") {
        if (text[i + 1] === "\n") i++;
        currentRow.push(field);
        records.push(currentRow);
        currentRow = [];
        field = "";
      } else if (ch === "\n") {
        currentRow.push(field);
        records.push(currentRow);
        currentRow = [];
        field = "";
      } else {
        field += ch;
      }
    }
    if (inQuotes) throw new Error("Unclosed quote in CSV input.");
    if (field.length > 0 || currentRow.length > 0) {
      currentRow.push(field);
      records.push(currentRow);
    }
    if (records.length <= 1) return [];
    const headers = records[0].map((h) => h.trim());
    const rows = [];
    for (let r = 1; r < records.length; r++) {
      const rec = records[r];
      if (rec.length === 1 && rec[0] === "") continue;
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        if (headers[c]) {
          Object.defineProperty(obj, headers[c], {
            value: rec[c] ?? "",
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
      }
      rows.push(obj);
    }
    return rows;
  }

  function substituteVars(template, vars) {
    return String(template || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey) => {
      const key = String(rawKey).trim();
      const envKey = key.startsWith("$dotenv ") ? key.slice("$dotenv ".length).trim() : key;
      return Object.prototype.hasOwnProperty.call(vars, envKey) ? vars[envKey] : match;
    });
  }

  function resolveBodyPath(obj, pathExpr) {
    const tokens = [];
    for (const part of pathExpr.split(".")) {
      const bracketRe = /([^[\]]+)|\[(\d+)\]/g;
      let m;
      while ((m = bracketRe.exec(part)) !== null) {
        tokens.push(m[1] !== undefined ? m[1] : m[2]);
      }
    }
    let cur = obj;
    for (const key of tokens) {
      if (cur === null || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, key)) {
        return { found: false, value: undefined };
      }
      cur = cur[key];
    }
    return { found: true, value: cur };
  }

  function parseAssertionScalar(raw) {
    const trimmed = String(raw || "").trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (trimmed === "null") return null;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  }

  function splitAndClauses(expr) {
    const parts = [];
    let cur = "";
    let quote = null;
    let esc = false;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (quote) {
        cur += ch;
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        cur += ch;
      } else if (ch === "&" && expr[i + 1] === "&") {
        if (cur.trim()) parts.push(cur.trim());
        cur = "";
        i++;
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function evaluateSingleAssertionClause(clause, status, bodyText) {
    const bodyPropMatch = clause.match(/^res\.body\.([A-Za-z0-9_.\[\]-]+)\s*(?:===?|eq)\s*(.+)$/i);
    if (bodyPropMatch) {
      let parsedBody;
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        return { passed: false, detail: "response body is not valid JSON" };
      }
      const resolved = resolveBodyPath(parsedBody, bodyPropMatch[1]);
      if (!resolved.found) {
        return { passed: false, detail: `missing body path ${bodyPropMatch[1]}` };
      }
      const expectedVal = parseAssertionScalar(bodyPropMatch[2]);
      const passed = resolved.value === expectedVal;
      return {
        passed,
        detail: passed ? `body.${bodyPropMatch[1]}=${JSON.stringify(resolved.value)}` : `expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(resolved.value)}`,
      };
    }
    const statusMatch = clause.match(/(?:have\.status\(\s*(\d{3})\s*\)|^(?:res\.)?status\s*(?::\s*eq|===?)\s*(\d{3})\s*;?$|(?:getStatus\(\)|res\.status)\)?\.to\.(?:equal|eql)\(\s*(\d{3})\s*\))/i);
    if (statusMatch) {
      const expected = Number(statusMatch[1] || statusMatch[2] || statusMatch[3]);
      return { passed: status === expected, detail: `expected ${expected}, got ${status}` };
    }
    const includeMatch = clause.match(/(?:body\s+contains\s+["']?(.+?)["']?$|to\.include\(\s*["'](.+?)["']\s*\))/i);
    if (includeMatch) {
      const needle = includeMatch[1] ?? includeMatch[2] ?? "";
      const matched = bodyText.includes(needle);
      return { passed: matched, detail: matched ? "matched" : `missing "${needle}"` };
    }
    return { passed: false, detail: "unsupported assertion syntax" };
  }

  function evaluateBatchAssertion(exprRaw, status, bodyText, vars) {
    const expr = substituteVars(String(exprRaw || "").trim(), vars);
    if (!expr) {
      const passed = status >= 200 && status < 400;
      return { expression: "status in 2xx..3xx", passed, detail: `status=${status}` };
    }
    if (/\{\{[^}]+\}\}/.test(expr)) {
      return { expression: expr, passed: false, detail: "unresolved template variable in assertion" };
    }
    const clauses = splitAndClauses(expr);
    if (clauses.length === 0) {
      return { expression: expr, passed: false, detail: "unsupported assertion syntax" };
    }
    const details = [];
    for (const clause of clauses) {
      const res = evaluateSingleAssertionClause(clause, status, bodyText);
      if (!res.passed) {
        return { expression: expr, passed: false, detail: res.detail };
      }
      details.push(res.detail);
    }
    return { expression: expr, passed: true, detail: details.join("; ") };
  }

  function computePercentile(sortedLatencies, p) {
    if (sortedLatencies.length === 0) return 0;
    const idx = Math.min(sortedLatencies.length - 1, Math.max(0, Math.ceil((p / 100) * sortedLatencies.length) - 1));
    return sortedLatencies[idx];
  }

  function escapeXml(value) {
    return String(value || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function exportJUnitXml(report) {
    const totalTimeSec = (report.durationMs / 1000).toFixed(3);
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuite name="ReqBridge Local Batch" tests="${report.totalExecutions}" failures="${report.failedCount}" time="${totalTimeSec}">`,
    ];
    for (const r of report.results) {
      const caseName = escapeXml(`[row ${r.rowIndex + 1}] ${r.method} ${r.url}`);
      const className = escapeXml(`row_${r.rowIndex + 1}`);
      const timeSec = (r.latencyMs / 1000).toFixed(3);
      if (r.passed) {
        lines.push(`  <testcase name="${caseName}" classname="${className}" time="${timeSec}" />`);
      } else {
        const msg = escapeXml(r.error || r.detail || `HTTP status ${r.status}`);
        lines.push(`  <testcase name="${caseName}" classname="${className}" time="${timeSec}">`);
        lines.push(`    <failure message="${msg}">${msg}</failure>`);
        lines.push("  </testcase>");
      }
    }
    lines.push("</testsuite>");
    return `${lines.join("\n")}\n`;
  }

  function escapeMdCell(val) {
    return String(val ?? "")
      .replace(/[\r\n\u0085\u2028\u2029]+/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|");
  }

  function exportBatchMarkdown(report) {
    const lines = [
      "## ReqBridge Browser Batch Report",
      "",
      `- **Executions:** ${report.totalExecutions} (${report.totalRows} CSV rows)`,
      `- **Passed / Failed:** ${report.passedCount} passed · ${report.failedCount} failed`,
      `- **Latency:** min \`${report.minLatencyMs}ms\` · p50 \`${report.p50LatencyMs}ms\` · p95 \`${report.p95LatencyMs}ms\` · max \`${report.maxLatencyMs}ms\``,
      `- **Total Duration:** \`${report.durationMs}ms\``,
      "",
    ];
    const failures = report.results.filter((r) => !r.passed);
    if (failures.length === 0) {
      lines.push("All batch assertions passed.");
    } else {
      lines.push("### Failures", "", "| Row | Method | URL | Status | Detail |", "|---:|---|---|---:|---|");
      for (const f of failures.slice(0, 50)) {
        lines.push(`| ${f.rowIndex + 1} | ${escapeMdCell(f.method)} | ${escapeMdCell(f.url)} | ${f.status} | ${escapeMdCell(f.error || f.detail || "failed")} |`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  const csvInput = document.getElementById("csv-input");
  const batchUrlInput = document.getElementById("batch-url-input");
  const batchMethodSelect = document.getElementById("batch-method-select");
  const batchHeadersInput = document.getElementById("batch-headers-input");
  const batchBodyInput = document.getElementById("batch-body-input");
  const batchAssertInput = document.getElementById("batch-assert-input");
  const batchConcurrencyInput = document.getElementById("batch-concurrency-input");
  const batchCsvFile = document.getElementById("batch-csv-file");
  const batchSampleBtns = [...document.querySelectorAll(".batch-sample-btn")];
  const runBatchBtn = document.getElementById("run-batch-btn");
  const copyReportBtn = document.getElementById("copy-report-btn");
  const exportJunitBtn = document.getElementById("export-junit-btn");
  const exportMdBtn = document.getElementById("export-md-btn");
  const batchProgressFill = document.getElementById("batch-progress-fill");
  const batchProgressText = document.getElementById("batch-progress-text");
  const batchLog = document.getElementById("batch-log");

  const CSV_SAMPLES = {
    "orders-3": [
      "orderId,customer,note",
      'ord_101,Alice,"Standard order"',
      'ord_102,"Bob, Jr.","Express, priority"',
      'ord_103,Carol,"VIP ""priority"" item"',
    ].join("\n"),
    "trial-10": [
      "orderId,customer,amount",
      ...Array.from({ length: 10 }, (_, idx) => `ord_${201 + idx},Dev_${idx + 1},${1900 + idx * 100}`),
    ].join("\n"),
  };

  let lastBatchReport = null;

  if (csvInput && !csvInput.value.trim()) {
    csvInput.value = CSV_SAMPLES["orders-3"];
  }

  batchSampleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const sampleKey = btn.dataset.sample || "orders-3";
      if (csvInput && CSV_SAMPLES[sampleKey]) {
        csvInput.value = CSV_SAMPLES[sampleKey];
        batchSampleBtns.forEach((b) => b.classList.toggle("active", b === btn));
        if (batchProgressText) {
          const count = parseCsvRows(csvInput.value).length;
          batchProgressText.textContent = `Ready: ${count} CSV rows loaded · real browser fetch()`;
        }
      }
    });
  });

  if (batchCsvFile && csvInput) {
    batchCsvFile.addEventListener("change", () => {
      const f = batchCsvFile.files && batchCsvFile.files[0];
      if (!f) return;
      if (typeof f.text === "function") {
        f.text().then((txt) => {
          csvInput.value = txt;
          if (batchProgressText) {
            try {
              batchProgressText.textContent = `Ready: ${parseCsvRows(txt).length} CSV rows loaded from ${f.name}`;
            } catch (e) {
              batchProgressText.textContent = `CSV parse error: ${e instanceof Error ? e.message : String(e)}`;
            }
          }
        });
      }
    });
  }

  async function executeBatchRow(row, rowIndex, cfg) {
    const finalUrl = substituteVars(cfg.urlTemplate, row);
    const headers = {};
    for (const [k, v] of Object.entries(cfg.headersTemplate)) {
      headers[k] = substituteVars(String(v), row);
    }
    const fetchOpts = { method: cfg.method, headers };
    if (cfg.method !== "GET" && cfg.method !== "HEAD" && cfg.bodyTemplate.trim()) {
      fetchOpts.body = substituteVars(cfg.bodyTemplate, row);
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
    if (controller) fetchOpts.signal = controller.signal;

    const t0 = safeNowMs();
    try {
      const res = await fetch(finalUrl, fetchOpts);
      const bodyText = await res.text();
      const latencyMs = Math.max(0, Math.round(safeNowMs() - t0));
      const check = evaluateBatchAssertion(cfg.assertion, res.status, bodyText, row);
      return {
        rowIndex,
        method: cfg.method,
        url: finalUrl,
        status: res.status,
        latencyMs,
        passed: check.passed,
        detail: check.detail,
      };
    } catch (err) {
      const latencyMs = Math.max(0, Math.round(safeNowMs() - t0));
      const rawMsg = err instanceof Error ? err.message : String(err);
      const isCorsHint = /failed to fetch|networkerror|cors|load failed/i.test(rawMsg);
      return {
        rowIndex,
        method: cfg.method,
        url: finalUrl,
        status: 0,
        latencyMs,
        passed: false,
        detail: "network error",
        error: isCorsHint
          ? `${rawMsg} (Browser CORS restriction on cross-origin target; VS Code extension uses Node fetch without CORS limits)`
          : rawMsg,
      };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  async function startRealBatchRun() {
    if (!batchLog || !batchProgressText || !batchProgressFill) return;
    let rows;
    try {
      rows = parseCsvRows(csvInput ? csvInput.value : "");
    } catch (err) {
      batchProgressText.textContent = `CSV parse error: ${err instanceof Error ? err.message : String(err)}`;
      batchLog.textContent = `[ERROR] ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    if (rows.length === 0) {
      batchProgressFill.style.width = "0%";
      batchProgressText.textContent = "No CSV data rows found (provide a header row + at least 1 data row).";
      batchLog.textContent = "[INFO] Empty CSV input: nothing to execute.";
      lastBatchReport = {
        totalRows: 0,
        totalExecutions: 0,
        passedCount: 0,
        failedCount: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        durationMs: 0,
        results: [],
      };
      return;
    }

    const urlTemplate = (batchUrlInput ? batchUrlInput.value : "").trim() || "http://localhost:8787/v2/orders";
    const method = ((batchMethodSelect ? batchMethodSelect.value : "POST") || "POST").toUpperCase();
    let headersTemplate = { "Content-Type": "application/json" };
    let headersWarning = "";
    if (batchHeadersInput && batchHeadersInput.value.trim()) {
      try {
        const parsedHeaders = JSON.parse(batchHeadersInput.value);
        if (parsedHeaders && typeof parsedHeaders === "object" && !Array.isArray(parsedHeaders)) {
          headersTemplate = parsedHeaders;
        } else {
          headersWarning = "[WARN] Headers JSON invalid; falling back to Content-Type: application/json.";
        }
      } catch {
        headersWarning = "[WARN] Headers JSON invalid; falling back to Content-Type: application/json.";
      }
    }
    const bodyTemplate = batchBodyInput ? batchBodyInput.value : '{"orderId":"{{orderId}}"}';
    const assertion = batchAssertInput ? batchAssertInput.value : "";
    const concurrency = Math.min(10, Math.max(1, Number(batchConcurrencyInput ? batchConcurrencyInput.value : 4) || 4));

    const lines = [
      `$ reqbridge-web batch --method ${method} --url "${urlTemplate}" --rows ${rows.length} --concurrency ${concurrency}`,
    ];
    if (headersWarning) lines.push(headersWarning);
    lines.push(`Executing ${rows.length} real browser fetch() requests...`);
    batchLog.textContent = lines.join("\n");
    batchProgressFill.style.width = "0%";
    batchProgressText.textContent = `Running 0 / ${rows.length} requests...`;

    const started = safeNowMs();
    const results = new Array(rows.length);
    let cursor = 0;
    let completed = 0;

    async function worker() {
      while (cursor < rows.length) {
        const idx = cursor++;
        const res = await executeBatchRow(rows[idx], idx, {
          urlTemplate,
          method,
          headersTemplate,
          bodyTemplate,
          assertion,
        });
        results[idx] = res;
        completed += 1;
        const pct = Math.round((completed / rows.length) * 100);
        batchProgressFill.style.width = `${pct}%`;
        batchProgressText.textContent = `Running ${completed} / ${rows.length} (${pct}%)`;
        const statusTag = res.passed ? "PASS" : "FAIL";
        const detailStr = res.error ? res.error : `${res.status} (${res.detail})`;
        lines.push(`[${String(idx + 1).padStart(2, "0")}/${rows.length}] ${statusTag} ${res.method} ${res.url} -> ${detailStr} · ${res.latencyMs}ms`);
        batchLog.textContent = lines.join("\n");
        batchLog.scrollTop = batchLog.scrollHeight;
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, rows.length) }, () => worker());
    await Promise.all(workers);

    const durationMs = Math.max(0, Math.round(safeNowMs() - started));
    const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.length - passedCount;

    lastBatchReport = {
      totalRows: rows.length,
      totalExecutions: results.length,
      passedCount,
      failedCount,
      minLatencyMs: latencies[0] ?? 0,
      maxLatencyMs: latencies[latencies.length - 1] ?? 0,
      p50LatencyMs: computePercentile(latencies, 50),
      p95LatencyMs: computePercentile(latencies, 95),
      durationMs,
      results,
    };

    lines.push(
      "",
      `Summary: ${passedCount}/${results.length} passed · ${failedCount} failed · p50=${lastBatchReport.p50LatencyMs}ms · p95=${lastBatchReport.p95LatencyMs}ms · total=${durationMs}ms`
    );
    batchLog.textContent = lines.join("\n");
    batchProgressText.textContent = `Completed: ${passedCount}/${results.length} passed · ${failedCount} failed · p50 ${lastBatchReport.p50LatencyMs}ms`;
  }

  if (runBatchBtn) {
    runBatchBtn.addEventListener("click", () => {
      startRealBatchRun();
    });
  }
  if (copyReportBtn && batchLog) {
    copyReportBtn.addEventListener("click", () => copyText(batchLog.textContent || "", copyReportBtn));
  }
  if (exportJunitBtn) {
    exportJunitBtn.addEventListener("click", () => {
      const report = lastBatchReport || {
        totalRows: 0, totalExecutions: 0, passedCount: 0, failedCount: 0,
        minLatencyMs: 0, maxLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0, durationMs: 0, results: [],
      };
      const xml = exportJUnitXml(report);
      triggerBlobDownload("results.xml", xml, "application/xml");
      if (batchLog) batchLog.textContent = `${batchLog.textContent}\n\n[Exported JUnit XML (${xml.length} bytes)]\n${xml}`.trim();
    });
  }
  if (exportMdBtn) {
    exportMdBtn.addEventListener("click", () => {
      const report = lastBatchReport || {
        totalRows: 0, totalExecutions: 0, passedCount: 0, failedCount: 0,
        minLatencyMs: 0, maxLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0, durationMs: 0, results: [],
      };
      const md = exportBatchMarkdown(report);
      triggerBlobDownload("batch-report.md", md, "text/markdown");
      if (batchLog) batchLog.textContent = `${batchLog.textContent}\n\n[Exported Markdown Report]\n${md}`.trim();
    });
  }

  // 6. Tab 3: Live Staging vs Prod Schema-Drift Diff (core diff.ts port)
  function jsonTypeOf(val) {
    if (val === null) return "null";
    if (Array.isArray(val)) return "array";
    return typeof val;
  }

  function compareJsonValues(pathStr, stagingVal, prodVal, entries) {
    const sType = jsonTypeOf(stagingVal);
    const pType = jsonTypeOf(prodVal);
    if (sType !== pType) {
      entries.push({
        kind: "type_shift",
        severity: "breaking",
        path: pathStr,
        message: `Type changed from ${pType} (prod) to ${sType} (staging)`,
      });
      return;
    }
    if (sType === "object") {
      for (const key of Object.keys(prodVal)) {
        const childPath = `${pathStr}.${key}`;
        if (!Object.prototype.hasOwnProperty.call(stagingVal, key)) {
          entries.push({
            kind: "missing_key",
            severity: "breaking",
            path: childPath,
            message: `Key '${childPath}' present in prod is missing in staging`,
          });
        } else {
          compareJsonValues(childPath, stagingVal[key], prodVal[key], entries);
        }
      }
      for (const key of Object.keys(stagingVal)) {
        if (!Object.prototype.hasOwnProperty.call(prodVal, key)) {
          const childPath = `${pathStr}.${key}`;
          entries.push({
            kind: "added_key",
            severity: "non-breaking",
            path: childPath,
            message: `Additive key '${childPath}' introduced in staging`,
          });
        }
      }
      return;
    }
    if (sType === "array") {
      if (stagingVal.length !== prodVal.length) {
        entries.push({
          kind: "value_mismatch",
          severity: "info",
          path: `${pathStr}.length`,
          message: `Array length changed from ${prodVal.length} (prod) to ${stagingVal.length} (staging)`,
        });
      }
      const minLen = Math.min(stagingVal.length, prodVal.length);
      for (let i = 0; i < minLen; i++) compareJsonValues(`${pathStr}[${i}]`, stagingVal[i], prodVal[i], entries);
      return;
    }
    if (stagingVal !== prodVal) {
      entries.push({
        kind: "value_mismatch",
        severity: "info",
        path: pathStr,
        message: `Value changed from ${JSON.stringify(prodVal)} to ${JSON.stringify(stagingVal)}`,
      });
    }
  }

  function diffResponses(endpoint, staging, prod) {
    const entries = [];
    const statusMatch = staging.status === prod.status;
    if (!statusMatch) {
      entries.push({
        kind: "status_drift",
        severity: staging.status >= 400 || prod.status >= 400 ? "breaking" : "warning",
        path: "$status",
        message: `HTTP status drifted: staging=${staging.status} vs prod=${prod.status}`,
      });
    }
    const latencyDeltaMs = staging.latencyMs - prod.latencyMs;
    const isSlow = Math.abs(latencyDeltaMs) > 150 || (prod.latencyMs > 0 && staging.latencyMs > prod.latencyMs * 2);
    if (isSlow) {
      entries.push({
        kind: "latency_delta",
        severity: "warning",
        path: "$latencyMs",
        message: `Latency shifted by ${latencyDeltaMs >= 0 ? "+" : ""}${latencyDeltaMs}ms (${prod.latencyMs}ms -> ${staging.latencyMs}ms)`,
      });
    } else if (latencyDeltaMs !== 0) {
      entries.push({
        kind: "latency_delta",
        severity: "info",
        path: "$latencyMs",
        message: `Latency delta ${latencyDeltaMs >= 0 ? "+" : ""}${latencyDeltaMs}ms`,
      });
    }

    let sParsed;
    let pParsed;
    let sOk = false;
    let pOk = false;
    const sTrim = staging.bodyText.trim();
    const pTrim = prod.bodyText.trim();
    if (sTrim) {
      try { sParsed = JSON.parse(sTrim); sOk = true; }
      catch (e) {
        entries.push({
          kind: "body_parse_error",
          severity: "warning",
          path: "$",
          message: `Staging response body is not valid JSON (${e instanceof Error ? e.message : String(e)})`,
        });
      }
    }
    if (pTrim) {
      try { pParsed = JSON.parse(pTrim); pOk = true; }
      catch (e) {
        entries.push({
          kind: "body_parse_error",
          severity: "warning",
          path: "$",
          message: `Production response body is not valid JSON (${e instanceof Error ? e.message : String(e)})`,
        });
      }
    }

    const sEmpty = !sTrim;
    const pEmpty = !pTrim;
    if (sOk && pOk) {
      compareJsonValues("$", sParsed, pParsed, entries);
    } else if (sEmpty !== pEmpty) {
      entries.push({
        kind: !sEmpty && sOk ? "type_shift" : "body_parse_error",
        severity: "breaking",
        path: sOk || pOk ? "$" : "$bodyText",
        message: sEmpty
          ? `Staging response body is empty while Production returned ${pOk ? "JSON" : "non-empty body"}`
          : `Production response body is empty while Staging returned ${sOk ? "JSON" : "non-empty body"}`,
      });
    } else if (!sOk && !pOk && staging.bodyText !== prod.bodyText) {
      entries.push({
        kind: "value_mismatch",
        severity: "info",
        path: "$bodyText",
        message: "Raw text response body differs between staging and prod",
      });
    }

    const breakingCount = entries.filter((e) => e.severity === "breaking").length;
    const warningCount = entries.filter((e) => e.severity === "warning").length;
    let summary;
    if (breakingCount > 0) {
      summary = `BREAKING (${breakingCount}): ${endpoint} — ${entries.filter((e) => e.severity === "breaking").map((e) => e.message).slice(0, 2).join("; ")}`;
    } else if (warningCount > 0) {
      summary = `WARNING (${warningCount}): ${endpoint} — ${entries.filter((e) => e.severity === "warning").map((e) => e.message).slice(0, 2).join("; ")}`;
    } else {
      summary = `OK (Non-Breaking): ${endpoint} — status ${staging.status} matches prod`;
    }
    return { endpoint, statusMatch, stagingStatus: staging.status, prodStatus: prod.status, latencyDeltaMs, hasBreakingChanges: breakingCount > 0, summary, entries };
  }

  function formatDiffMarkdown(report) {
    const lines = [
      `### ReqBridge Staging vs Prod Diff — \`${escapeMdCell(report.endpoint)}\``,
      "",
      `**Summary:** ${String(report.summary || "").replace(/[\r\n\u0085\u2028\u2029]+/g, " ")}`,
      `- **Status:** staging \`${report.stagingStatus}\` vs prod \`${report.prodStatus}\``,
      `- **Latency Delta:** \`${report.latencyDeltaMs >= 0 ? "+" : ""}${report.latencyDeltaMs}ms\``,
      "",
    ];
    if (report.entries.length === 0) {
      lines.push("No structural or status differences detected.");
    } else {
      lines.push("| Severity | Kind | Path | Detail |", "|---|---|---|---|");
      for (const e of report.entries) {
        lines.push(`| ${escapeMdCell(e.severity)} | \`${escapeMdCell(e.kind)}\` | \`${escapeMdCell(e.path)}\` | ${escapeMdCell(e.message)} |`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  const DIFF_PRESETS = {
    orders: {
      endpoint: "GET /v2/orders/{id}",
      stagingStatus: 200,
      stagingLatency: 226,
      prodStatus: 200,
      prodLatency: 42,
      staging: JSON.stringify({ id: "ord_94821", status: "paid", amount_cents: 1900, currency_code: "USD", tax_exempt: false }, null, 2),
      prod: JSON.stringify({ id: "ord_94821", status: "paid", amount_cents: 1900, currency_code: 840 }, null, 2),
    },
    checkout: {
      endpoint: "POST /v2/checkout",
      stagingStatus: 200,
      stagingLatency: 68,
      prodStatus: 422,
      prodLatency: 59,
      staging: JSON.stringify({ session_id: "chk_0192a", currency: "USD", customer_tax_id: "optional_vat_string" }, null, 2),
      prod: JSON.stringify({ session_id: "chk_0192a", currency: "USD" }, null, 2),
    },
    profile: {
      endpoint: "GET /v1/users/me",
      stagingStatus: 200,
      stagingLatency: 34,
      prodStatus: 200,
      prodLatency: 31,
      staging: JSON.stringify({ user_id: "usr_771", email_verified: true, plan_tier: "team_5_seat" }, null, 2),
      prod: JSON.stringify({ user_id: "usr_771", email_verified: true }, null, 2),
    },
  };

  const diffEndpointInput = document.getElementById("diff-endpoint-input");
  const diffStagingStatus = document.getElementById("diff-staging-status");
  const diffStagingLatency = document.getElementById("diff-staging-latency");
  const diffStagingInput = document.getElementById("diff-staging-input");
  const diffProdStatus = document.getElementById("diff-prod-status");
  const diffProdLatency = document.getElementById("diff-prod-latency");
  const diffProdInput = document.getElementById("diff-prod-input");
  const runDiffBtn = document.getElementById("run-diff-btn");
  const diffBanner = document.getElementById("diff-banner");
  const diffResult = document.getElementById("diff-result");
  const diffBtns = [...document.querySelectorAll(".diff-ep-btn")];
  const copyDiffBtn = document.getElementById("copy-diff-btn");
  const downloadDiffMdBtn = document.getElementById("download-diff-md-btn");
  let lastDiffReport = null;

  function parseNumericInput(el, fallback) {
    if (!el) return fallback;
    const raw = String(el.value ?? "").trim();
    if (!raw) return fallback;
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  }

  function renderLiveDiff() {
    if (!diffBanner || !diffStagingInput || !diffProdInput) return;
    const endpoint = (diffEndpointInput ? diffEndpointInput.value : "").trim() || "GET /v2/orders/{id}";
    const sStatus = parseNumericInput(diffStagingStatus, 200);
    const sLatency = parseNumericInput(diffStagingLatency, 40);
    const pStatus = parseNumericInput(diffProdStatus, 200);
    const pLatency = parseNumericInput(diffProdLatency, 40);

    const report = diffResponses(
      endpoint,
      { status: sStatus, latencyMs: sLatency, bodyText: diffStagingInput.value },
      { status: pStatus, latencyMs: pLatency, bodyText: diffProdInput.value }
    );
    lastDiffReport = report;
    diffBanner.textContent = report.summary;
    const hasWarn = report.entries.some((e) => e.severity === "warning");
    diffBanner.className = `diff-banner ${report.hasBreakingChanges ? "is-bad" : hasWarn ? "is-warn" : "is-ok"}`;

    if (diffResult) {
      diffResult.textContent = "";
      if (report.entries.length === 0) {
        const emptyRow = document.createElement("div");
        emptyRow.className = "diff-entry";
        emptyRow.textContent = "No structural, status, or latency drift detected.";
        diffResult.appendChild(emptyRow);
      } else {
        for (const entry of report.entries) {
          const row = document.createElement("div");
          row.className = "diff-entry";

          const pill = document.createElement("span");
          pill.className = `diff-pill ${entry.severity}`;
          pill.textContent = entry.severity;

          const pathCode = document.createElement("code");
          pathCode.textContent = entry.path;

          const kindSpan = document.createElement("span");
          kindSpan.textContent = `[${entry.kind}]`;

          const msgSpan = document.createElement("span");
          msgSpan.textContent = entry.message;

          row.appendChild(pill);
          row.appendChild(pathCode);
          row.appendChild(kindSpan);
          row.appendChild(msgSpan);
          diffResult.appendChild(row);
        }
      }
    }
  }

  function loadDiffPreset(key) {
    const preset = DIFF_PRESETS[key];
    if (!preset || !diffStagingInput || !diffProdInput) return;
    if (diffEndpointInput) diffEndpointInput.value = preset.endpoint;
    if (diffStagingStatus) diffStagingStatus.value = String(preset.stagingStatus);
    if (diffStagingLatency) diffStagingLatency.value = String(preset.stagingLatency);
    if (diffProdStatus) diffProdStatus.value = String(preset.prodStatus);
    if (diffProdLatency) diffProdLatency.value = String(preset.prodLatency);
    diffStagingInput.value = preset.staging;
    diffProdInput.value = preset.prod;
    renderLiveDiff();
  }

  diffBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      diffBtns.forEach((b) => b.classList.toggle("active", b === btn));
      loadDiffPreset(btn.dataset.endpoint || "orders");
    });
  });

  if (runDiffBtn) {
    runDiffBtn.addEventListener("click", renderLiveDiff);
  }
  [diffEndpointInput, diffStagingStatus, diffStagingLatency, diffStagingInput, diffProdStatus, diffProdLatency, diffProdInput].forEach((el) => {
    if (!el) return;
    let t = null;
    el.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(renderLiveDiff, 80);
    });
    el.addEventListener("change", () => {
      clearTimeout(t);
      renderLiveDiff();
    });
  });

  if (diffBanner && diffStagingInput && diffProdInput) {
    loadDiffPreset("orders");
  }
  if (copyDiffBtn) {
    copyDiffBtn.addEventListener("click", () => {
      if (lastDiffReport) copyText(formatDiffMarkdown(lastDiffReport), copyDiffBtn);
    });
  }
  if (downloadDiffMdBtn) {
    downloadDiffMdBtn.addEventListener("click", () => {
      if (lastDiffReport) triggerBlobDownload("schema-diff.md", formatDiffMarkdown(lastDiffReport), "text/markdown");
    });
  }

  // 7. Install CLI Copy, Modular Checkout Providers, Reservation & License Key Preview
  const copyCliBtns = [...document.querySelectorAll(".copy-cli-btn")];
  copyCliBtns.forEach((btn) => {
    btn.addEventListener("click", () => copyText(REQBRIDGE_CONFIG.cliInstallCommand, btn));
  });

  const providerBtns = [...document.querySelectorAll("[data-provider-slot]")];
  providerBtns.forEach((el) => {
    const plan = el.dataset.plan === "team" ? "team" : "personal";
    const provider = el.dataset.providerSlot;
    const url = REQBRIDGE_CONFIG.checkout[plan]?.[`${provider}Url`] || "";
    const statusEl = el.parentNode ? el.parentNode.querySelector("[data-provider-status]") : null;
    if (url) {
      el.setAttribute("href", url);
      el.classList.remove("btn-secondary");
      el.classList.add("btn-primary");
      if (statusEl) statusEl.textContent = "Live checkout link active";
    } else if (statusEl) {
      statusEl.textContent = "Checkout link pending merchant activation — use instant reservation below";
    }
  });

  const reservationForm = document.getElementById("reservation-form");
  const reservationOutput = document.getElementById("reservation-output");
  const reservationStatus = document.getElementById("reservation-status");
  const copyReservationBtn = document.getElementById("copy-reservation-btn");
  const reservationMailto = document.getElementById("reservation-mailto");

  if (reservationForm) {
    reservationForm.addEventListener("submit", async (e) => {
      if (e.preventDefault) e.preventDefault();
      const emailEl = document.getElementById("res-email");
      const toolEl = document.getElementById("res-tool");
      const planEl = document.getElementById("res-plan");
      const notesEl = document.getElementById("res-notes");
      const email = (emailEl ? emailEl.value : "").trim();
      const tool = toolEl ? toolEl.value : "Postman";
      const plan = planEl ? planEl.value : "Personal ($19 one-time)";
      const notes = (notesEl ? notesEl.value : "").trim();

      if (!email || !email.includes("@")) {
        if (reservationStatus) reservationStatus.textContent = "Please enter a valid work or personal email address.";
        return;
      }

      const summary = [
        `ReqBridge Local API — Early-Access License Request`,
        `Plan: ${plan}`,
        `Reply Email: ${email}`,
        `Migrating From: ${tool}`,
        `Notes: ${notes || "N/A"}`,
        `Preferred Channel: Creem (USD) / Mianbaoduo (RMB)`,
      ].join("\n");

      if (reservationOutput) reservationOutput.textContent = summary;
      if (reservationMailto) {
        const subject = encodeURIComponent(`ReqBridge License Request — ${plan}`);
        const body = encodeURIComponent(summary);
        reservationMailto.setAttribute("href", `mailto:${REQBRIDGE_CONFIG.supportEmail}?subject=${subject}&body=${body}`);
      }
      if (typeof localStorage !== "undefined") {
        try { localStorage.setItem("reqbridge_last_reservation", summary); } catch { /* ignore storage restrictions */ }
      }

      if (REQBRIDGE_CONFIG.reservationEndpoint) {
        try {
          const res = await fetch(REQBRIDGE_CONFIG.reservationEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, tool, plan, notes }),
          });
          if (reservationStatus) {
            reservationStatus.textContent = res.ok
              ? "Request submitted! We will send your checkout link and license instructions."
              : `Endpoint returned HTTP ${res.status}. Copy the request below or send via email.`;
          }
          return;
        } catch {
          // fall through to manual copy / mailto instruction
        }
      }

      if (reservationStatus) {
        reservationStatus.textContent =
          `Prepared locally (no card charged). Copy the request summary below or click "Open Email Client" to send to ${REQBRIDGE_CONFIG.supportEmail}.`;
      }
    });
  }

  if (copyReservationBtn && reservationOutput) {
    copyReservationBtn.addEventListener("click", () => copyText(reservationOutput.textContent || "", copyReservationBtn));
  }

  const licensePreviewBtn = document.getElementById("license-preview-btn");
  const licensePreviewInput = document.getElementById("license-preview-input");
  const licensePreviewResult = document.getElementById("license-preview-result");

  if (licensePreviewBtn && licensePreviewInput && licensePreviewResult) {
    licensePreviewBtn.addEventListener("click", () => {
      const key = licensePreviewInput.value.trim();
      if (!key) {
        licensePreviewResult.textContent = "Paste an RB1.<payload>.<signature> offline key or Creem/Gumroad license key to inspect its activation mode.";
        return;
      }
      if (key.startsWith("RB1.")) {
        const parts = key.split(".");
        if (parts.length !== 3 || !parts[1] || !parts[2]) {
          licensePreviewResult.textContent = "Malformed RB1 offline key: expected 3 dot-separated segments (RB1.<payload>.<signature>).";
          return;
        }
        try {
          const payload = JSON.parse(base64UrlToUtf8(parts[1]));
          licensePreviewResult.textContent =
            `Offline Ed25519 Key Detected — plan=${payload.plan || "unknown"}, seats=${payload.seats ?? "?"}, ` +
            `maxDevices=${payload.maxDevices ?? "?"}, id=${payload.id || "n/a"}. ` +
            `In VS Code, run Command Palette -> "ReqBridge: Manage Pro License / Activate Key" to verify signature locally (0 network calls).`;
        } catch {
          licensePreviewResult.textContent = "Could not decode RB1 payload segment (invalid base64url JSON).";
        }
        return;
      }
      licensePreviewResult.textContent =
        `Online License Key Format Detected (${key.length} chars). In VS Code, run Command Palette -> "ReqBridge: Manage Pro License / Activate Key" ` +
        `to activate via Creem / Gumroad (stores verified status in vscode.SecretStorage bound to machineId).`;
    });
  }
})();
