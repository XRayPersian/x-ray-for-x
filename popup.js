/**
 * popup.js - Script for X-Ray Extension Settings Popup
 * Manages Groq API Key storage, visibility toggling, model selection, validation, and status updates.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleVisibilityBtn = document.getElementById('toggleVisibilityBtn');
  const modelSelect = document.getElementById('modelSelect');
  const modelDisplay = document.getElementById('modelDisplay');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const removeKeyBtn = document.getElementById('removeKeyBtn');
  const statusBanner = document.getElementById('statusBanner');
  const keyStatusDot = document.getElementById('keyStatusDot');
  const keyStatusText = document.getElementById('keyStatusText');
  const groqConsoleLink = document.getElementById('groqConsoleLink');

  /**
   * Filters out specialized, audio, vision, guard, embedding, Arabic-only, or third-party non-chat models
   */
  function isSupportedChatModel(id) {
    if (!id || typeof id !== 'string') return false;
    const lower = id.toLowerCase();
    if (
      lower.includes('whisper') ||
      lower.includes('guard') ||
      lower.includes('embed') ||
      lower.includes('vision') ||
      lower.includes('tts') ||
      lower.includes('audio') ||
      lower.includes('speech') ||
      lower.includes('voice') ||
      lower.includes('canopylabs') ||
      lower.includes('orpheus') ||
      lower.includes('playai') ||
      lower.includes('allam') ||
      lower.includes('bge-') ||
      lower.includes('moderation') ||
      lower.includes('rerank') ||
      lower === 'llama3-70b-8192' ||
      lower === 'llama3-8b-8192'
    ) {
      return false;
    }
    const isAllowedFamily =
      lower.includes('llama') ||
      lower.includes('qwen') ||
      lower.includes('deepseek') ||
      lower.includes('mixtral') ||
      lower.includes('mistral') ||
      lower.includes('gemma') ||
      lower.includes('gpt-oss') ||
      lower.includes('kimi') ||
      lower.includes('moonshot') ||
      lower.includes('compound');

    return isAllowedFamily;
  }

  // Curated list of high-quality models
  const CURATED_MODELS = [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Standard)' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B (Schnell & Modern)' },
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B (Stark)' },
    { id: 'qwen/qwen3-32b', label: 'Qwen 3 32B (Top für Persisch / Farsi)' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Sehr schnell / Hohes Limit)' },
    { id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B (OpenAI MoE)' },
    { id: 'openai/gpt-oss-20b', label: 'GPT OSS 20B (Sehr schnell / MoE)' },
    { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B (Starke Logik)' },
    { id: 'gemma2-9b-it', label: 'Gemma 2 9B (Google)' }
  ];

  /**
   * Translates internal model ID to readable badge label
   */
  function formatModelLabel(modelId) {
    if (!modelId) return '⚡ Llama 3.3 70B';
    if (modelId === 'llama-3.3-70b-versatile') return '⚡ Llama 3.3 70B';
    if (modelId.includes('llama-4-scout')) return '⚡ Llama 4 Scout';
    if (modelId.includes('llama-4-maverick')) return '⚡ Llama 4 Maverick';
    if (modelId === 'llama-3.1-8b-instant') return '⚡ Llama 3.1 8B';
    if (modelId === 'llama-3.1-70b-versatile') return '⚡ Llama 3.1 70B';
    if (modelId.includes('qwen')) {
      if (modelId.includes('qwen3-32b')) return '⚡ Qwen 3 32B';
      if (modelId.includes('27b') || modelId.includes('3.8') || modelId.includes('3.6')) {
        return '⚡ Qwen 27B (Top für Persisch)';
      }
      if (modelId.includes('32b') || modelId.includes('2.5')) {
        return '⚡ Qwen 2.5 32B (Top Persisch)';
      }
      return `⚡ ${modelId}`;
    }
    if (modelId.includes('deepseek')) return '⚡ DeepSeek R1 70B';
    if (modelId.includes('mixtral')) return '⚡ Mixtral 8x7B';
    if (modelId === 'gemma2-9b-it') return '⚡ Gemma 2 9B';
    if (modelId.includes('120b')) return '⚡ GPT OSS 120B';
    if (modelId.includes('20b')) return '⚡ GPT OSS 20B';
    if (modelId.includes('gpt-oss')) return '⚡ GPT OSS';
    if (modelId.includes('kimi')) return '⚡ Kimi K2';
    return `⚡ ${modelId}`;
  }

  /**
   * Formats model ID for display text inside select options
   */
  function formatModelOptionText(id) {
    if (!id) return '';
    if (id === 'llama-3.3-70b-versatile') return 'Llama 3.3 70B Versatile (Standard)';
    if (id.includes('llama-4-scout')) return 'Llama 4 Scout 17B (Schnell & Modern)';
    if (id.includes('llama-4-maverick')) return 'Llama 4 Maverick 17B (Stark)';
    if (id === 'llama-3.1-8b-instant') return 'Llama 3.1 8B Instant (Sehr schnell / Hohes Limit)';
    if (id === 'llama-3.1-70b-versatile') return 'Llama 3.1 70B Versatile';
    if (id === 'qwen/qwen3-32b') return 'Qwen 3 32B (Top für Persisch / Farsi)';
    if (id === 'qwen/qwen3.8-27b') return 'Qwen 27B (Top für Persisch / Farsi)';
    if (id === 'qwen/qwen3.6-27b') return 'Qwen 3.6 27B (Persisch)';
    if (id === 'qwen-2.5-32b') return 'Qwen 2.5 32B (Top für Persisch)';
    if (id.includes('qwen')) return `${id} (Top für Persisch)`;
    if (id.includes('deepseek')) return 'DeepSeek R1 Distill 70B (Starke Logik)';
    if (id.includes('mixtral')) return 'Mixtral 8x7B (Ausgewogen)';
    if (id === 'gemma2-9b-it') return 'Gemma 2 9B (Google)';
    if (id === 'openai/gpt-oss-120b') return 'GPT OSS 120B (OpenAI MoE)';
    if (id === 'openai/gpt-oss-20b') return 'GPT OSS 20B (Sehr schnell / MoE)';
    if (id.includes('gpt-oss')) return `${id} (GPT OSS)`;
    if (id.includes('kimi')) return `${id} (Moonshot Kimi)`;
    return id;
  }

  /**
   * Ensures a model ID option exists in select element so it never renders blank
   */
  function ensureOptionExists(selectEl, modelId) {
    if (!modelId) return;
    const exists = Array.from(selectEl.options).some(opt => opt.value === modelId);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = modelId;
      opt.textContent = formatModelOptionText(modelId);
      selectEl.appendChild(opt);
    }
  }

  /**
   * Displays temporary or persistent status message
   */
  function showStatus(message, type = 'success', duration = 5000) {
    statusBanner.textContent = message;
    statusBanner.className = `status-banner ${type}`;
    if (type === 'success' && duration > 0) {
      setTimeout(() => {
        if (statusBanner.className.includes('success')) {
          statusBanner.className = 'status-banner';
        }
      }, duration);
    }
  }

  /**
   * Updates the UI badge according to key presence
   */
  function updateKeyStatusUI(hasKey) {
    if (hasKey) {
      keyStatusDot.classList.add('active');
      keyStatusText.textContent = 'Aktiv';
      keyStatusText.style.color = '#00ba7c';
      removeKeyBtn.style.display = 'block';
    } else {
      keyStatusDot.classList.remove('active');
      keyStatusText.textContent = 'Kein Key';
      keyStatusText.style.color = 'var(--text-muted)';
      removeKeyBtn.style.display = 'none';
    }
  }

  /**
   * Updates model options in select box, prioritizing live accessible models from Groq when available
   */
  function populateModelOptions(availableModels = [], currentSelected) {
    const previousSelected = currentSelected || modelSelect.value;
    const cleanModels = Array.isArray(availableModels)
      ? availableModels.filter(isSupportedChatModel)
      : [];

    const modelMap = new Map();
    if (cleanModels.length > 0) {
      cleanModels.forEach(id => {
        modelMap.set(id, formatModelOptionText(id));
      });
    } else {
      CURATED_MODELS.forEach(m => modelMap.set(m.id, m.label));
    }

    // Rebuild options with the full set
    modelSelect.innerHTML = '';
    for (const [id, label] of modelMap.entries()) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      modelSelect.appendChild(opt);
    }

    let targetModel = previousSelected;
    if (!targetModel || !modelMap.has(targetModel)) {
      targetModel = modelMap.has('llama-3.3-70b-versatile') ? 'llama-3.3-70b-versatile' : Array.from(modelMap.keys())[0];
    }

    modelSelect.value = targetModel;
    modelDisplay.textContent = formatModelLabel(targetModel);
    chrome.storage.sync.set({ selectedModel: targetModel });
  }

  // 1. Load saved settings on popup open
  try {
    const syncData = await chrome.storage.sync.get(['groqApiKey', 'apiKey', 'selectedModel']);
    const localData = await chrome.storage.local.get(['cachedModels']);
    const savedKey = (syncData.groqApiKey || syncData.apiKey || '').trim();
    let savedModel = syncData.selectedModel || 'llama-3.3-70b-versatile';

    // Auto-migrate away from unsuitable, deprecated, or non-chat models (like canopylabs, allam, llama3-70b-8192)
    if (!isSupportedChatModel(savedModel)) {
      savedModel = 'llama-3.3-70b-versatile';
      await chrome.storage.sync.set({ selectedModel: savedModel });
    }

    // Populate with cached models if available (filtered by isSupportedChatModel)
    if (localData.cachedModels && localData.cachedModels.length > 0) {
      populateModelOptions(localData.cachedModels, savedModel);
    }

    // Always ensure the saved model has an option and is visually selected
    if (savedModel) {
      ensureOptionExists(modelSelect, savedModel);
      modelSelect.value = savedModel;
      modelDisplay.textContent = formatModelLabel(savedModel);
    }

    if (savedKey) {
      apiKeyInput.value = savedKey;
      updateKeyStatusUI(true);

      // Silently refresh model list from Groq
      chrome.runtime.sendMessage({ action: 'GET_MODELS', apiKey: savedKey }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.success && response.models && response.models.length > 0) {
          const validModels = response.models.filter(isSupportedChatModel);
          chrome.storage.local.set({ cachedModels: validModels });
          populateModelOptions(validModels, modelSelect.value || savedModel);
        }
      });
    } else {
      updateKeyStatusUI(false);
    }
  } catch (err) {
    console.error('[X-Ray Popup] Failed to load storage:', err);
  }

  // 2. Change model listener
  modelSelect.addEventListener('change', async () => {
    const selected = modelSelect.value;
    modelDisplay.textContent = formatModelLabel(selected);
    await chrome.storage.sync.set({ selectedModel: selected });
  });

  // 3. Toggle password visibility
  toggleVisibilityBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleVisibilityBtn.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      toggleVisibilityBtn.textContent = '👁️';
    }
  });

  // 4. Save API Key and Model
  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    let model = modelSelect.value;

    if (!key) {
      showStatus('Bitte gib einen gültigen Groq API-Key ein.', 'error');
      return;
    }

    if (!key.startsWith('gsk_')) {
      showStatus('Hinweis: Typische Groq-Keys beginnen mit "gsk_".', 'error');
    }

    if (!model) {
      model = 'llama-3.3-70b-versatile';
      ensureOptionExists(modelSelect, model);
      modelSelect.value = model;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Speichere...';

    try {
      await chrome.storage.sync.set({
        groqApiKey: key,
        selectedModel: model
      });
      updateKeyStatusUI(true);
      modelDisplay.textContent = formatModelLabel(model);
      showStatus('✓ Gespeichert! Bereit für x.com', 'success');

      // Refresh dynamic models in background
      chrome.runtime.sendMessage({ action: 'GET_MODELS', apiKey: key }, (response) => {
        if (!chrome.runtime.lastError && response?.success && response.models?.length > 0) {
          const validModels = response.models.filter(isSupportedChatModel);
          chrome.storage.local.set({ cachedModels: validModels });
          populateModelOptions(validModels, model);
        }
      });
    } catch (err) {
      showStatus(`Fehler beim Speichern: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Speichern';
    }
  });

  // 5. Test API Key against Groq
  testBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const chosenModel = modelSelect.value;

    if (!key) {
      showStatus('Bitte trage zuerst einen Key ein.', 'error');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Prüfe...';
    showStatus('Verbindung zu Groq wird getestet...', 'success');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'TEST_API_KEY',
        apiKey: key,
        model: chosenModel
      });

      if (response && response.success) {
        if (response.availableModels && response.availableModels.length > 0) {
          const validModels = response.availableModels.filter(isSupportedChatModel);
          chrome.storage.local.set({ cachedModels: validModels });
          populateModelOptions(validModels, response.selectedModel || chosenModel);
        }

        const activeModel = response.selectedModel || chosenModel || modelSelect.value;
        if (activeModel) {
          ensureOptionExists(modelSelect, activeModel);
          modelSelect.value = activeModel;
          modelDisplay.textContent = formatModelLabel(activeModel);
          await chrome.storage.sync.set({
            groqApiKey: key,
            selectedModel: activeModel
          });
        }
        updateKeyStatusUI(true);

        showStatus(`✓ ${response.message || 'API-Key ist betriebsbereit!'}`, 'success', 6000);
      } else {
        showStatus(`✕ ${response?.message || 'Ungültiger Key oder Verbindungsfehler.'}`, 'error');
      }
    } catch (err) {
      showStatus(`Fehler beim Verbindungstest: ${err.message}`, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '⚡ Testen';
    }
  });

  // 6. Remove API Key
  removeKeyBtn.addEventListener('click', async () => {
    if (confirm('Möchtest du den gespeicherten Groq API-Key wirklich entfernen?')) {
      try {
        await chrome.storage.sync.remove(['groqApiKey', 'apiKey']);
        apiKeyInput.value = '';
        updateKeyStatusUI(false);
        showStatus('API-Key wurde entfernt.', 'success');
      } catch (err) {
        showStatus(`Fehler: ${err.message}`, 'error');
      }
    }
  });

  // 7. External link to Groq console
  groqConsoleLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://console.groq.com/keys' });
  });

  // Save on Enter in input field
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });

  // ============================================================================
  // 8. Known Political Accounts Manager (Add / Delete / Export / Import JSON)
  // ============================================================================
  const customHandleInput = document.getElementById('customHandleInput');
  const customFactionSelect = document.getElementById('customFactionSelect');
  const addCustomAccountBtn = document.getElementById('addCustomAccountBtn');
  const customAccountsList = document.getElementById('customAccountsList');
  const accountsCountBadge = document.getElementById('accountsCountBadge');
  const exportAccountsBtn = document.getElementById('exportAccountsBtn');
  const importAccountsBtn = document.getElementById('importAccountsBtn');
  const importAccountsFileInput = document.getElementById('importAccountsFileInput');

  const FACTION_META = {
    pahlavi: { label: '🦁👑 ملی‌گرا و دموکرات (همراه پهلوی)', color: '#f59e0b' },
    farah: { label: '👑 علیاحضرت شهبانو فرح پهلوی / مادر میهن', color: '#f59e0b' },
    vaisi: { label: '🦁🟢 مراد ویسی / راوی جان‌فداهای میهن', color: '#10b981' },
    government: { label: '🏛️ حساب رسمی دولتی (تیک خاکستری)', color: '#94a3b8' },
    khamenei: { label: '🐀 خامنه‌ای / موش‌علی', color: '#991b1b' },
    mojtaba: { label: '📦 مجتبی خامنه‌ای / رهبر مقوایی', color: '#7f1d1d' },
    raisi: { label: '🚁 رئیسی / قاضی مرگ (بهلاکت‌رسیده)', color: '#991b1b' },
    larijani: { label: '💥 لاریجانی / هلاکت توسط اسرائیل', color: '#991b1b' },
    ghalibaf: { label: '🦀✈️ قالیباف / سردار گازانبری و خلبان', color: '#991b1b' },
    bbcpersian: { label: '👳‍♂️ بی‌بی‌سی فارسی / «آیت‌الله بی‌بی‌سی»', color: '#b91c1c' },
    kohnavard: { label: '🍉🎤 نفیسه کوهنورد (ضعیفه رژیم) / خبرنگار بی‌بی‌سی و خط مقاومت', color: '#b91c1c' },
    chapi: { label: '🚩 چپ / مارکسیست', color: '#a855f7' },
    mek: { label: '🤖 مجاهدین (MEK)', color: '#ef4444' },
    arzeshi: { label: '🕌 ارزشی / سایبری ج.ا.', color: '#dc2626' },
    eslahtalab: { label: '🕊️ اصلاح‌طلب / نایاک', color: '#ea580c' },
    separatist: { label: '⚠️ تجزیه‌طلب / قوم‌گرا', color: '#e11d48' },
    javanmardi: { label: '🏴✂️ علی جوانمردی / تجزیه‌طلب و همکار اصلاح‌طلبان', color: '#e11d48' },
    ronaghi: { label: '🎭 حسین رونقی / سوپاپ اصلاح‌طلبان و انحراف قیام', color: '#f43f5e' },
    mohammadi: { label: '🟣 نرگس محمدی / پروژه هاشمی و چپ ۵۷ی', color: '#a855f7' },
    toomaj: { label: '🟣🚩 توماج صالحی / چپ ۵۷ی و همسو با مجاهدین خلق', color: '#a855f7' },
    golshifteh: { label: '🟣🍉 گلشیفته فراهانی / چپول، ضد پرچم و مروج فلسطین', color: '#a855f7' },
    boniadi: { label: '🟣 نازنین بنیادی / سلبریتی فرقه زن زندگی آزادی', color: '#a855f7' },
    esmaeilion: { label: '🟣🟡 حامد اسماعیلیون / اصلاح‌طلب و چپ همسو با مجاهدین', color: '#a855f7' },
    golroo: { label: '🟣💨 مهدیه گلرو (مهدیه گوزو) / اصلاح‌طلب و تخریب‌گر پادشاهی', color: '#a855f7' },
    rahmani: { label: '🟣☭ تقی رحمانی / مذهبی‌چپول ۵۷ی و ضد ملی‌گرا', color: '#a855f7' },
    modarres: { label: '🟣🏴 شاهین مدرس / چپول، مروج قوم‌گرایی و ضد پهلوی', color: '#a855f7' },
    sazegara: { label: '🟡🪖 محسن سازگارا / بنیان‌گذار سپاه و مانع سرنگونی', color: '#ea580c' },
    alidoosti: { label: '🟡🎬 ترانه علیدوستی / سلبریتی اصلاح‌طلب و مبارزه فیک', color: '#ea580c' },
    afshari: { label: '🔴🗣️ علی افشاری / اصلاح‌طلب باقیمانده و خط اصولگرای رژیم', color: '#dc2626' },
    false_flag: { label: '🎭👑 پادشاهی‌خواه قلابی / ضد پهلوی', color: '#fb7185' },
    media: { label: '🟢 رسانه / خبرنگار', color: '#38bdf8' }
  };

  const FACTION_IMAGES = {
    pahlavi: 'assets/factions/pahlavi.jpg',
    farah: 'assets/factions/farah.jpg',
    vaisi: 'assets/factions/vaisi.jpg',
    khamenei: 'assets/factions/khamenei.jpg',
    mojtaba: 'assets/factions/mojtaba.jpg',
    raisi: 'assets/factions/raisi.jpg',
    larijani: 'assets/factions/larijani.jpg',
    ghalibaf: 'assets/factions/ghalibaf.jpg',
    bbcpersian: 'assets/factions/bbcpersian.png',
    kohnavard: 'assets/factions/kohnavard.jpg',
    omiddana: 'assets/factions/omiddana.png',
    fakhravar: 'assets/factions/fakhravar.jpg',
    homayoun: 'assets/factions/homayoun.jpg',
    alinejad: 'assets/factions/alinejad.jpg',
    ronaghi: 'assets/factions/ronaghi.jpg',
    mohammadi: 'assets/factions/mohammadi.jpg',
    toomaj: 'assets/factions/toomaj.jpg',
    golshifteh: 'assets/factions/golshifteh.jpg',
    boniadi: 'assets/factions/chapi.png',
    esmaeilion: 'assets/factions/eslahtalab.jpg',
    golroo: 'assets/factions/eslahtalab.jpg',
    rahmani: 'assets/factions/rahmani.png',
    modarres: 'assets/factions/chapi.png',
    sazegara: 'assets/factions/eslahtalab.jpg',
    alidoosti: 'assets/factions/alidoosti.jpg',
    afshari: 'assets/factions/afshari.jpg',
    arzeshi: 'assets/factions/arzeshi.png',
    eslahtalab: 'assets/factions/eslahtalab.jpg',
    chapi: 'assets/factions/chapi.png',
    mek: 'assets/factions/mek.jpg',
    separatist: 'assets/factions/separatist.jpg',
    javanmardi: 'assets/factions/separatist.jpg',
    false_flag: 'assets/factions/false_flag.jpg'
  };

  let currentCustomAccounts = {};

  function renderCustomAccountsList(accountsMap) {
    currentCustomAccounts = accountsMap || {};
    if (!customAccountsList) return;

    const entries = Object.entries(currentCustomAccounts).sort((a, b) =>
      (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0)
    );

    if (accountsCountBadge) {
      accountsCountBadge.textContent = `${entries.length} اکانت شخصی`;
    }

    customAccountsList.innerHTML = '';

    if (entries.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'font-size: 11px; color: #71767b; text-align: center; padding: 8px 4px;';
      emptyEl.textContent = 'هنوز اکانت شخصی ثبت نشده است (اکانت‌های پیش‌فرض فعال هستند).';
      customAccountsList.appendChild(emptyEl);
      return;
    }

    for (const [handle, info] of entries) {
      const factionKey = typeof info === 'string' ? info : (info?.faction || 'pahlavi');
      const meta = FACTION_META[factionKey] || { label: factionKey, color: '#94a3b8' };

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.06); border-radius: 5px; padding: 4px 8px; font-size: 11px;';

      const left = document.createElement('div');
      left.style.cssText = 'display: flex; align-items: center; gap: 6px; overflow: hidden;';

      if (FACTION_IMAGES[factionKey]) {
        const avatarImg = document.createElement('img');
        avatarImg.src = FACTION_IMAGES[factionKey];
        avatarImg.style.cssText = 'width: 18px; height: 18px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.25); flex-shrink: 0; cursor: zoom-in;';
        avatarImg.title = 'کلیک برای مشاهده اندازه اصلی / Click to view full size';
        avatarImg.addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.tabs.create({ url: chrome.runtime.getURL(FACTION_IMAGES[factionKey]) });
        });
        left.appendChild(avatarImg);
      }

      const handleSpan = document.createElement('span');
      handleSpan.style.cssText = 'font-family: monospace; color: #e7e9ea; font-weight: 700; direction: ltr;';
      handleSpan.textContent = `@${handle}`;

      const badgeSpan = document.createElement('span');
      badgeSpan.style.cssText = `color: ${meta.color}; font-size: 10px; font-weight: 600; white-space: nowrap;`;
      badgeSpan.textContent = meta.label;

      left.appendChild(handleSpan);
      left.appendChild(badgeSpan);

      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'حذف از لیست شخصی';
      delBtn.style.cssText = 'background: transparent; border: none; color: #71767b; cursor: pointer; font-size: 11px; padding: 0 4px;';
      delBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'SET_CUSTOM_ACCOUNT_ALIGNMENT',
          handle,
          faction: 'clear'
        }, () => {
          loadCustomAccounts();
        });
      });

      row.appendChild(left);
      row.appendChild(delBtn);
      customAccountsList.appendChild(row);
    }
  }

  function loadCustomAccounts() {
    chrome.runtime.sendMessage({ type: 'GET_CUSTOM_ACCOUNTS' }, (res) => {
      if (res && res.success) {
        renderCustomAccountsList(res.customAccounts || {});
      }
    });
  }

  if (addCustomAccountBtn && customHandleInput && customFactionSelect) {
    const triggerAddAccount = () => {
      const rawHandle = customHandleInput.value.trim().replace(/^@/, '').toLowerCase();
      if (!rawHandle) {
        showStatus('Bitte gib zuerst ein @Handle ein.', 'error');
        return;
      }
      const faction = customFactionSelect.value;
      chrome.runtime.sendMessage({
        type: 'SET_CUSTOM_ACCOUNT_ALIGNMENT',
        handle: rawHandle,
        faction,
        note: 'ثبت‌شده از پنل افزونه'
      }, (res) => {
        if (res && res.success) {
          customHandleInput.value = '';
          loadCustomAccounts();
          showStatus(`✓ @${rawHandle} ذخیره شد.`, 'success', 3000);
        }
      });
    };

    addCustomAccountBtn.addEventListener('click', triggerAddAccount);
    customHandleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerAddAccount();
    });
  }

  if (exportAccountsBtn) {
    exportAccountsBtn.addEventListener('click', () => {
      const dataStr = JSON.stringify(currentCustomAccounts, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xray-known-accounts-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus('✓ فایل JSON بانک اکانت‌ها دانلود شد.', 'success', 3500);
    });
  }

  if (importAccountsBtn && importAccountsFileInput) {
    importAccountsBtn.addEventListener('click', () => {
      importAccountsFileInput.click();
    });

    importAccountsFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          chrome.runtime.sendMessage({
            type: 'IMPORT_CUSTOM_ACCOUNTS',
            accounts: parsed
          }, (res) => {
            if (res && res.success) {
              loadCustomAccounts();
              showStatus(`✓ ${res.importedCount} اکانت با موفقیت وارد شد!`, 'success', 4000);
            } else {
              showStatus(`✕ خطا در واردسازی: ${res?.error || 'فرمت نامعتبر'}`, 'error');
            }
          });
        } catch (err) {
          showStatus(`✕ فایل JSON معتبر نیست: ${err.message}`, 'error');
        } finally {
          importAccountsFileInput.value = '';
        }
      };
      reader.readAsText(file);
    });
  }

  loadCustomAccounts();
});

