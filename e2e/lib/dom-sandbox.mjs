import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rarr;/g, '→')
    .replace(/&harr;/g, '↔');
}

function parseAttributes(attrString) {
  const attrs = new Map();
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = re.exec(attrString)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs.set(key, decodeHtmlEntities(val));
  }
  return attrs;
}

/**
 * Parses HTML string into lightweight DOM elements tracking tag, id, classes, attributes, and text.
 */
function buildDomFromHtml(html, docOwner) {
  const root = docOwner._createElementInternal('document');
  const htmlEl = docOwner._createElementInternal('html');
  const headEl = docOwner._createElementInternal('head');
  const bodyEl = docOwner._createElementInternal('body');
  root.appendChild(htmlEl);

  const stack = [root];
  const tokenRe = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let match;

  while ((match = tokenRe.exec(html)) !== null) {
    if (match[1]) {
      // Closing tag
      const closeTag = match[1].toLowerCase();
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i].tagName.toLowerCase() === closeTag) {
          stack.length = i;
          break;
        }
      }
    } else if (match[2]) {
      const tag = match[2].toLowerCase();
      const attrStr = match[3] || '';
      const selfClosing = Boolean(match[4]) || VOID_TAGS.has(tag);
      const el = docOwner._createElementInternal(tag);
      const attrs = parseAttributes(attrStr);
      for (const [k, v] of attrs.entries()) {
        el._setInitialAttribute(k, v);
      }
      const parent = stack[stack.length - 1];
      parent.appendChild(el);
      if (!selfClosing) {
        stack.push(el);
      }
    } else if (match[5]) {
      const parent = stack[stack.length - 1];
      const decoded = decodeHtmlEntities(match[5]);
      if (parent && parent.tagName !== 'DOCUMENT' && parent.tagName !== 'HTML') {
        parent._appendRawText(decoded);
      }
    }
  }

  // Ensure documentElement / head / body convenience refs
  const foundHtml = root.querySelector('html') || htmlEl;
  const foundHead = foundHtml.querySelector('head') || headEl;
  const foundBody = foundHtml.querySelector('body') || bodyEl;
  return { root, htmlEl: foundHtml, headEl: foundHead, bodyEl: foundBody };
}

