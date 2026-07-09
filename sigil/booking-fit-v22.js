(() => {
  "use strict";

  const root = document.querySelector("[data-sigil-booking-fit-v22]");
  if (!root) return;

  const HOST = location.hostname;
  const IS_WEBFLOW = HOST.includes("webflow.io");
  const API_BASE = IS_WEBFLOW ? "https://sigil.mmdbkk.com" : "";

  const SAFE_PARAMS = [
    "t",
    "code",
    "promo",
    "source",
    "tier",
    "model_key",
    "guide",
    "fit",
    "model_fit",
    "visibility",
    "scope",
    "work_type",
    "request_id"
  ];

  const CATALOG_URLS = [
    "https://models.mmdbkk.com/sigil/booking/index.json",
    "https://models.mmdbkk.com/models/index.json"
  ];

  const WORKERS = Object.freeze({
    modelsSearch: `${API_BASE}/api/sigil/models/search`,
    modelsNew: `${API_BASE}/api/sigil/models/new-arrivals`,
    modelDetail: (id) => `${API_BASE}/api/sigil/models/${encodeURIComponent(id)}`,
    modelImage: `${API_BASE}/api/sigil/models/image`,
    bookingRequest: `${API_BASE}/api/sigil/booking/request`
  });

  const qs = new URLSearchParams(location.search);

  const state = {
    mode: "model",
    q: "",
    scope: normalizeScope(qs.get("visibility") || qs.get("scope")) || "public",
    fit: normalizeFit(qs.get("fit") || qs.get("model_fit")) || "straight",
    workType: clean(qs.get("work_type")) || "all",
    routeGuide: clean(qs.get("guide")) || "none",
    catalog: [],
    models: [],
    previewModels: [],
    selected: null,
    sheetModel: null,
    submitting: false,
    activeController: null,
    timer: null
  };

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => Array.from(root.querySelectorAll(selector));

  const els = {
    search: $("#sbf22-search"),
    previewStatus: $("#sbf22-preview-status"),
    previewResults: $("#sbf22-preview-results"),
    searchStatus: $("#sbf22-search-status"),
    results: $("#sbf22-results"),
    workType: $("[data-work-type]"),
    form: $("#sbf22-form"),
    selectedName: $("#sbf22-selected-name"),
    selectedCopy: $("#sbf22-selected-copy"),
    dockTitle: $("#sbf22-dock-title"),
    submitStatus: $("#sbf22-submit-status"),
    hiddenModelKey: $("#sbf22-hidden-model-key"),
    hiddenScope: $("#sbf22-hidden-scope"),
    hiddenFit: $("#sbf22-hidden-fit"),
    backdrop: $(".sbf22-backdrop"),
    sheet: $("#sbf22-sheet"),
    sheetImg: $("#sbf22-sheet-img"),
    sheetTags: $("#sbf22-sheet-tags"),
    sheetTitle: $("#sbf22-sheet-title"),
    sheetCopy: $("#sbf22-sheet-copy")
  };

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeScope(value) {
    const cleanValue = clean(value).toLowerCase();
    if (cleanValue === "private") return "private";
    if (cleanValue === "public") return "public";
    return "";
  }

  function normalizeFit(value) {
    const cleanValue = clean(value).toLowerCase().replace("_fit", "").replace("-fit", "");
    if (cleanValue === "gay") return "gay";
    if (cleanValue === "straight") return "straight";
    return "";
  }

  function boolish(value) {
    if (value === true) return true;
    if (value === false) return false;
    const cleanValue = clean(value).toLowerCase();
    return ["true", "yes", "1", "y", "enabled", "open"].includes(cleanValue);
  }

  function toArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(toArray).filter(Boolean);

    return String(value)
      .split(/[,|]/)
      .map((item) => clean(item))
      .filter(Boolean);
  }

  function sourceFields(item) {
    if (!item) return {};
    if (item.fields && typeof item.fields === "object") return { ...item.fields, ...item };
    return item;
  }

  function safeParamObject() {
    const out = {};

    SAFE_PARAMS.forEach((key) => {
      const value = clean(qs.get(key));
      if (value) out[key] = value;
    });

    return out;
  }

  function preserveUrl(rawUrl) {
    const url = new URL(rawUrl, location.origin);
    const preserved = safeParamObject();

    Object.entries(preserved).forEach(([key, value]) => {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    });

    return url.pathname + url.search + url.hash;
  }

  function makeUrl(endpoint, params = {}) {
    const url = new URL(endpoint, location.origin);
    const next = new URLSearchParams();

    Object.entries(safeParamObject()).forEach(([key, value]) => next.set(key, value));

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && clean(value) !== "") {
        next.set(key, clean(value));
      }
    });

    url.search = next.toString();
    return url.toString();
  }

  function credentialsMode(endpoint = "") {
    if (API_BASE || /^https:\/\/models\.mmdbkk\.com/.test(endpoint)) return "omit";
    return "same-origin";
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: credentialsMode(url),
      headers: {
        accept: "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message = isJson && payload && (payload.error || payload.message)
        ? payload.error || payload.message
        : `HTTP ${response.status}`;

      throw new Error(message);
    }

    return payload;
  }

  function normalizeArray(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    return payload.results || payload.models || payload.records || payload.items || payload.data || payload.catalog || [];
  }

  function normalizeModel(item) {
    const s = sourceFields(item);

    const model_key =
      s.model_key ||
      s.modelKey ||
      s.key ||
      s.id ||
      s.modelId ||
      s.model_id ||
      s.recordId ||
      s.record_id ||
      "";

    const display_name =
      s.display_name ||
      s.displayName ||
      s.public_name ||
      s.publicName ||
      s.name ||
      s.model_name ||
      s.modelName ||
      s.nickname ||
      "Private File";

    const slug =
      s.slug ||
      s.model_slug ||
      s.code ||
      s.model_code ||
      "";

    const status = s.status || s.model_status || "active";

    const booking_visibility =
      s.booking_visibility ||
      s.visibility ||
      s.profile_visibility ||
      s["Profile Visibility"] ||
      "public";

    const publicSearchEnabled =
      boolish(s.public_search_enabled) ||
      boolish(s.publicSearchEnabled) ||
      boolish(s["Public Search Enabled"]);

    const privateSearchEnabled =
      boolish(s.private_search_enabled) ||
      boolish(s.privateSearchEnabled) ||
      boolish(s["Private Search Enabled"]);

    const bookingRequestEnabled =
      s.booking_request_enabled === undefined &&
      s.bookingRequestEnabled === undefined &&
      s["Booking Request Enabled"] === undefined
        ? true
        : boolish(s.booking_request_enabled) ||
          boolish(s.bookingRequestEnabled) ||
          boolish(s["Booking Request Enabled"]);

    const clientFitTags = toArray(
      s.client_fit_tags ||
      s.clientFitTags ||
      s["Client Fit Tags"] ||
      s.fit_tags ||
      s.fitTags ||
      s.model_fit ||
      s.modelFit ||
      s.fit
    );

    const tiers = toArray(s.tiers || s.tier || s.displayTier || s["Display Tier"]);

    const jobTypes = toArray(
      s.job_types ||
      s.jobTypes ||
      s.service_category ||
      s.serviceCategory ||
      s["Service Category"] ||
      s.accepted_service_interests ||
      s.acceptedServiceInterests
    );

    const summary =
      s.customer_group_note_public ||
      s.public_note ||
      s.publicNote ||
      s.summary ||
      s.public_summary ||
      s.publicSummary ||
      s.safe_summary ||
      s.description ||
      "ข้อมูลนี้เป็น preview ที่เปิดให้ดูได้เท่านั้น MMD จะตรวจแฟ้มจริงอีกครั้งก่อนตอบกลับ";

    const rawImage =
      s.card_image ||
      s.cardImage ||
      s.cardImageUrl ||
      s.card_image_url ||
      s.hero_image ||
      s.heroImage ||
      s.heroImageUrl ||
      s.thumb_image ||
      s.imageUrl ||
      s.image_url ||
      s.public_image_url ||
      s["Public Image URL"] ||
      s["R2 Public Image URL"] ||
      "";

    const imageKey =
      state.scope === "private"
        ? s.r2_private_image_key || s.private_image_key || s["R2 Private Image Key"] || ""
        : s.r2_public_image_key || s.public_image_key || s["R2 Public Image Key"] || "";

    const imageUrl = rawImage || (model_key ? makeUrl(WORKERS.modelImage, { id: model_key, key: imageKey, scope: state.scope }) : "");

    return {
      model_key,
      display_name,
      slug,
      status,
      booking_visibility: clean(booking_visibility).toLowerCase(),
      publicSearchEnabled,
      privateSearchEnabled,
      bookingRequestEnabled,
      clientFitTags,
      tiers,
      jobTypes,
      summary,
      imageUrl,
      sort_priority: Number(s.sort_priority || s.sortPriority || 999),
      updated_at: s.updated_at || s.updatedAt || ""
    };
  }

  function isActive(model) {
    if (!model || !model.model_key) return false;
    if (!model.bookingRequestEnabled) return false;

    const status = clean(model.status).toLowerCase();
    const visibility = clean(model.booking_visibility).toLowerCase();

    if (!["active", "available", "open"].includes(status)) return false;
    if (["hidden", "archived", "paused"].includes(visibility)) return false;

    return true;
  }

  function modelMatchesScope(model) {
    const visibility = clean(model.booking_visibility).toLowerCase();

    if (state.scope === "private") {
      return model.privateSearchEnabled || visibility === "private" || visibility === "all";
    }

    return model.publicSearchEnabled || visibility === "public" || visibility === "all";
  }

  function modelMatchesFit(model) {
    const wanted = normalizeFit(state.fit);
    const tags = (model.clientFitTags || [])
      .map((tag) => clean(tag).toLowerCase().replace("_fit", "").replace("-fit", ""));

    if (!wanted) return false;
    if (!tags.length) return false;

    return tags.includes(wanted) || tags.includes("both") || tags.includes("all");
  }

  function modelMatchesWork(model) {
    if (!state.workType || state.workType === "all") return true;

    const wanted = clean(state.workType).toLowerCase();
    const jobs = (model.jobTypes || []).map((item) => clean(item).toLowerCase());

    if (!jobs.length) return true;

    return jobs.includes(wanted) ||
      jobs.includes("all") ||
      jobs.includes("case_by_case") ||
      jobs.includes(wanted.replace("_", "-"));
  }

  function filterCatalog(list, query = "") {
    const q = clean(query).toLowerCase();

    return list
      .map(normalizeModel)
      .filter(isActive)
      .filter(modelMatchesScope)
      .filter(modelMatchesFit)
      .filter(modelMatchesWork)
      .filter((model) => {
        if (!q) return true;

        return [
          model.model_key,
          model.display_name,
          model.slug,
          model.summary,
          ...(model.clientFitTags || []),
          ...(model.tiers || []),
          ...(model.jobTypes || [])
        ].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => a.sort_priority - b.sort_priority);
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function attr(value) {
    return esc(value).replace(/`/g, "&#096;");
  }

  function tag(label) {
    const value = clean(label);
    if (!value) return "";
    return `<span class="sbf22-tag">${esc(value)}</span>`;
  }

  function skeleton(count = 3) {
    return Array.from({ length: count }).map(() => `<div class="sbf22-skeleton" aria-hidden="true"></div>`).join("");
  }

  function emptyMarkup(message) {
    return `<article class="sbf22-empty">${message}</article>`;
  }

  function setSearchStatus(message) {
    if (els.searchStatus) els.searchStatus.textContent = message || "";
  }

  function setSubmitStatus(message, type = "") {
    if (!els.submitStatus) return;

    els.submitStatus.textContent = message || "";
    els.submitStatus.classList.toggle("show", !!message);
    els.submitStatus.classList.toggle("ok", type === "ok");
    els.submitStatus.classList.toggle("err", type === "err");
  }

  async function loadCatalog() {
    for (const url of CATALOG_URLS) {
      try {
        const payload = await fetchJson(url);
        const list = normalizeArray(payload);

        if (list.length) {
          state.catalog = list.map(normalizeModel);
          return state.catalog;
        }
      } catch (error) {}
    }

    return [];
  }

  function modelCard(model, context = "search") {
    const keyLine = [model.model_key, model.slug].filter(Boolean).join(" · ") || "MMD file";
    const scopeLabel = state.scope === "private" ? "Private" : "Public";
    const fitLabel = state.fit === "gay" ? "Gay" : "Straight";

    const tags = [
      scopeLabel,
      fitLabel,
      ...(model.tiers || []),
      ...(model.jobTypes || [])
    ].filter(Boolean).slice(0, 6);

    const bg = model.imageUrl
      ? `style="background-image:linear-gradient(180deg,transparent 0%,rgba(5,5,5,.34) 42%,rgba(5,5,5,.95) 86%),url('${attr(model.imageUrl)}');"`
      : "";

    return `
      <article class="sbf22-model-card" data-model="${attr(model.model_key)}">
        <div class="sbf22-model-img" ${bg}></div>
        <div class="sbf22-model-content">
          <div class="sbf22-tags">${tags.map(tag).join("")}</div>
          <h3 class="sbf22-model-name">${esc(model.display_name)}</h3>
          <p class="sbf22-model-meta">${esc(keyLine)}</p>
          <div class="sbf22-model-actions">
            <button class="primary" type="button" data-action="select-model" data-key="${attr(model.model_key)}" data-context="${attr(context)}">เลือก model_key นี้</button>
            <button class="secondary" type="button" data-action="open-detail" data-key="${attr(model.model_key)}" data-context="${attr(context)}">ดูแฟ้ม preview</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderModels(models, target, context = "search") {
    if (context === "preview") state.previewModels = models;
    else state.models = models;

    if (!target) return;

    if (!models.length) {
      target.innerHTML = emptyMarkup(
        "<strong>ยังไม่พบรายการในแฟ้มนี้ครับ</strong><br>ลองเปลี่ยน Public / Private, Straight / Gay หรือให้ MMD ช่วยค้นจากแฟ้มต่อได้"
      );
      return;
    }

    target.innerHTML = models.map((model) => modelCard(model, context)).join("");
  }

  async function loadPreviewModels() {
    if (!els.previewResults) return;

    els.previewResults.innerHTML = skeleton(3);
    if (els.previewStatus) els.previewStatus.textContent = "กำลังเปิดแฟ้มที่ค้นได้...";

    const catalog = state.catalog.length ? state.catalog : await loadCatalog();
    const filtered = filterCatalog(catalog).slice(0, 8);

    if (filtered.length) {
      renderModels(filtered, els.previewResults, "preview");
      if (els.previewStatus) {
        els.previewStatus.textContent = `เจอ ${filtered.length} รายการในแฟ้ม ${state.scope} / ${state.fit}`;
      }
      return;
    }

    try {
      const payload = await fetchJson(makeUrl(WORKERS.modelsNew, {
        visibility: state.scope,
        scope: state.scope,
        fit: state.fit,
        client_fit: state.fit,
        model_fit: state.fit,
        work_type: state.workType,
        job_type: state.workType,
        limit: 8
      }));

      const list = filterCatalog(normalizeArray(payload)).slice(0, 8);
      renderModels(list, els.previewResults, "preview");

      if (els.previewStatus) {
        els.previewStatus.textContent = list.length
          ? `เจอ ${list.length} รายการจาก worker`
          : "ยังไม่มีรายการที่เปิด preview ในเงื่อนไขนี้";
      }
    } catch (error) {
      els.previewResults.innerHTML = emptyMarkup("<strong>ยังโหลดแฟ้มไม่ได้ครับ</strong><br>ส่งคำขอให้ MMD ช่วยค้นต่อได้เลย");
      if (els.previewStatus) els.previewStatus.textContent = "ยังโหลดแฟ้มไม่ได้";
    }
  }

  async function loadSearchModels(force = false) {
    if (!els.results) return;

    const q = clean(els.search ? els.search.value : "");

    if (!force && !q) {
      els.results.innerHTML = "";
      setSearchStatus("พิมพ์ชื่อ nickname slug หรือ model_key ได้เลยครับ");
      return;
    }

    state.q = q;

    const local = filterCatalog(state.catalog, q).slice(0, 12);
    if (local.length) {
      renderModels(local, els.results, "search");
      setSearchStatus(`เจอ ${local.length} รายการในแฟ้ม ${state.scope} / ${state.fit}`);
      return;
    }

    if (state.activeController) state.activeController.abort();
    state.activeController = new AbortController();

    els.results.innerHTML = skeleton(3);
    setSearchStatus("กำลังให้ worker ช่วยค้นแฟ้ม...");

    try {
      const payload = await fetchJson(makeUrl(WORKERS.modelsSearch, {
        q: state.q,
        visibility: state.scope,
        scope: state.scope,
        fit: state.fit,
        client_fit: state.fit,
        model_fit: state.fit,
        work_type: state.workType,
        job_type: state.workType,
        limit: 12
      }), {
        signal: state.activeController.signal
      });

      const list = filterCatalog(normalizeArray(payload), q).slice(0, 12);
      renderModels(list, els.results, "search");
      setSearchStatus(`เจอ ${list.length} รายการที่เปิดให้ส่งคำขอได้ครับ`);
    } catch (error) {
      if (error && error.name === "AbortError") return;
      els.results.innerHTML = emptyMarkup("<strong>ตอนนี้ยังค้นหาไม่ได้ครับ</strong><br>ส่งคำขอแบบให้ MMD ช่วยค้นจากแฟ้มต่อได้เลย");
      setSearchStatus("ยังค้นหาไม่ได้ในตอนนี้ครับ");
    }
  }

  function findModel(key, context = "search") {
    const source = context === "preview" ? state.previewModels : state.models;

    return source.find((model) => String(model.model_key) === String(key)) ||
      state.models.find((model) => String(model.model_key) === String(key)) ||
      state.previewModels.find((model) => String(model.model_key) === String(key)) ||
      state.catalog.find((model) => String(model.model_key) === String(key));
  }

  function selectedLabel(model) {
    if (!model) return "ยังไม่ได้เลือก";
    return [model.display_name, model.model_key].filter(Boolean).join(" · ") || model.model_key;
  }

  function syncHidden() {
    const model = state.selected || {};
    if (els.hiddenModelKey) els.hiddenModelKey.value = model.model_key || "";
    if (els.hiddenScope) els.hiddenScope.value = state.scope;
    if (els.hiddenFit) els.hiddenFit.value = state.fit;
  }

  function selectModel(model) {
    if (!model) return;

    state.selected = model;
    const label = selectedLabel(model);

    if (els.selectedName) els.selectedName.textContent = label;
    if (els.selectedCopy) {
      els.selectedCopy.textContent = "ผมบันทึก model_key นี้ไว้ก่อนแล้วครับ MMD จะตรวจแฟ้มจริง ความเหมาะสม และขอบเขตงานอีกครั้ง";
    }
    if (els.dockTitle) els.dockTitle.textContent = `เลือกไว้ก่อน: ${label}`;

    syncHidden();
    saveDraft();
    setSubmitStatus(`เลือก ${label} ไว้ก่อนแล้วครับ ยังไม่ใช่การยืนยันงานนะครับ`, "ok");
  }

  function clearSelected() {
    state.selected = null;

    if (els.selectedName) els.selectedName.textContent = "ยังไม่ได้เลือก";
    if (els.selectedCopy) els.selectedCopy.textContent = "ยังไม่ต้องเลือกก็ได้ครับ ถ้าต้องการให้ MMD ช่วยค้นจากแฟ้มให้";
    if (els.dockTitle) els.dockTitle.textContent = "ยังไม่ได้เลือก model_key";

    syncHidden();
  }

  function renderSheet(model) {
    if (!model) return;

    const tags = [
      state.scope === "private" ? "Private" : "Public",
      state.fit === "gay" ? "Gay" : "Straight",
      model.model_key,
      ...(model.tiers || []),
      ...(model.jobTypes || [])
    ].filter(Boolean).slice(0, 8);

    if (els.sheetTitle) els.sheetTitle.textContent = model.display_name || "Model file";
    if (els.sheetCopy) {
      els.sheetCopy.textContent = model.summary || "รายละเอียดนี้เป็น preview ที่เปิดให้ดูได้เท่านั้น MMD จะตรวจแฟ้มจริงอีกครั้งก่อนตอบกลับ";
    }
    if (els.sheetTags) els.sheetTags.innerHTML = tags.map(tag).join("");
    if (els.sheetImg) {
      els.sheetImg.style.backgroundImage = model.imageUrl
        ? `linear-gradient(180deg,transparent 0%,rgba(7,5,4,.96) 90%),url("${model.imageUrl}")`
        : "";
    }
  }

  function setSheet(open) {
    els.sheet?.classList.toggle("open", open);
    els.backdrop?.classList.toggle("open", open);
    els.sheet?.setAttribute("aria-hidden", open ? "false" : "true");
    document.documentElement.style.overflow = open ? "hidden" : "";
  }

  async function openDetail(key, context) {
    const local = findModel(key, context);
    if (!local) return;

    state.sheetModel = local;
    renderSheet(local);
    setSheet(true);

    try {
      const payload = await fetchJson(makeUrl(WORKERS.modelDetail(local.model_key), {
        model_key: local.model_key,
        visibility: state.scope,
        scope: state.scope,
        fit: state.fit,
        client_fit: state.fit,
        model_fit: state.fit
      }));

      const detail = normalizeModel(payload.model || payload.record || payload.data || payload);
      state.sheetModel = { ...local, ...detail };
      renderSheet(state.sheetModel);
    } catch (error) {
      renderSheet(local);
    }
  }

  function setMode(mode) {
    state.mode = mode === "assist" ? "assist" : "model";

    if (state.mode === "assist") {
      clearSelected();
      if (els.selectedName) els.selectedName.textContent = "ให้ MMD ช่วยค้นจากแฟ้ม";
      if (els.selectedCopy) {
        els.selectedCopy.textContent = "เหมาะกับกรณีที่ยังจำชื่อไม่ได้ หรือไม่แน่ใจว่า Model อยู่แฟ้ม Public หรือ Private";
      }
      if (els.dockTitle) els.dockTitle.textContent = "ให้ MMD ช่วยค้นจากแฟ้ม";
      setSubmitStatus("เลือกโหมดให้ MMD ช่วยค้นจากแฟ้มแล้วครับ กรอกรายละเอียดที่จำได้แล้วส่งคำขอได้เลย", "ok");
    } else {
      clearSelected();
      setSubmitStatus("กลับมาเลือก Model เองได้แล้วครับ", "");
    }

    saveDraft();
  }

  function updateToggle(type, value) {
    if (type === "scope") {
      $$('[data-scope]').forEach((button) => {
        button.classList.toggle("is-active", button.getAttribute("data-scope") === value);
      });
    }

    if (type === "fit") {
      $$('[data-fit]').forEach((button) => {
        button.classList.toggle("is-active", button.getAttribute("data-fit") === value);
      });
    }
  }

  function formObject() {
    const out = {};
    const data = new FormData(els.form);

    data.forEach((value, key) => {
      out[key] = typeof value === "string" ? clean(value) : value;
    });

    return out;
  }

  function buildRequestPayload() {
    const form = formObject();
    const context = safeParamObject();

    return {
      request_id: context.request_id || "",
      source: "webflow",
      source_path: "/sigil/booking",
      form_version: "sigil_booking_fit_v22",
      assistant_core: "kenji",
      route_guide: state.routeGuide || "none",
      search_scope: state.scope,
      requested_visibility: state.scope,
      model_fit: state.fit,
      requested_fit_tag: `${state.fit}-fit`,
      work_type: state.workType,
      selected_model_key: state.selected ? state.selected.model_key : "",
      allow_mmd_recommendation: state.mode === "assist" || !state.selected,
      preferred_date: form.preferred_date || "",
      preferred_time: form.preferred_time || "",
      duration_hours: form.duration_hours || "",
      location_area: form.location_area || "",
      contact_name: form.contact_name || "",
      contact_method: form.contact_method || "",
      contact_value: form.contact_value || "",
      notes: form.notes || "",
      consent: form.consent === "true",
      t: context.t || "",
      code: context.code || "",
      promo: context.promo || "",
      source_param: context.source || "",
      tier: context.tier || "",
      client_context: {
        language: "th",
        timezone: "Asia/Bangkok",
        user_agent: navigator.userAgent
      }
    };
  }

  function validateForm() {
    let bad = null;

    $$("#sbf22-form [required]").forEach((field) => {
      const invalid = field.name === "consent"
        ? field.value !== "true"
        : !clean(field.value);

      if (invalid) {
        field.setAttribute("aria-invalid", "true");
        bad = bad || field;
      } else {
        field.removeAttribute("aria-invalid");
      }
    });

    if (!["public", "private"].includes(state.scope)) {
      setSubmitStatus("ขอเลือกแฟ้ม Public หรือ Private ก่อนครับ", "err");
      return false;
    }

    if (!["straight", "gay"].includes(state.fit)) {
      setSubmitStatus("ขอเลือก Fit เป็น Straight หรือ Gay ก่อนครับ", "err");
      return false;
    }

    if (bad) {
      bad.focus();
      setSubmitStatus("ขอชื่อ ช่องทางติดต่อ และยืนยันความเข้าใจก่อนส่งคำขอครับ", "err");
      return false;
    }

    return true;
  }

  async function submitRequest() {
    if (state.submitting) return;
    if (!validateForm()) return;

    state.submitting = true;
    setSubmitStatus("กำลังส่งคำขอให้ MMD ตรวจสอบ...", "");

    const button = $('[data-action="submit"]');
    if (button) button.disabled = true;

    try {
      const response = await fetchJson(WORKERS.bookingRequest, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(buildRequestPayload())
      });

      const id = response.request_id || response.requestId || response.id || "Pending";
      const status = response.status || response.request_status || response.next_action || "received";
      const message = response.message || "ผมรับคำขอไว้แล้วครับ เดี๋ยว MMD จะตรวจแฟ้มและพาไปขั้นต่อไป";
      const payment = response.links && response.links.payment_url ? response.links.payment_url : "";
      const preference = state.selected
        ? `model_key ที่สนใจ: ${state.selected.model_key}`
        : "model_key ที่สนใจ: ให้ MMD ช่วยค้นจากแฟ้ม";

      setSubmitStatus([
        "ผมรับคำขอไว้แล้วครับ",
        `แฟ้มที่ค้น: ${state.scope}`,
        `Fit: ${state.fit}`,
        preference,
        `Request ID: ${id}`,
        `Status: ${status}`,
        `Message: ${message}`,
        payment ? `Next: ${payment}` : "",
        "หมายเหตุ: ตอนนี้ยังไม่ใช่การยืนยันงานหรือการล็อกคิว"
      ].filter(Boolean).join("\n"), "ok");

      localStorage.removeItem("mmd_sigil_booking_fit_v22_draft");
      els.form?.reset();
      clearSelected();
    } catch (error) {
      setSubmitStatus("ยังส่งคำขอไม่สำเร็จครับ กรุณาลองใหม่ หรือส่งรายละเอียดผ่านช่องทาง SIGIL เดิม", "err");
    } finally {
      state.submitting = false;
      if (button) button.disabled = false;
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem("mmd_sigil_booking_fit_v22_draft", JSON.stringify({
        mode: state.mode,
        q: state.q,
        scope: state.scope,
        fit: state.fit,
        workType: state.workType,
        selected: state.selected,
        form: formObject()
      }));
    } catch (error) {}
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem("mmd_sigil_booking_fit_v22_draft");
      if (!raw) return;

      const draft = JSON.parse(raw);

      state.mode = draft.mode || state.mode;
      state.q = draft.q || "";
      state.scope = normalizeScope(qs.get("visibility") || qs.get("scope")) || draft.scope || state.scope;
      state.fit = normalizeFit(qs.get("fit") || qs.get("model_fit")) || draft.fit || state.fit;
      state.workType = clean(qs.get("work_type")) || draft.workType || state.workType;

      if (els.search) els.search.value = state.q;
      if (els.workType) els.workType.value = state.workType;

      if (draft.form && els.form) {
        Object.entries(draft.form).forEach(([key, value]) => {
          const field = els.form.elements[key];
          if (field && typeof value === "string") field.value = value;
        });
      }

      if (draft.selected) {
        state.selected = draft.selected;
        const label = selectedLabel(draft.selected);

        if (els.selectedName) els.selectedName.textContent = label;
        if (els.selectedCopy) {
          els.selectedCopy.textContent = "ผมบันทึก model_key นี้ไว้ก่อนแล้วครับ MMD จะตรวจแฟ้มจริง ความเหมาะสม และขอบเขตงานอีกครั้ง";
        }
        if (els.dockTitle) els.dockTitle.textContent = `เลือกไว้ก่อน: ${label}`;
        syncHidden();
      }

      updateToggle("scope", state.scope);
      updateToggle("fit", state.fit);
    } catch (error) {}
  }

  function clearDraft() {
    state.mode = "model";
    state.selected = null;
    state.q = "";
    state.scope = "public";
    state.fit = "straight";
    state.workType = "all";
    state.models = [];

    els.form?.reset();

    if (els.search) els.search.value = "";
    if (els.workType) els.workType.value = "all";

    clearSelected();
    updateToggle("scope", "public");
    updateToggle("fit", "straight");

    localStorage.removeItem("mmd_sigil_booking_fit_v22_draft");
    setSubmitStatus("ล้างข้อมูลบนหน้านี้แล้วครับ", "");

    loadPreviewModels();
    loadSearchModels(false);
  }

  function debounce(fn, wait = 260) {
    return (...args) => {
      clearTimeout(state.timer);
      state.timer = setTimeout(() => fn(...args), wait);
    };
  }

  const debouncedSearch = debounce(() => {
    state.q = els.search ? clean(els.search.value) : "";
    saveDraft();
    loadSearchModels(false);
  }, 280);

  function maybeHydrateInitialModel() {
    const key = clean(qs.get("model_key"));
    if (!key || !/^[a-zA-Z0-9_-]{1,100}$/.test(key)) return;

    setTimeout(() => {
      const local = findModel(key, "search") || findModel(key, "preview");

      if (local) {
        selectModel(local);
        setSubmitStatus(`เลือก ${local.model_key} จากลิงก์ไว้ให้แล้วครับ ยังไม่ใช่การยืนยันนะครับ`, "ok");
      } else {
        if (els.search) els.search.value = key;
        loadSearchModels(true);
      }
    }, 400);
  }

  root.querySelectorAll("[data-preserve-link]").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    link.setAttribute("href", preserveUrl(href));
  });

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button,a");
    if (!target || !root.contains(target)) return;

    const scope = target.getAttribute("data-scope");
    if (scope) {
      state.scope = scope === "private" ? "private" : "public";
      updateToggle("scope", state.scope);
      syncHidden();
      saveDraft();
      loadPreviewModels();
      loadSearchModels(true);
      return;
    }

    const fit = target.getAttribute("data-fit");
    if (fit) {
      state.fit = fit === "gay" ? "gay" : "straight";
      updateToggle("fit", state.fit);
      syncHidden();
      saveDraft();
      loadPreviewModels();
      loadSearchModels(true);
      return;
    }

    const mode = target.getAttribute("data-mode");
    if (mode) {
      setMode(mode);
      return;
    }

    const action = target.getAttribute("data-action");
    const key = target.getAttribute("data-key");
    const context = target.getAttribute("data-context") || "search";

    if (action === "search") {
      state.q = els.search ? clean(els.search.value) : "";
      saveDraft();
      loadSearchModels(true);
    }

    if (action === "select-model") {
      selectModel(findModel(key, context));
      root.querySelector("#request-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (action === "open-detail") openDetail(key, context);
    if (action === "close-sheet") setSheet(false);

    if (action === "select-from-sheet") {
      selectModel(state.sheetModel);
      setSheet(false);
      root.querySelector("#request-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (action === "submit") submitRequest();
    if (action === "clear") clearDraft();
  });

  els.search?.addEventListener("input", debouncedSearch);

  els.workType?.addEventListener("change", () => {
    state.workType = clean(els.workType.value) || "all";
    saveDraft();
    loadPreviewModels();
    loadSearchModels(true);
  });

  els.form?.addEventListener("input", saveDraft);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSheet(false);
  });

  async function init() {
    loadDraft();
    updateToggle("scope", state.scope);
    updateToggle("fit", state.fit);
    syncHidden();
    await loadCatalog();
    await loadPreviewModels();
    await loadSearchModels(false);
    maybeHydrateInitialModel();

    const requestId = clean(qs.get("request_id"));
    if (requestId) {
      setSubmitStatus([
        "เปิดคำขอจากลิงก์เรียบร้อยครับ",
        `Request ID: ${requestId}`,
        "ถ้าต้องการส่งรายละเอียดเพิ่ม สามารถกรอกด้านล่างได้เลย"
      ].join("\n"), "ok");
    }
  }

  init();
})();
