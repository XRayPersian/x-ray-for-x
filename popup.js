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
   * Filters for verified Groq chat models
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
      lower.includes('deepseek') ||
      lower.includes('mixtral') ||
      lower.includes('gemma');

    return isAllowedFamily;
  }

  // Official Groq production chat models
  const CURATED_MODELS = [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Recommended / Fast)' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Ultra Fast / High Limit)' },
    { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B (Advanced Reasoning)' },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Balanced)' },
    { id: 'gemma2-9b-it', label: 'Gemma 2 9B (Google)' }
  ];

  /**
   * Translates internal model ID to readable badge label
   */
  function formatModelLabel(modelId) {
    if (!modelId) return '⚡ Llama 3.3 70B';
    if (modelId === 'llama-3.3-70b-versatile') return '⚡ Llama 3.3 70B';
    if (modelId === 'llama-3.1-8b-instant') return '⚡ Llama 3.1 8B';
    if (modelId === 'llama-3.1-70b-versatile') return '⚡ Llama 3.1 70B';
    if (modelId.includes('deepseek')) return '⚡ DeepSeek R1 70B';
    if (modelId.includes('mixtral')) return '⚡ Mixtral 8x7B';
    if (modelId === 'gemma2-9b-it') return '⚡ Gemma 2 9B';
    return `⚡ ${modelId}`;
  }

  /**
   * Formats model ID for display text inside select options
   */
  function formatModelOptionText(id) {
    if (!id) return '';
    if (id === 'llama-3.3-70b-versatile') return 'Llama 3.3 70B Versatile (Recommended / Fast)';
    if (id === 'llama-3.1-8b-instant') return 'Llama 3.1 8B Instant (Ultra Fast / High Limit)';
    if (id === 'llama-3.1-70b-versatile') return 'Llama 3.1 70B Versatile';
    if (id.includes('deepseek-r1')) return 'DeepSeek R1 Distill 70B (Advanced Reasoning)';
    if (id.includes('mixtral')) return 'Mixtral 8x7B (Balanced)';
    if (id === 'gemma2-9b-it') return 'Gemma 2 9B (Google)';
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
      keyStatusText.textContent = 'Active';
      keyStatusText.style.color = '#00ba7c';
      removeKeyBtn.style.display = 'block';
    } else {
      keyStatusDot.classList.remove('active');
      keyStatusText.textContent = 'No Key';
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

    // Auto-migrate away from unsuitable, deprecated, or non-chat models
    if (!isSupportedChatModel(savedModel)) {
      savedModel = 'llama-3.3-70b-versatile';
      await chrome.storage.sync.set({ selectedModel: savedModel });
    }

    // Populate with cached models if available
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
      showStatus('Please enter a valid Groq API key.', 'error');
      return;
    }

    if (!key.startsWith('gsk_')) {
      showStatus('Note: Groq API keys typically begin with "gsk_".', 'error');
    }

    if (!model) {
      model = 'llama-3.3-70b-versatile';
      ensureOptionExists(modelSelect, model);
      modelSelect.value = model;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await chrome.storage.sync.set({
        groqApiKey: key,
        selectedModel: model
      });
      updateKeyStatusUI(true);
      modelDisplay.textContent = formatModelLabel(model);
      showStatus('✓ Saved! Ready for x.com', 'success');

      // Refresh dynamic models in background
      chrome.runtime.sendMessage({ action: 'GET_MODELS', apiKey: key }, (response) => {
        if (!chrome.runtime.lastError && response?.success && response.models?.length > 0) {
          const validModels = response.models.filter(isSupportedChatModel);
          chrome.storage.local.set({ cachedModels: validModels });
          populateModelOptions(validModels, model);
        }
      });
    } catch (err) {
      showStatus(`Error saving settings: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save';
    }
  });

  // 5. Test API Key against Groq
  testBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const chosenModel = modelSelect.value;

    if (!key) {
      showStatus('Please enter an API key first.', 'error');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    showStatus('Testing connection to Groq API...', 'success');

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

        showStatus(`✓ ${response.message || 'API key is ready!'}`, 'success', 6000);
      } else {
        showStatus(`✕ ${response?.message || 'Invalid API key or network error.'}`, 'error');
      }
    } catch (err) {
      showStatus(`Connection test error: ${err.message}`, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '⚡ Test Key';
    }
  });

  // 6. Remove API Key
  removeKeyBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to remove your saved Groq API key?')) {
      try {
        await chrome.storage.sync.remove(['groqApiKey', 'apiKey']);
        apiKeyInput.value = '';
        updateKeyStatusUI(false);
        showStatus('API key removed.', 'success');
      } catch (err) {
        showStatus(`Error: ${err.message}`, 'error');
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
});