function matchesSimpleSelector(el, part) {
  if (!el || !el.tagName || el.tagName === 'DOCUMENT') return false;
  let rest = part.trim();
  if (!rest) return false;

  // Tag prefix if present
  const tagMatch = rest.match(/^([a-zA-Z0-9_-]+|\*)/);
  if (tagMatch) {
    const tag = tagMatch[1];
    if (tag !== '*' && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    rest = rest.slice(tag.length);
  }

  while (rest.length > 0) {
    if (rest.startsWith('#')) {
      const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
      if (!m) return false;
      if (el.id !== m[1]) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('.')) {
      const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
      if (!m) return false;
      if (!el.classList.contains(m[1])) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('[')) {
      const m = rest.match(/^\[([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/);
      if (!m) return false;
      const attrName = m[1].toLowerCase();
      if (!el.hasAttribute(attrName)) return false;
      const expected = m[2] ?? m[3] ?? m[4];
      if (expected !== undefined && el.getAttribute(attrName) !== expected) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith(':not(')) {
      const closeIdx = rest.indexOf(')', 5);
      if (closeIdx === -1) return false;
      const inner = rest.slice(5, closeIdx).trim();
      if (!inner || matchesSimpleSelector(el, inner)) return false;
      rest = rest.slice(closeIdx + 1);
    } else {
      return false;
    }
  }
  return true;
}

function matchesSelector(el, selector) {
  const groups = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
  for (const group of groups) {
    const parts = group.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    if (!matchesSimpleSelector(el, parts[parts.length - 1])) continue;
    let cur = el.parentNode;
    let matched = true;
    for (let i = parts.length - 2; i >= 0; i -= 1) {
      while (cur && !matchesSimpleSelector(cur, parts[i])) {
        cur = cur.parentNode;
      }
      if (!cur) {
        matched = false;
        break;
      }
      cur = cur.parentNode;
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Creates a node:vm browser sandbox seeded from an HTML file (or string) and executes client JS.
 * @param {{
 *   htmlPath?: string;
 *   htmlContent?: string;
 *   scriptPath?: string;
 *   scriptContent?: string;
 *   url?: string;
 *   fetchImpl?: typeof fetch;
 * }} options
 */
export function createDomSandbox(options = {}) {
  const htmlText =
    options.htmlContent ??
    (options.htmlPath ? fs.readFileSync(options.htmlPath, 'utf8') : '<!DOCTYPE html><html><head></head><body></body></html>');

  const activeTimeouts = new Set();
  const activeIntervals = new Set();
  let intervalCount = 0;
  const fetchCalls = [];
  const copiedTexts = [];
  const blobs = [];
  const objectUrls = new Map();
  const innerHtmlWrites = [];
  const windowListeners = new Map();

  const doc = {
    _elementsById: new Map(),
    _createElementInternal(tagName) {
      const attrs = new Map();
      const classes = new Set();
      const listeners = new Map();
      const children = [];
      let textBuf = '';
      let valueBuf = '';
      let innerHtmlBuf = '';
      let hiddenVal = false;
      let disabledVal = false;
      let checkedVal = false;

      const el = {
        tagName: tagName.toUpperCase(),
        parentNode: null,
        children,
        style: {},
        files: [],
        scrollTop: 0,
        scrollHeight: 200,
        get id() {
          return attrs.get('id') || '';
        },
        set id(v) {
          el.setAttribute('id', v);
        },
        get className() {
          return [...classes].join(' ');
        },
        set className(v) {
          classes.clear();
          String(v)
            .split(/\s+/)
            .filter(Boolean)
            .forEach((c) => classes.add(c));
          attrs.set('class', [...classes].join(' '));
        },
        classList: {
          add(...names) {
            names.filter(Boolean).forEach((n) => classes.add(n));
            attrs.set('class', [...classes].join(' '));
          },
          remove(...names) {
            names.forEach((n) => classes.delete(n));
            attrs.set('class', [...classes].join(' '));
          },
          toggle(name, force) {
            if (force === undefined) {
              if (classes.has(name)) {
                classes.delete(name);
                attrs.set('class', [...classes].join(' '));
                return false;
              }
              classes.add(name);
              attrs.set('class', [...classes].join(' '));
              return true;
            }
            if (force) classes.add(name);
            else classes.delete(name);
            attrs.set('class', [...classes].join(' '));
            return Boolean(force);
          },
          contains(name) {
            return classes.has(name);
          },
        },
        dataset: new Proxy(
          {},
          {
            get(_, prop) {
              if (typeof prop !== 'string') return undefined;
              return attrs.get(`data-${camelToKebab(prop)}`);
            },
            set(_, prop, val) {
              if (typeof prop === 'string') {
                attrs.set(`data-${camelToKebab(prop)}`, String(val));
              }
              return true;
            },
            ownKeys() {
              const keys = [];
              for (const k of attrs.keys()) {
                if (k.startsWith('data-')) keys.push(kebabToCamel(k.slice(5)));
              }
              return keys;
            },
            getOwnPropertyDescriptor(_, prop) {
              if (typeof prop !== 'string') return undefined;
              const k = `data-${camelToKebab(prop)}`;
              if (!attrs.has(k)) return undefined;
              return { enumerable: true, configurable: true, value: attrs.get(k) };
            },
          },
        ),
        get hidden() {
          return hiddenVal;
        },
        set hidden(v) {
          hiddenVal = Boolean(v);
          if (hiddenVal) attrs.set('hidden', '');
          else attrs.delete('hidden');
        },
        get disabled() {
          return disabledVal;
        },
        set disabled(v) {
          disabledVal = Boolean(v);
        },
        get checked() {
          return checkedVal;
        },
        set checked(v) {
          checkedVal = Boolean(v);
        },
        get value() {
          if (el.tagName === 'SELECT' && !valueBuf && children.length > 0) {
            const selected = children.find((c) => c.hasAttribute?.('selected')) || children[0];
            return selected?.value ?? selected?.getAttribute?.('value') ?? '';
          }
          return valueBuf;
        },
        set value(v) {
          valueBuf = v === undefined || v === null ? '' : String(v);
        },
        get textContent() {
          if (children.length === 0) return textBuf;
          return textBuf + children.map((c) => c.textContent).join('');
        },
        set textContent(v) {
          children.length = 0;
          textBuf = v === undefined || v === null ? '' : String(v);
          if (el.tagName === 'TEXTAREA') {
            valueBuf = textBuf;
          }
        },
        get innerText() {
          return el.textContent;
        },
        set innerText(v) {
          el.textContent = v;
        },
        get innerHTML() {
          return innerHtmlBuf || el.textContent;
        },
        set innerHTML(v) {
          const str = v === undefined || v === null ? '' : String(v);
          innerHtmlBuf = str;
          innerHtmlWrites.push({ id: el.id || el.tagName, html: str });
          children.length = 0;
          textBuf = str.replace(/<[^>]+>/g, '');
        },
        get href() {
          return attrs.get('href') || '';
        },
        set href(v) {
          attrs.set('href', String(v));
        },
        get download() {
          return attrs.get('download') || '';
        },
        set download(v) {
          attrs.set('download', String(v));
        },
        _appendRawText(t) {
          textBuf += t;
          if (el.tagName === 'TEXTAREA') valueBuf += t;
        },
        _setInitialAttribute(k, v) {
          attrs.set(k, v);
          if (k === 'id' && v) doc._elementsById.set(v, el);
          if (k === 'class') {
            String(v)
              .split(/\s+/)
              .filter(Boolean)
              .forEach((c) => classes.add(c));
          }
          if (k === 'hidden') hiddenVal = true;
          if (k === 'disabled') disabledVal = true;
          if (k === 'checked') checkedVal = true;
          if (k === 'value') valueBuf = v;
        },
        setAttribute(k, v) {
          const key = String(k).toLowerCase();
          const val = String(v);
          attrs.set(key, val);
          if (key === 'id') doc._elementsById.set(val, el);
          if (key === 'class') el.className = val;
          if (key === 'hidden') hiddenVal = true;
          if (key === 'value') valueBuf = val;
        },
        getAttribute(k) {
          const key = String(k).toLowerCase();
          return attrs.has(key) ? attrs.get(key) : null;
        },
        hasAttribute(k) {
          return attrs.has(String(k).toLowerCase());
        },
        removeAttribute(k) {
          const key = String(k).toLowerCase();
          attrs.delete(key);
          if (key === 'hidden') hiddenVal = false;
        },
        appendChild(child) {
          if (child && typeof child === 'object') {
            child.parentNode = el;
            children.push(child);
          }
          return child;
        },
        removeChild(child) {
          const idx = children.indexOf(child);
          if (idx >= 0) children.splice(idx, 1);
          if (child) child.parentNode = null;
          return child;
        },
        addEventListener(type, fn) {
          const key = String(type);
          if (!listeners.has(key)) listeners.set(key, new Set());
          listeners.get(key).add(fn);
        },
        removeEventListener(type, fn) {
          listeners.get(String(type))?.delete(fn);
        },
        dispatchEvent(evt) {
          const eventObj =
            typeof evt === 'string'
              ? { type: evt, target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} }
              : {
                  ...evt,
                  target: evt.target || el,
                  currentTarget: el,
                  preventDefault() {},
                  stopPropagation() {},
                };
          const set = listeners.get(eventObj.type);
          if (set) {
            for (const fn of [...set]) {
              fn.call(el, eventObj);
            }
          }
          return true;
        },
        click() {
          el.dispatchEvent({ type: 'click', target: el });
        },
        focus() {},
        select() {},
        getBoundingClientRect() {
          return { top: 100, left: 0, right: 200, bottom: 200, width: 200, height: 100 };
        },
        querySelectorAll(sel) {
          const out = [];
          function walk(node) {
            for (const c of node.children) {
              if (matchesSelector(c, sel)) out.push(c);
              walk(c);
            }
          }
          walk(el);
          return out;
        },
        querySelector(sel) {
          return el.querySelectorAll(sel)[0] || null;
        },
        closest(sel) {
          let cur = el;
          while (cur && cur.tagName && cur.tagName !== 'DOCUMENT') {
            if (matchesSelector(cur, sel)) return cur;
            cur = cur.parentNode;
          }
          return null;
        },
      };
      return el;
    },
  };

  const { root, htmlEl, headEl, bodyEl } = buildDomFromHtml(htmlText, doc);

  const documentObj = {
    documentElement: htmlEl,
    head: headEl,
    body: bodyEl,
    readyState: 'complete',
    createElement(tag) {
      return doc._createElementInternal(tag);
    },
    getElementById(id) {
      return doc._elementsById.get(String(id)) || null;
    },
    querySelectorAll(sel) {
      return root.querySelectorAll(sel);
    },
    querySelector(sel) {
      return root.querySelector(sel);
    },
    execCommand(cmd) {
      if (cmd === 'copy') return true;
      return false;
    },
    addEventListener(type, fn) {
      if (!windowListeners.has(`doc:${type}`)) windowListeners.set(`doc:${type}`, new Set());
      windowListeners.get(`doc:${type}`).add(fn);
    },
  };

  class MockBlob {
    constructor(parts = [], opts = {}) {
      this._parts = parts;
      this.type = opts.type || '';
      const buffers = parts.map((p) => {
        if (Buffer.isBuffer(p)) return p;
        if (ArrayBuffer.isView(p)) return Buffer.from(p.buffer, p.byteOffset, p.byteLength);
        if (p instanceof ArrayBuffer || Object.prototype.toString.call(p) === '[object ArrayBuffer]') {
          return Buffer.from(p);
        }
        return Buffer.from(String(p), 'utf8');
      });
      this._buffer = Buffer.concat(buffers);
      this.size = this._buffer.length;
      blobs.push(this);
    }
    async text() {
      return this._buffer.toString('utf8');
    }
    async arrayBuffer() {
      return this._buffer.buffer.slice(this._buffer.byteOffset, this._buffer.byteOffset + this._buffer.byteLength);
    }
  }

  class MockFileReader {
    constructor() {
      this.result = null;
      this.onload = null;
      this.onerror = null;
    }
    readAsText(file) {
      Promise.resolve()
        .then(async () => {
          if (file && typeof file.text === 'function') {
            this.result = await file.text();
          } else if (file && typeof file.content === 'string') {
            this.result = file.content;
          } else {
            this.result = String(file ?? '');
          }
          if (typeof this.onload === 'function') {
            this.onload({ target: this });
          }
        })
        .catch((err) => {
          if (typeof this.onerror === 'function') this.onerror(err);
        });
    }
  }

  let blobSeq = 0;
  const MockURL = class extends URL {
    static createObjectURL(blob) {
      blobSeq += 1;
      const url = `blob:reqbridge-sandbox/${blobSeq}`;
      objectUrls.set(url, blob);
      return url;
    }
    static revokeObjectURL(url) {
      objectUrls.delete(url);
    }
  };

  const sandboxFetch = async (input, init) => {
    const reqUrl = typeof input === 'string' ? input : input?.url || String(input);
    fetchCalls.push({ url: reqUrl, init: init || {} });
    const impl = options.fetchImpl || globalThis.fetch;
    return await impl(input, init);
  };

  const wrappedSetTimeout = (fn, ms = 0, ...args) => {
    const t = setTimeout(() => {
      activeTimeouts.delete(t);
      if (typeof fn === 'function') fn(...args);
    }, ms);
    activeTimeouts.add(t);
    return t;
  };
  const wrappedClearTimeout = (t) => {
    activeTimeouts.delete(t);
    clearTimeout(t);
  };
  const wrappedSetInterval = (fn, ms = 0, ...args) => {
    intervalCount += 1;
    const t = setInterval(() => {
      if (typeof fn === 'function') fn(...args);
    }, ms);
    activeIntervals.add(t);
    return t;
  };
  const wrappedClearInterval = (t) => {
    activeIntervals.delete(t);
    clearInterval(t);
  };

  const windowObj = {
    document: documentObj,
    innerHeight: 900,
    innerWidth: 1280,
    location: new URL(options.url || 'http://127.0.0.1/index.html'),
    navigator: {
      clipboard: {
        async writeText(text) {
          copiedTexts.push(String(text));
        },
        async readText() {
          return copiedTexts[copiedTexts.length - 1] || '';
        },
      },
    },
    Blob: MockBlob,
    URL: MockURL,
    FileReader: MockFileReader,
    fetch: sandboxFetch,
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      windowListeners.get(type)?.delete(fn);
    },
    setTimeout: wrappedSetTimeout,
    clearTimeout: wrappedClearTimeout,
    setInterval: wrappedSetInterval,
    clearInterval: wrappedClearInterval,
  };

  const context = vm.createContext({
    window: windowObj,
    self: windowObj,
    globalThis: windowObj,
    document: documentObj,
    navigator: windowObj.navigator,
    location: windowObj.location,
    Blob: MockBlob,
    URL: MockURL,
    URLSearchParams,
    FileReader: MockFileReader,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    DataView,
    fetch: sandboxFetch,
    console,
    setTimeout: wrappedSetTimeout,
    clearTimeout: wrappedClearTimeout,
    setInterval: wrappedSetInterval,
    clearInterval: wrappedClearInterval,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
  });
  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.globalThis = windowObj;

  const scriptText =
    options.scriptContent ??
    (options.scriptPath ? fs.readFileSync(options.scriptPath, 'utf8') : null);

  if (scriptText !== null) {
    vm.runInContext(scriptText, context, {
      filename: options.scriptPath || 'landing-script.js',
    });
  }

  function resolveElement(selectorOrId) {
    if (typeof selectorOrId !== 'string') return selectorOrId;
    if (selectorOrId.startsWith('#') || selectorOrId.startsWith('.') || selectorOrId.includes('[')) {
      return documentObj.querySelector(selectorOrId);
    }
    return documentObj.getElementById(selectorOrId) || documentObj.querySelector(selectorOrId);
  }

  return {
    window: windowObj,
    document: documentObj,
    context,
    el: resolveElement,
    all(selector) {
      return documentObj.querySelectorAll(selector);
    },
    click(selectorOrId) {
      const target = resolveElement(selectorOrId);
      if (!target) throw new Error(`Element not found for click: ${selectorOrId}`);
      target.click();
      return target;
    },
    setValue(selectorOrId, value, opts = {}) {
      const target = resolveElement(selectorOrId);
      if (!target) throw new Error(`Element not found for setValue: ${selectorOrId}`);
      target.value = value;
      if (opts.input !== false) target.dispatchEvent({ type: 'input', target });
      if (opts.change !== false) target.dispatchEvent({ type: 'change', target });
      return target;
    },
    uploadFile(selectorOrId, fileName, content, mimeType = 'text/plain') {
      const target = resolveElement(selectorOrId);
      if (!target) throw new Error(`Element not found for uploadFile: ${selectorOrId}`);
      const buf = Buffer.from(String(content), 'utf8');
      target.files = [
        {
          name: fileName,
          type: mimeType,
          size: buf.length,
          content: String(content),
          async text() {
            return String(content);
          },
          async arrayBuffer() {
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          },
        },
      ];
      target.dispatchEvent({ type: 'change', target });
      return target;
    },
    async flush(ms = 30) {
      await new Promise((r) => setTimeout(r, ms));
    },
    getFetchCalls() {
      return [...fetchCalls];
    },
    getCopiedTexts() {
      return [...copiedTexts];
    },
    getBlobs() {
      return blobs.map((b) => ({
        type: b.type,
        size: b.size,
        buffer: b._buffer,
        text: b._buffer.toString('utf8'),
      }));
    },
    getInnerHtmlWrites() {
      return [...innerHtmlWrites];
    },
    getIntervalCount() {
      return intervalCount;
    },
    dispose() {
      for (const t of activeTimeouts) clearTimeout(t);
      for (const t of activeIntervals) clearInterval(t);
      activeTimeouts.clear();
      activeIntervals.clear();
    },
  };
}

/**
 * Convenience loader for landing/index.html + landing/demo.js.
 */
export function createLandingSandbox(landingDir, opts = {}) {
  return createDomSandbox({
    htmlPath: path.join(landingDir, opts.htmlFile || 'index.html'),
    scriptPath: path.join(landingDir, opts.scriptFile || 'demo.js'),
    url: opts.url || 'http://127.0.0.1/index.html',
    fetchImpl: opts.fetchImpl,
  });
}
