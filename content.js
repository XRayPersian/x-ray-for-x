/**
 * content.js - Content Script for "Account Check for X"
 * Robust DOM observer, action bar injection, tweet & profile scraping,
 * Account Forensics, Bot/Cyber Scout, and political alignment detection.
 */

(() => {
  'use strict';

  // Prevent multiple script initializations in the same tab
  if (window.__XRAY_INITIALIZED__) return;
  window.__XRAY_INITIALIZED__ = true;

  console.log('[X-Ray] Content script loaded on', window.location.hostname);

  /**
   * State management for active requests and tweet containers
   */
  const activeScans = new Set();

  /**
   * Extract tweet author and handle
   */
  function extractTweetAuthor(tweetEl) {
    const userNameEl = tweetEl.querySelector('div[data-testid="User-Name"]');
    if (!userNameEl) return 'Unbekannter Autor';

    // X structure: Display Name, Badges, and @handle are separated by text/spans
    const text = userNameEl.innerText || '';
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length >= 2) {
      // E.g. "Name" and "@handle"
      return `${lines[0]} (${lines[1]})`;
    }
    return lines[0] || 'Unbekannter Autor';
  }

  /**
   * Extract author handle specifically (e.g. "@username")
   */
  function extractAuthorHandle(tweetEl) {
    const userNameEl = tweetEl.querySelector('div[data-testid="User-Name"]');
    if (!userNameEl) return '';
    const text = userNameEl.innerText || '';
    const match = text.match(/@([a-zA-Z0-9_]+)/);
    return match ? `@${match[1]}` : '';
  }

  /**
   * Check if author has a verified badge (Blue Check / Gold Check / Org)
   */
  function isAuthorVerified(containerEl) {
    if (!containerEl) return false;
    return !!(
      containerEl.querySelector('svg[data-testid="icon-verified"]') ||
      containerEl.querySelector('svg[aria-label*="Verified"]') ||
      containerEl.querySelector('svg[aria-label*="تایید"]') ||
      containerEl.querySelector('svg[aria-label*="تأیید"]')
    );
  }

  /**
   * Check if author has an official Grey Badge (Government / State Authority / Multilateral Org)
   * Strictly detects official grey checkmark accounts on X.
  /**
   * Helper to determine if a verified SVG icon on X represents the official Grey Badge (Government / Head of State)
   */
  function isSvgGreyBadge(svgEl) {
    if (!svgEl) return false;
    const aria = (svgEl.getAttribute('aria-label') || '').toLowerCase();
    // 1. Direct aria-label mentions
    if (/government|multilateral|state-affiliated|دولتی|حاکمیتی/i.test(aria)) {
      return true;
    }
    // Exclude blue or gold checkmark explicitly named
    if (/blue|gold|subscribed|طلایی|تیک\s*آبی/i.test(aria)) {
      return false;
    }

    // 2. Computed Color Inspection
    try {
      const candidates = [
        svgEl,
        svgEl.parentElement,
        svgEl.querySelector('path'),
        svgEl.querySelector('g')
      ].filter(Boolean);

      for (const el of candidates) {
        const style = window.getComputedStyle(el);
        const colorStr = style.color || style.fill || '';
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (match) {
          const r = parseInt(match[1], 10);
          const g = parseInt(match[2], 10);
          const b = parseInt(match[3], 10);

          // Exclude Blue Checkmark: Blue is high and dominates Red
          if (b > 175 && (b - r > 65)) return false;

          // Exclude Gold Checkmark: Red and Green are high, Blue is low
          if (r > 190 && g > 140 && b < 90) return false;

          // Exclude extreme white/black
          if (r > 245 && g > 245 && b > 245) continue;
          if (r < 35 && g < 35 && b < 35) continue;

          // Grey Badge on Twitter/X:
          // Monochromatic/low saturation (diff <= 58) and mid brightness (45 <= max <= 215)
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          if ((maxC - minC) <= 58 && maxC >= 45 && maxC <= 215) {
            return true;
          }
        }
      }
    } catch (e) {
      // Fallback
    }
    return false;
  }

  /**
   * Check if author has an official Grey Badge (Government / State Authority / Multilateral Org)
   * Strictly detects official grey checkmark accounts on X.
   */
  function isAuthorGreyBadge(containerEl) {
    if (!containerEl || containerEl === document || containerEl === document.body) return false;

    // Never classify Iranian regime entities / embassies as a benign grey badge!
    const containerText = (containerEl.innerText || '').toLowerCase();
    if (/جمهوری\s*اسلامی|سفارت\s*ایران|mfa\.ir|gov\.ir|iranin[a-z]+/i.test(containerText)) {
      return false;
    }

    // 1. Strict Twitter affiliate badge inside author container ONLY (e.g. "Government official", "Government organization")
    const affiliateEl = containerEl.querySelector(
      '[data-testid="UserAffiliateBadge"], a[href*="/rules-and-policies/state-affiliated"], a[href*="help.twitter.com"][href*="government"], a[href*="help.twitter.com"][href*="profile-labels"]'
    );

    if (affiliateEl) {
      const txt = (affiliateEl.innerText || affiliateEl.getAttribute('aria-label') || '').toLowerCase();
      if (/government|state-affiliated|دولتی|حاکمیتی|head\s*of\s*state|prime\s*minister|president|minister/i.test(txt)) {
        return true;
      }
    }

    // 2. Check all verified SVGs inside container or UserName element
    const verifiedSvgs = containerEl.querySelectorAll(
      'svg[data-testid="icon-verified"], svg[aria-label*="Verified"], svg[aria-label*="تایید"], svg[aria-label*="تأیید"], svg[aria-label*="Government"], svg[aria-label*="دولتی"]'
    );

    for (const svgEl of verifiedSvgs) {
      if (isSvgGreyBadge(svgEl)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Helper to determine if a verified SVG icon on X represents the official Gold Badge (Verified Organization / Business)
   */
  function isSvgGoldBadge(svgEl) {
    if (!svgEl) return false;
    const aria = (svgEl.getAttribute('aria-label') || '').toLowerCase();
    // 1. Direct aria-label mentions
    if (/organization|business|سازمان|شرکت|طلایی|gold/i.test(aria)) {
      return true;
    }
    // Exclude blue or grey checkmarks
    if (/blue|grey|gray|خاکستری|تیک\s*آبی/i.test(aria)) {
      return false;
    }

    // 2. Computed Color Inspection
    try {
      const candidates = [
        svgEl,
        svgEl.parentElement,
        svgEl.querySelector('path'),
        svgEl.querySelector('g')
      ].filter(Boolean);

      for (const el of candidates) {
        const style = window.getComputedStyle(el);
        const colorStr = style.color || style.fill || '';
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (match) {
          const r = parseInt(match[1], 10);
          const g = parseInt(match[2], 10);
          const b = parseInt(match[3], 10);

          // Gold checkmark on X: #ffd400 / rgb(255, 212, 0)
          // Red and Green are high, Blue is very low
          if (r >= 180 && g >= 140 && b <= 75) {
            return true;
          }
        }
      }
    } catch (e) {
      // Fallback
    }
    return false;
  }

  /**
   * Check if author has an official Gold Badge (Verified Organization / Official Business)
   */
  function isAuthorGoldBadge(containerEl) {
    if (!containerEl || containerEl === document || containerEl === document.body) return false;

    // Check verified SVGs
    const verifiedSvgs = containerEl.querySelectorAll(
      'svg[data-testid="icon-verified"], svg[aria-label*="Verified"], svg[aria-label*="تایید"], svg[aria-label*="تأیید"], svg[aria-label*="Organization"], svg[aria-label*="طلایی"]'
    );

    for (const svgEl of verifiedSvgs) {
      if (isSvgGoldBadge(svgEl)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts official government or affiliate label text from X DOM strictly inside containerEl
   */
  function extractAffiliateLabel(containerEl) {
    if (!containerEl || containerEl === document || containerEl === document.body) return '';
    const affiliateEl = containerEl.querySelector(
      '[data-testid="UserAffiliateBadge"], a[href*="/rules-and-policies/state-affiliated"], a[href*="help.twitter.com"][href*="government"]'
    );
    if (affiliateEl) {
      const txt = (affiliateEl.innerText || affiliateEl.getAttribute('aria-label') || '').trim();
      if (/government\s*official|government\s*organization|state-affiliated|مقام\s*دولتی|نهاد\s*دولتی/i.test(txt)) {
        return txt;
      }
    }
    return '';
  }

  /**
   * In-memory + storage-backed cache of observed tweets & hashtags per @handle
   * Ensures X's virtual DOM scrolling never loses older posts/hashtags already seen.
   */
  const accountHistoryMemory = new Map(); // handle -> { displayName, bio, joinDate, isVerified, tweets: Map, hashtags: Map, retweetedHandles: Map, quotedInteractions: Array }
  let historyStorageLoaded = false;
  let historySaveTimer = null;

  /**
   * Live directory for automatic Timeline Mini-Badges & Permanent rest_id Handle-Change Tracking
   */
  const badgeDirectory = {
    handleMap: {}, // normHandle -> { faction, handle, restId }
    restIdMap: {}  // restId -> { restId, currentHandle, previousHandles, faction }
  };
  const handleToRestId = new Map(); // normHandle -> restId

  function normalizeHandleKey(str) {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .replace(/[@_#\-\.\s]/g, '')
      .replace(/[ي]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      .replace(/[‌]/g, '')
      .replace(/[غ]/g, 'ق');
  }

  async function refreshBadgeDirectory() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'GET_BADGE_DIRECTORY' });
      if (res && res.success) {
        badgeDirectory.handleMap = res.handleMap || {};
        badgeDirectory.restIdMap = res.restIdMap || {};
        for (const [rId, entry] of Object.entries(badgeDirectory.restIdMap)) {
          if (entry && entry.currentHandle) {
            handleToRestId.set(normalizeHandleKey(entry.currentHandle), rId);
          }
        }
        refreshAllVisibleMiniBadges();
      }
    } catch (e) {
      // Non-fatal if service worker is waking up
    }
  }
  refreshBadgeDirectory();

  function getMiniBadgeMeta(factionKey) {
    switch (factionKey) {
      case 'pahlavi':
      case 'farah':
      case 'vaisi':
        return { icon: '🦁👑', text: 'ملی‌گرا / پهلوی', className: 'xray-mb-pahlavi' };
      case 'mek':
        return { icon: '🚨', text: 'مجاهدین (MEK)', className: 'xray-mb-mek' };
      case 'arzeshi':
      case 'khamenei':
      case 'mojtaba':
      case 'raisi':
      case 'larijani':
      case 'ghalibaf':
      case 'bbcpersian':
      case 'kohnavard':
      case 'afshari':
        return { icon: '🔴', text: 'ارزشی / سایبری', className: 'xray-mb-arzeshi' };
      case 'eslahtalab':
      case 'alidoosti':
      case 'sazegara':
        return { icon: '🟡', text: 'اصلاح‌طلب', className: 'xray-mb-eslahtalab' };
      case 'chapi':
      case 'mohammadi':
      case 'toomaj':
      case 'golshifteh':
      case 'boniadi':
      case 'esmaeilion':
      case 'golroo':
      case 'rahmani':
      case 'modarres':
        return { icon: '🟣', text: 'چپ / ۵۷ی', className: 'xray-mb-chapi' };
      case 'separatist':
      case 'javanmardi':
        return { icon: '🏴', text: 'تجزیه‌طلب', className: 'xray-mb-separatist' };
      case 'false_flag':
      case 'omiddana':
      case 'fakhravar':
      case 'homayoun':
      case 'alinejad':
      case 'ronaghi':
        return { icon: '🎭', text: 'نفوذی / قلابی', className: 'xray-mb-falseflag' };
      case 'government':
        return { icon: '🏛️', text: 'دولتی رسمی', className: 'xray-mb-gov' };
      case 'organization':
      case 'business':
        return { icon: '🏢', text: 'سازمان / رسانه رسمی', className: 'xray-mb-gold' };
      case 'diplomatic':
        return { icon: '🌐', text: 'دیپلماتیک', className: 'xray-mb-media' };
      case 'media':
        return { icon: '🟢', text: 'رسانه / خبری', className: 'xray-mb-media' };
      case 'suspicious':
        return { icon: '🟠', text: 'حساب مشکوک', className: 'xray-mb-suspicious' };
      case 'citizen':
        return { icon: '⚪', text: 'کاربر عادی', className: 'xray-mb-citizen' };
      default:
        return null;
    }
  }

  function inferFactionKeyFromIdentityText(identityText, isMekAlert = false, isFalseFlag = false) {
    if (isMekAlert) return 'mek';
    if (isFalseFlag) return 'false_flag';
    const idLine = String(identityText || '').toLowerCase();
    if (!idLine) return '';
    if (idLine.includes('کاربر عادی') || idLine.includes('شهروند معمولی') || idLine.includes('فاقد شواهد سایبری')) return 'citizen';
    if (idLine.includes('حساب مشکوک') || idLine.includes('الگوی نزدیک به بات')) return 'suspicious';
    if (idLine.includes('مجاهدین') || idLine.includes('mek') || idLine.includes('رجوی') || idLine.includes('منافقین')) return 'mek';
    if (idLine.includes('قلابی') || idLine.includes('نفوذی') || idLine.includes('پرونده‌ساز') || idLine.includes('کمدساز') || idLine.includes('جفرسون') || idLine.includes('شارلاتان') || idLine.includes('پرستوی نظام')) return 'false_flag';
    if (idLine.includes('تجزیه') || idLine.includes('قوم‌گرا') || idLine.includes('جوانمردی')) return 'separatist';
    if (idLine.includes('ارزشی') || idLine.includes('حامی جمهوری اسلامی') || idLine.includes('سایبری حکومتی') || idLine.includes('سایبری رژیم') || idLine.includes('اکانت سایبری') || idLine.includes('ارتش سایبری') || idLine.includes('ولایی') || idLine.includes('آیت‌الله بی‌بی‌سی') || idLine.includes('ضعیفه رژیم') || idLine.includes('افشاری') || idLine.includes('بسیجی') || idLine.includes('ارگان رسمی حکومت') || idLine.includes('موش‌تباه') || idLine.includes('موش‌علی') || idLine.includes('خامنه‌ای') || idLine.includes('جلاد ۶۷')) return 'arzeshi';
    if (idLine.includes('اصلاح‌طلب') || idLine.includes('استمرارطلب') || idLine.includes('سازگارا') || idLine.includes('علیدوستی')) return 'eslahtalab';
    if (idLine.includes('چپ') || idLine.includes('چپول') || idLine.includes('۵۷ی')) return 'chapi';
    if (idLine.includes('پهلوی') || idLine.includes('ملی‌گرا') || idLine.includes('پادشاهی') || idLine.includes('شهبانو') || idLine.includes('مراد ویسی') || idLine.includes('مشروطه')) return 'pahlavi';
    if (idLine.includes('تیک خاکستری') || idLine.includes('نشان تایید خاکستری') || idLine.includes('حساب رسمی دولتی')) return 'government';
    if (idLine.includes('تیک طلایی') || idLine.includes('نشان تایید طلایی') || idLine.includes('سازمان رسمی') || idLine.includes('شرکت رسمی') || idLine.includes('شرکت ثبت‌شده') || idLine.includes('نهاد تجاری') || idLine.includes('organization')) return 'organization';
    if (idLine.includes('دیپلماتیک') || idLine.includes('وزارت امور خارجه')) return 'diplomatic';
    if (idLine.includes('روزنامه‌نگار') || idLine.includes('خبرنگار') || idLine.includes('رسانه') || idLine.includes('خبرگزاری') || idLine.includes('تلویزیونی') || idLine.includes('پژوهشگر') || idLine.includes('نویسنده') || idLine.includes('طنزپرداز') || idLine.includes('هنرمند') || idLine.includes('فعال حقوق بشر') || idLine.includes('آموزشکده') || idLine.includes('نهاد مدنی')) return 'media';
    return '';
  }

  function resolveAccountBadgeAndHistory(rawHandle) {
    const cleanH = (rawHandle || '').replace('@', '').toLowerCase();
    const normH = normalizeHandleKey(cleanH);
    if (!normH) return null;

    const rec = accountHistoryMemory.get(cleanH);
    const restId = (rec && rec.restId) || handleToRestId.get(normH) || badgeDirectory.handleMap[normH]?.restId || '';
    const restEntry = restId ? badgeDirectory.restIdMap[restId] : null;

    let faction = badgeDirectory.handleMap[normH]?.faction || restEntry?.faction || '';
    if (!faction && restEntry && Array.isArray(restEntry.previousHandles)) {
      for (const oldH of restEntry.previousHandles) {
        const normOld = normalizeHandleKey(oldH);
        if (normOld && badgeDirectory.handleMap[normOld]?.faction) {
          faction = badgeDirectory.handleMap[normOld].faction;
          break;
        }
      }
    }

    // Also auto-detect Iranian regime embassies for instant badge
    if (!faction && (/^iranin[a-z]{2,15}$/i.test(cleanH) || /^(mfa_ir|irimfa|iranmfa|ir_mfa)$/i.test(cleanH))) {
      faction = 'arzeshi';
    }

    const prevHandles = (restEntry && Array.isArray(restEntry.previousHandles))
      ? restEntry.previousHandles.filter(h => normalizeHandleKey(h) !== normH)
      : (rec && Array.isArray(rec.previousHandles) ? rec.previousHandles.filter(h => normalizeHandleKey(h) !== normH) : []);

    if (!faction && prevHandles.length === 0) return null;

    return {
      faction,
      restId,
      previousHandles: prevHandles
    };
  }

  function injectMiniBadgeOnTweet(tweetEl) {
    if (!tweetEl) return;
    const authorHandle = extractAuthorHandle(tweetEl);
    if (!authorHandle) return;

    const userNameEl = tweetEl.querySelector('div[data-testid="User-Name"]');
    if (!userNameEl) return;

    const badgeInfo = resolveAccountBadgeAndHistory(authorHandle);
    const existingBadge = userNameEl.querySelector('.xray-mini-badge');

    if (!badgeInfo) {
      if (existingBadge) existingBadge.remove();
      return;
    }

    const meta = getMiniBadgeMeta(badgeInfo.faction);
    const hasHandleChange = badgeInfo.previousHandles && badgeInfo.previousHandles.length > 0;
    if (!meta && !hasHandleChange) {
      if (existingBadge) existingBadge.remove();
      return;
    }

    const badgeEl = existingBadge || document.createElement('span');
    badgeEl.className = `xray-mini-badge ${meta ? meta.className : 'xray-mb-falseflag'}${hasHandleChange ? ' xray-mb-renamed' : ''}`;

    const prevHandlesStr = hasHandleChange
      ? badgeInfo.previousHandles.map(h => `@${String(h).replace(/^@/, '')}`).join('، ')
      : '';

    const labelHtml = meta
      ? `<span class="xray-mb-icon">${meta.icon}</span><span class="xray-mb-text">${meta.text}</span>`
      : `<span class="xray-mb-icon">⚠️</span><span class="xray-mb-text">تغییر نام</span>`;

    const renamePillHtml = hasHandleChange
      ? `<span class="xray-mb-rename-tag" title="این اکانت قبلاً با نام ${prevHandlesStr} فعالیت می‌کرده است">🔄 سابقاً ${prevHandlesStr}</span>`
      : '';

    const nextHtml = `${labelHtml}${renamePillHtml}`;
    if (badgeEl.innerHTML !== nextHtml) {
      badgeEl.innerHTML = nextHtml;
    }

    badgeEl.title = hasHandleChange
      ? `⚠️ هشدار تغییر نام کاربری (ID دائمی #${badgeInfo.restId}): این اکانت قبلاً با آیدی ${prevHandlesStr} فعالیت می‌کرده است! (کلیک برای کالبدشکافی کامل)`
      : `تشخیص سریع X-Ray: ${meta ? meta.text : ''} (کلیک برای مشاهده جزئیات کامل)`;

    if (!existingBadge) {
      badgeEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const triggerBtn = tweetEl.querySelector('.xray-bot-btn');
        if (triggerBtn && !triggerBtn.disabled) {
          triggerBtn.click();
        }
      });
      userNameEl.appendChild(badgeEl);
    }
  }

  function refreshAllVisibleMiniBadges() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(t => {
      injectMiniBadgeOnTweet(t);
    });
  }

  function ensureAccountHistoryRecord(cleanHandle, defaults = {}) {
    if (!accountHistoryMemory.has(cleanHandle)) {
      accountHistoryMemory.set(cleanHandle, {
        restId: defaults.restId || '',
        previousHandles: Array.isArray(defaults.previousHandles) ? defaults.previousHandles : [],
        displayName: defaults.displayName || '',
        bio: defaults.bio || '',
        joinDate: defaults.joinDate || '',
        userUrl: defaults.userUrl || '',
        followersRaw: defaults.followersRaw || '',
        followingRaw: defaults.followingRaw || '',
        isVerified: Boolean(defaults.isVerified),
        isGreyBadge: Boolean(defaults.isGreyBadge),
        verifiedType: defaults.verifiedType || '',
        governmentLabel: defaults.governmentLabel || '',
        tweets: new Map(),
        hashtags: new Map(),
        retweetedHandles: new Map(),
        quotedInteractions: []
      });
    }
    const rec = accountHistoryMemory.get(cleanHandle);
    if (!rec.retweetedHandles) rec.retweetedHandles = new Map();
    if (!rec.quotedInteractions) rec.quotedInteractions = [];
    if (!rec.previousHandles) rec.previousHandles = [];
    return rec;
  }

  async function loadAccountHistoryFromStorage() {
    if (historyStorageLoaded) return;
    historyStorageLoaded = true;
    try {
      const data = await chrome.storage.local.get(['xrayAccountHistory']);
      const raw = data?.xrayAccountHistory || {};
      let needsCleanup = false;
      for (const [handle, entry] of Object.entries(raw)) {
        if (!accountHistoryMemory.has(handle)) {
          const tweetsMap = new Map(Object.entries(entry.tweets || {}));
          const hashtagsMap = new Map(Object.entries(entry.hashtags || {}));
          const retweetedMap = new Map(Object.entries(entry.retweetedHandles || {}));

          // Strict sanitization: Only genuine foreign government/state authorities can have isGreyBadge = true
          const isIranianEntity = Boolean(
            /^iranin[a-z]{2,15}$/i.test(handle) ||
            /^(ir|iran)_?(emb|mission|consulate)/i.test(handle) ||
            /^(emb|mission)_?(ir|iran)/i.test(handle) ||
            /^(mfa_ir|irimfa|iranmfa|ir_mfa|irangov|president_ir|leader_ir)/i.test(handle) ||
            /mfa\.ir|gov\.ir/i.test(entry.bio || '') ||
            /mfa\.ir|gov\.ir/i.test(entry.userUrl || '')
          );

          const isStrictGov = Boolean(
            !isIranianEntity &&
            (Boolean(entry.isGreyBadge) || entry.verifiedType === 'Government')
          );

          if (entry.isGreyBadge && isIranianEntity) {
            entry.isGreyBadge = false;
            if (entry.verifiedType === 'Government') entry.verifiedType = '';
            needsCleanup = true;
          }

          if (entry.restId) {
            handleToRestId.set(normalizeHandleKey(handle), String(entry.restId));
          }

          accountHistoryMemory.set(handle, {
            restId: entry.restId || '',
            previousHandles: Array.isArray(entry.previousHandles) ? entry.previousHandles : [],
            displayName: entry.displayName || '',
            bio: entry.bio || '',
            joinDate: entry.joinDate || '',
            userUrl: entry.userUrl || '',
            followersRaw: entry.followersRaw || '',
            followingRaw: entry.followingRaw || '',
            isVerified: Boolean(entry.isVerified),
            isGreyBadge: isStrictGov,
            isGoldBadge: Boolean(entry.isGoldBadge || entry.verifiedType === 'Business'),
            verifiedType: isStrictGov ? 'Government' : (entry.isGoldBadge || entry.verifiedType === 'Business' ? 'Business' : (entry.verifiedType === 'Government' ? '' : (entry.verifiedType || ''))),
            governmentLabel: isStrictGov ? (entry.governmentLabel || '') : (entry.isGoldBadge || entry.verifiedType === 'Business' ? (entry.governmentLabel || 'سازمان رسمی / شرکت ثبت‌شده (تیک طلایی)') : ''),
            tweets: tweetsMap,
            hashtags: hashtagsMap,
            retweetedHandles: retweetedMap,
            quotedInteractions: Array.isArray(entry.quotedInteractions) ? entry.quotedInteractions : []
          });
        }
      }
      if (needsCleanup) {
        scheduleSaveAccountHistory();
      }
    } catch (e) {
      // Ignore storage read errors
    }
  }
  loadAccountHistoryFromStorage();

  function scheduleSaveAccountHistory() {
    if (historySaveTimer) clearTimeout(historySaveTimer);
    historySaveTimer = setTimeout(async () => {
      try {
        const serialized = {};
        // Keep last 120 handles in local storage
        const entries = Array.from(accountHistoryMemory.entries()).slice(-120);
        for (const [handle, val] of entries) {
          const isIranianEntity = Boolean(
            /^iranin[a-z]{2,15}$/i.test(handle) ||
            /^(ir|iran)_?(emb|mission|consulate)/i.test(handle) ||
            /^(emb|mission)_?(ir|iran)/i.test(handle) ||
            /^(mfa_ir|irimfa|iranmfa|ir_mfa|irangov|president_ir|leader_ir)/i.test(handle) ||
            /mfa\.ir|gov\.ir/i.test(val.bio || '') ||
            /mfa\.ir|gov\.ir/i.test(val.userUrl || '')
          );
          const isStrictGov = Boolean(
            !isIranianEntity &&
            (Boolean(val.isGreyBadge) || val.verifiedType === 'Government')
          );
          serialized[handle] = {
            restId: val.restId || '',
            previousHandles: Array.isArray(val.previousHandles) ? val.previousHandles : [],
            displayName: val.displayName || '',
            bio: val.bio || '',
            joinDate: val.joinDate || '',
            userUrl: val.userUrl || '',
            followersRaw: val.followersRaw || '',
            followingRaw: val.followingRaw || '',
            isVerified: Boolean(val.isVerified),
            isGreyBadge: isStrictGov,
            isGoldBadge: Boolean(val.isGoldBadge || val.verifiedType === 'Business'),
            verifiedType: isStrictGov ? 'Government' : (val.isGoldBadge || val.verifiedType === 'Business' ? 'Business' : (val.verifiedType === 'Government' ? '' : (val.verifiedType || ''))),
            governmentLabel: isStrictGov ? (val.governmentLabel || '') : (val.isGoldBadge || val.verifiedType === 'Business' ? (val.governmentLabel || 'سازمان رسمی / شرکت ثبت‌شده (تیک طلایی)') : ''),
            tweets: Object.fromEntries(Array.from(val.tweets.entries()).slice(-40)),
            hashtags: Object.fromEntries(val.hashtags.entries()),
            retweetedHandles: Object.fromEntries((val.retweetedHandles || new Map()).entries()),
            quotedInteractions: (val.quotedInteractions || []).slice(-20)
          };
        }
        await chrome.storage.local.set({ xrayAccountHistory: serialized });
      } catch (e) {
        // Ignore storage quota errors
      }
    }, 1200);
  }

  /**
   * Extracts hashtags (#...) from a given text or DOM element
   */
  function extractHashtagsFromTextAndNode(text, nodeEl) {
    const tags = new Set();
    if (nodeEl) {
      const hashtagLinks = nodeEl.querySelectorAll('a[href*="/hashtag/"]');
      hashtagLinks.forEach(a => {
        const t = (a.innerText || '').trim().replace(/^#/, '');
        if (t && t.length >= 2) tags.add(t);
      });
    }
    if (text) {
      const regex = /#([\p{L}\p{N}_\u200C]{2,60})/gu;
      for (const m of text.matchAll(regex)) {
        if (m[1]) tags.add(m[1]);
      }
    }
    return Array.from(tags);
  }

  function normalizeHashtagKey(tag) {
    return (tag || '')
      .toLowerCase()
      .replace(/^#/, '')
      .replace(/[\u200C\s_\-]/g, '')
      .replace(/[ي]/g, 'ی')
      .replace(/[ك]/g, 'ک');
  }

  /**
   * Comprehensive tweet scraper: extracts main text, quote tweet, social context (retweet indicator),
   * author-only hashtags (never polluted by quoted tweets!), interaction graph handles (retweeted vs quoted), and external links.
   */
  function extractTweetData(tweetEl) {
    if (!tweetEl) {
      return {
        text: '',
        rawMainText: '',
        quoteText: '',
        quotedAuthorHandle: '',
        retweeterHandle: '',
        socialContextText: '',
        isRetweet: false,
        authorHashtags: [],
        referencedHandles: [],
        links: []
      };
    }

    const textElements = tweetEl.querySelectorAll('div[data-testid="tweetText"]');
    const mainTextEl = (textElements && textElements.length > 0) ? textElements[0] : null;
    const mainText = (mainTextEl && mainTextEl.innerText)
      ? mainTextEl.innerText.trim()
      : '';

    let quoteText = '';
    if (textElements && textElements.length > 1 && textElements[1].innerText) {
      quoteText = textElements[1].innerText.trim();
    }

    // Identify Quoted Tweet Author if a second User-Name block exists inside the tweet card
    const userNames = tweetEl.querySelectorAll('div[data-testid="User-Name"]');
    let quotedAuthorHandle = '';
    if (userNames && userNames.length > 1 && userNames[1].innerText) {
      const qMatch = userNames[1].innerText.match(/@([a-zA-Z0-9_]+)/);
      if (qMatch && qMatch[1]) {
        quotedAuthorHandle = qMatch[1].toLowerCase();
      }
    }

    // Extract hashtags ONLY from the author's own tweet text (mainTextEl), NEVER from quoteText!
    const authorHashtags = extractHashtagsFromTextAndNode(mainText, mainTextEl);

    // Social context (e.g. "X Retweeted" / "مسلم بازنشر کرد")
    const socialContextEl = tweetEl.querySelector('[data-testid="socialContext"]');
    const socialContextText = socialContextEl ? (socialContextEl.innerText || '').trim() : '';
    const isRetweet = /retweet|repost|بازنشر/i.test(socialContextText);

    // Determine who performed the retweet if isRetweet is true
    let retweeterHandle = '';
    if (isRetweet) {
      if (socialContextEl) {
        const scLink = socialContextEl.closest('a[href]') || socialContextEl.querySelector('a[href]');
        if (scLink) {
          const scHref = (scLink.getAttribute('href') || '').replace(/^\//, '').split('/')[0].toLowerCase();
          if (scHref && !['home', 'explore', 'i', 'search'].includes(scHref)) {
            retweeterHandle = scHref;
          }
        }
      }
      if (!retweeterHandle) {
        const pathSeg = window.location.pathname.replace(/^\//, '').split('/')[0].toLowerCase();
        if (pathSeg && !['home', 'explore', 'notifications', 'messages', 'i', 'search', 'settings'].includes(pathSeg)) {
          retweeterHandle = pathSeg;
        }
      }
    }

    const referencedHandles = new Set();
    const links = new Set();
    const authorHandle = extractAuthorHandle(tweetEl).replace('@', '').toLowerCase();

    // 1. Scrape all anchors inside tweet
    const anchors = tweetEl.querySelectorAll('a[href]');
    anchors.forEach(a => {
      const href = a.getAttribute('href') || '';
      const visibleText = (a.innerText || '').trim();

      // Check /username/status/123 status URLs
      const statusMatch = href.match(/^\/([a-zA-Z0-9_]+)\/status\//i);
      if (statusMatch) {
        const h = statusMatch[1].toLowerCase();
        if (h !== authorHandle && !['home', 'explore', 'notifications', 'messages', 'i'].includes(h)) {
          referencedHandles.add(h);
        }
      }

      // Check /username user links
      const userMatch = href.match(/^\/([a-zA-Z0-9_]+)$/i);
      if (userMatch) {
        const h = userMatch[1].toLowerCase();
        if (h !== authorHandle && !['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'settings', 'tos', 'privacy', 'search'].includes(h)) {
          referencedHandles.add(h);
        }
      }

      // Check visible text for handles e.g. @aliatash88
      const textHandleMatch = visibleText.match(/@([a-zA-Z0-9_]+)/);
      if (textHandleMatch) {
        const h = textHandleMatch[1].toLowerCase();
        if (h !== authorHandle) referencedHandles.add(h);
      }

      // Check visible text for x.com/handle
      const xUrlMatch = visibleText.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)/i);
      if (xUrlMatch) {
        const h = xUrlMatch[1].toLowerCase();
        if (h !== authorHandle && !['home', 'explore', 'i'].includes(h)) referencedHandles.add(h);
      }

      // Save visible external links
      if (visibleText && (visibleText.includes('http') || visibleText.includes('.com') || visibleText.includes('.org') || visibleText.includes('.net') || visibleText.includes('x.com'))) {
        links.add(visibleText);
      }
    });

    // 2. Check full raw text of tweet container for x.com links and handles
    const fullContainerText = tweetEl.innerText || '';
    const rawHandleMatches = fullContainerText.matchAll(/@([a-zA-Z0-9_]{3,})/g);
    for (const m of rawHandleMatches) {
      const h = m[1].toLowerCase();
      if (h !== authorHandle) referencedHandles.add(h);
    }
    const rawXUrlMatches = fullContainerText.matchAll(/(?:https?:\/\/)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)\/status/gi);
    for (const m of rawXUrlMatches) {
      const h = m[1].toLowerCase();
      if (h !== authorHandle) referencedHandles.add(h);
    }

    // 3. Assemble complete contextual text
    let combinedText = mainText;
    if (socialContextText) {
      combinedText = `[${socialContextText}]\n${combinedText}`;
    }
    if (quoteText) {
      combinedText += `\n\n[توییت نقل‌شده / کوت‌شده${quotedAuthorHandle ? ' از @' + quotedAuthorHandle : ''}: ${quoteText}]`;
    }
    if (referencedHandles.size > 0) {
      combinedText += `\n[اکانت‌های نقل‌شده یا منشن‌شده: ${Array.from(referencedHandles).map(h => '@' + h).join(', ')}]`;
    }
    if (links.size > 0) {
      combinedText += `\n[لینک‌های موجود در توییت: ${Array.from(links).slice(0, 3).join(', ')}]`;
    }

    return {
      text: combinedText.trim(),
      rawMainText: mainText,
      quoteText,
      quotedAuthorHandle,
      retweeterHandle,
      socialContextText,
      isRetweet,
      authorHashtags,
      referencedHandles: Array.from(referencedHandles),
      links: Array.from(links)
    };
  }

  /**
   * Passively records a tweet, its author hashtags, and its interaction graph
   * (Retweets vs Quotes) into accountHistoryMemory so virtual scrolling on X never loses older posts.
   */
  function recordTweetInHistory(tweetEl) {
    try {
      const rawHandle = extractAuthorHandle(tweetEl);
      if (!rawHandle) return;
      const cleanAuthorHandle = rawHandle.replace('@', '').toLowerCase();
      if (!cleanAuthorHandle) return;

      const tData = extractTweetData(tweetEl);
      if (!tData.rawMainText && (!tData.authorHashtags || tData.authorHashtags.length === 0)) return;

      // 1. Record for the tweet's direct author
      const record = ensureAccountHistoryRecord(cleanAuthorHandle, {
        displayName: extractTweetAuthor(tweetEl),
        isVerified: isAuthorVerified(tweetEl)
      });

      const authorName = extractTweetAuthor(tweetEl);
      if (authorName && authorName !== 'Unbekannter Autor') {
        record.displayName = authorName;
      }
      if (isAuthorVerified(tweetEl)) {
        record.isVerified = true;
      }

      const sig = (tData.rawMainText || '').slice(0, 120).trim();
      if (sig && !record.tweets.has(sig)) {
        record.tweets.set(sig, {
          text: tData.rawMainText,
          hashtags: tData.authorHashtags || [],
          isRetweet: false,
          quotedAuthorHandle: tData.quotedAuthorHandle || '',
          quoteText: (tData.quoteText || '').slice(0, 200),
          ts: Date.now()
        });

        if (record.tweets.size > 50) {
          const oldestKey = record.tweets.keys().next().value;
          record.tweets.delete(oldestKey);
        }

        for (const tag of (tData.authorHashtags || [])) {
          const normKey = normalizeHashtagKey(tag);
          if (!normKey) continue;
          const prev = record.hashtags.get(normKey) || { tag, count: 0 };
          prev.count += 1;
          record.hashtags.set(normKey, prev);
        }

        // If this tweet is a Quote Tweet, record the quote interaction on the author's graph
        if (tData.quotedAuthorHandle && tData.quotedAuthorHandle !== cleanAuthorHandle) {
          const alreadyQuoted = record.quotedInteractions.some(
            q => q.targetHandle === tData.quotedAuthorHandle && q.comment.slice(0, 60) === tData.rawMainText.slice(0, 60)
          );
          if (!alreadyQuoted) {
            record.quotedInteractions.push({
              targetHandle: tData.quotedAuthorHandle,
              comment: tData.rawMainText.slice(0, 260),
              quotedText: (tData.quoteText || '').slice(0, 180)
            });
            if (record.quotedInteractions.length > 25) {
              record.quotedInteractions.shift();
            }
          }
        }

        scheduleSaveAccountHistory();
      }

      // 2. If this tweet in the timeline is a Retweet by `retweeterHandle` (e.g. on someone's profile page),
      // also attribute the Retweet endorsement and hashtags to `retweeterHandle`!
      if (tData.isRetweet && tData.retweeterHandle && tData.retweeterHandle !== cleanAuthorHandle) {
        const retweeterRec = ensureAccountHistoryRecord(tData.retweeterHandle);
        const prevRtCount = retweeterRec.retweetedHandles.get(cleanAuthorHandle) || 0;
        const rtSig = `RT:${cleanAuthorHandle}:${sig}`;
        if (sig && !retweeterRec.tweets.has(rtSig)) {
          retweeterRec.retweetedHandles.set(cleanAuthorHandle, prevRtCount + 1);
          retweeterRec.tweets.set(rtSig, {
            text: `[بازنشر از @${cleanAuthorHandle}]: ${tData.rawMainText}`,
            hashtags: tData.authorHashtags || [],
            isRetweet: true,
            retweetedAuthor: cleanAuthorHandle,
            ts: Date.now()
          });
          if (retweeterRec.tweets.size > 50) {
            const oldestKey = retweeterRec.tweets.keys().next().value;
            retweeterRec.tweets.delete(oldestKey);
          }
          for (const tag of (tData.authorHashtags || [])) {
            const normKey = normalizeHashtagKey(tag);
            if (!normKey) continue;
            const prev = retweeterRec.hashtags.get(normKey) || { tag, count: 0 };
            prev.count += 0.6;
            retweeterRec.hashtags.set(normKey, prev);
          }
          scheduleSaveAccountHistory();
        }
      }
    } catch (e) {
      // Non-fatal
    }
  }

  /**
   * Ingests Users (bio, joinDate, followers, following, verified) and Tweets
   * captured directly from X's internal GraphQL responses by page_sniffer.js
   */
  function ingestGraphQLSnifferPayload(payload) {
    if (!payload) return;
    let changed = false;

    try {
      // 1. Ingest User profile metadata & permanent rest_id tracking
      if (Array.isArray(payload.users)) {
        const restIdObservations = [];
        for (const u of payload.users) {
          const cleanH = (u.handle || '').replace('@', '').toLowerCase();
          if (!cleanH) continue;
          const rec = ensureAccountHistoryRecord(cleanH);
          if (u.restId) {
            const rId = String(u.restId).trim();
            rec.restId = rId;
            const normH = normalizeHandleKey(cleanH);
            handleToRestId.set(normH, rId);

            // Check in-memory restIdMap for immediate handle-change detection
            const prevRestEntry = badgeDirectory.restIdMap[rId];
            if (prevRestEntry) {
              if (prevRestEntry.currentHandle && normalizeHandleKey(prevRestEntry.currentHandle) !== normH) {
                if (!Array.isArray(prevRestEntry.previousHandles)) prevRestEntry.previousHandles = [];
                if (!prevRestEntry.previousHandles.some(ph => normalizeHandleKey(ph) === normalizeHandleKey(prevRestEntry.currentHandle))) {
                  prevRestEntry.previousHandles.push(prevRestEntry.currentHandle);
                }
                prevRestEntry.currentHandle = cleanH;
              }
              if (Array.isArray(prevRestEntry.previousHandles) && prevRestEntry.previousHandles.length > 0) {
                rec.previousHandles = prevRestEntry.previousHandles;
              }
            } else {
              badgeDirectory.restIdMap[rId] = {
                restId: rId,
                currentHandle: cleanH,
                previousHandles: [],
                faction: badgeDirectory.handleMap[normH]?.faction || ''
              };
            }
            restIdObservations.push({
              restId: rId,
              handle: cleanH,
              displayName: u.displayName || rec.displayName || ''
            });
          }
          if (u.displayName) rec.displayName = u.displayName;
          if (u.bio) rec.bio = u.bio;
          if (u.joinDate) rec.joinDate = u.joinDate;
          if (u.userUrl) rec.userUrl = u.userUrl;
          if (typeof u.followersCount === 'number') rec.followersRaw = String(u.followersCount);
          if (typeof u.followingCount === 'number') rec.followingRaw = String(u.followingCount);
          if (typeof u.isVerified === 'boolean') rec.isVerified = u.isVerified;
          if (typeof u.isGreyBadge === 'boolean') {
            rec.isGreyBadge = u.isGreyBadge;
            if (!u.isGreyBadge && rec.verifiedType === 'Government') {
              rec.verifiedType = u.verifiedType || '';
            }
          }
          if (u.verifiedType !== undefined) rec.verifiedType = u.verifiedType;
          if (u.governmentLabel !== undefined) rec.governmentLabel = u.governmentLabel;
          changed = true;
        }

        if (restIdObservations.length > 0) {
          chrome.runtime.sendMessage({
            action: 'REGISTER_REST_ID_OBSERVATIONS',
            users: restIdObservations
          }).then(res => {
            if (res && res.success && res.handleChanges) {
              for (const [normH, info] of Object.entries(res.handleChanges)) {
                if (info.restId) {
                  badgeDirectory.restIdMap[info.restId] = {
                    restId: info.restId,
                    currentHandle: normH,
                    previousHandles: info.previousHandles || [],
                    faction: info.faction || badgeDirectory.restIdMap[info.restId]?.faction || ''
                  };
                }
              }
              refreshAllVisibleMiniBadges();
            }
          }).catch(() => {});
        }
      }

      // 2. Ingest Tweets & Retweets
      if (Array.isArray(payload.tweets)) {
        for (const tw of payload.tweets) {
          const cleanAuthor = (tw.authorHandle || '').replace('@', '').toLowerCase();
          if (!cleanAuthor) continue;
          const rec = ensureAccountHistoryRecord(cleanAuthor);
          const rawText = (tw.text || '').trim();
          const sig = rawText.slice(0, 120).trim();
          if (!sig) continue;

          if (tw.isRetweet && tw.retweetedAuthor) {
            const cleanRtAuthor = tw.retweetedAuthor.replace('@', '').toLowerCase();
            const rtSig = `RT:${cleanRtAuthor}:${sig}`;
            if (!rec.tweets.has(rtSig)) {
              const prevRtCount = rec.retweetedHandles.get(cleanRtAuthor) || 0;
              rec.retweetedHandles.set(cleanRtAuthor, prevRtCount + 1);
              rec.tweets.set(rtSig, {
                text: `[بازنشر از @${cleanRtAuthor}]: ${rawText}`,
                hashtags: tw.hashtags || [],
                isRetweet: true,
                retweetedAuthor: cleanRtAuthor,
                ts: Date.now()
              });
              if (rec.tweets.size > 55) {
                const oldestKey = rec.tweets.keys().next().value;
                rec.tweets.delete(oldestKey);
              }
              for (const tag of (tw.hashtags || [])) {
                const normKey = normalizeHashtagKey(tag);
                if (!normKey) continue;
                const prev = rec.hashtags.get(normKey) || { tag, count: 0 };
                prev.count += 0.6;
                rec.hashtags.set(normKey, prev);
              }
              changed = true;
            }
          } else {
            if (!rec.tweets.has(sig)) {
              const tags = (tw.hashtags && tw.hashtags.length > 0)
                ? tw.hashtags
                : extractHashtagsFromTextAndNode(rawText, null);
              rec.tweets.set(sig, {
                text: rawText,
                hashtags: tags,
                isRetweet: false,
                quotedAuthorHandle: (tw.quotedAuthorHandle || '').toLowerCase(),
                quoteText: (tw.quoteText || '').slice(0, 200),
                ts: Date.now()
              });
              if (rec.tweets.size > 55) {
                const oldestKey = rec.tweets.keys().next().value;
                rec.tweets.delete(oldestKey);
              }
              for (const tag of tags) {
                const normKey = normalizeHashtagKey(tag);
                if (!normKey) continue;
                const prev = rec.hashtags.get(normKey) || { tag, count: 0 };
                prev.count += 1;
                rec.hashtags.set(normKey, prev);
              }
              if (tw.quotedAuthorHandle && tw.quotedAuthorHandle !== cleanAuthor) {
                const targetH = tw.quotedAuthorHandle.toLowerCase();
                const alreadyQuoted = rec.quotedInteractions.some(
                  q => q.targetHandle === targetH && q.comment.slice(0, 60) === rawText.slice(0, 60)
                );
                if (!alreadyQuoted) {
                  rec.quotedInteractions.push({
                    targetHandle: targetH,
                    comment: rawText.slice(0, 260),
                    quotedText: (tw.quoteText || '').slice(0, 180)
                  });
                  if (rec.quotedInteractions.length > 25) {
                    rec.quotedInteractions.shift();
                  }
                }
              }
              changed = true;
            }
          }
        }
      }

      if (changed) {
        scheduleSaveAccountHistory();
      }
    } catch (e) {
      // Non-fatal
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.source === 'XRAY_GRAPHQL_SNIFFER' && event.data.type === 'DATA') {
      ingestGraphQLSnifferPayload(event.data.payload);
    }
  });

  // Request any GraphQL responses buffered since document_start
  try {
    window.postMessage({ source: 'XRAY_CONTENT_SCRIPT', type: 'REQUEST_BUFFER' }, '*');
  } catch (e) {}

  /**
   * Format model tag for display
   */
  function formatModelTag(m) {
    if (!m) return '';
    const lower = (m || '').toLowerCase();
    if (lower.includes('llama-3.3-70b')) return 'Llama 3.3 70B';
    if (lower.includes('llama-3.1-8b')) return 'Llama 3.1 8B';
    if (lower.includes('llama3-70b')) return 'Llama 3 70B';
    if (lower.includes('llama3-8b')) return 'Llama 3 8B';
    if (lower.includes('qwen')) return 'Qwen 2.5';
    if (lower.includes('gemma')) return 'Gemma 2 9B';
    // Suppress internal heuristic radars and category names to prevent redundant header badges
    if (
      lower.includes('radar') ||
      lower.includes('رادار') ||
      lower.includes('registry') ||
      lower.includes('nationalist') ||
      lower.includes('pahlavi') ||
      lower.includes('arzeshi') ||
      lower.includes('mek') ||
      lower.includes('separatist') ||
      lower.includes('leftist') ||
      lower.includes('reformist') ||
      lower.includes('بانک') ||
      lower.includes('matrix') ||
      lower.includes('verified')
    ) {
      return '';
    }
    return m;
  }


  /**
   * Parses Groq response text into structured Account Forensic segments:
   * 🤖 تشخیص هویت اکانت
   * 📊 احتمال فیک/سایبری/بات بودن
   * 🚩 سرنخ‌ها و شواهد سازمانی یا رفتاری
   * 💡 حکم و هشدار امنیتی X-Ray
   */
  function parseAccountAnalysis(rawText) {
    if (!rawText) return null;

    const identityMatch = rawText.match(/🤖\s*(?:تشخیص\s*هویت\s*اکانت:?|هویت\s*اکانت:?|هویت:?)\s*([\s\S]*?)(?=📊|🚩|💡|$)/i);
    const probMatch = rawText.match(/📊\s*(?:احتمال\s*(?:فیک\/سایبری\/بات|فیک\/سایبری|فیک|سایبری|بات)?(?:\s*بودن)?:?)\s*([\s\S]*?)(?=🚩|💡|$)/i);
    const flagsMatch = rawText.match(/🚩\s*(?:سرنخ‌ها\s*و\s*شواهد\s*(?:سازمانی\s*یا\s*رفتاری|سازمانی|رفتاری):?|سرنخ‌ها:?|شواهد:?)\s*([\s\S]*?)(?=💡|$)/i);
    const verdictMatch = rawText.match(/💡\s*(?:حکم\s*و\s*هشدار\s*امنیتی\s*X-Ray:?|حکم\s*نهایی\s*X-Ray:?|حکم\s*نهایی:?|حکم:?)\s*([\s\S]*?)$/i);

    if (identityMatch || probMatch || flagsMatch || verdictMatch) {
      return {
        identity: identityMatch ? identityMatch[1].trim() : 'نامشخص',
        probability: probMatch ? probMatch[1].trim() : 'نامشخص',
        redFlags: flagsMatch ? flagsMatch[1].trim() : '',
        verdict: verdictMatch ? verdictMatch[1].trim() : ''
      };
    }

    return { raw: rawText.trim() };
  }

  /**
   * Format markdown-like bold (**text**) safely into HTML
   */
  function formatMarkdown(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    let safe = div.innerHTML;

    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\n\n/g, '<div class="xray-p-gap"></div>').replace(/\n/g, '<br>');

    return safe;
  }

  /* ==========================================================================
     ACCOUNT FORENSIC & BOT SCOUT RESULT BOX
     ========================================================================== */

  const FACTION_IMAGE_PATHS = {
    pahlavi: 'assets/factions/pahlavi.jpg',
    farah: 'assets/factions/farah.jpg',
    vaisi: 'assets/factions/vaisi.jpg',
    khamenei: 'assets/factions/khamenei.jpg',
    mojtaba: 'assets/factions/mojtaba.jpg',
    raisi: 'assets/factions/raisi.jpg',
    larijani: 'assets/factions/larijani.jpg',
    ghalibaf: 'assets/factions/ghalibaf.jpg',
    bbcpersian: 'assets/factions/bbcpersian.png',
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
    kohnavard: 'assets/factions/kohnavard.jpg',
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

  function getFactionImageUrl(key) {
    if (key && FACTION_IMAGE_PATHS[key]) {
      try {
        return chrome.runtime.getURL(FACTION_IMAGE_PATHS[key]);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Opens an interactive, high-definition lightbox displaying the faction icon/image in original size
   */
  function openImageLightbox(imageUrl, titleText = '') {
    if (!imageUrl) return;

    // Remove any previously open lightbox
    const existing = document.querySelector('.xray-image-lightbox');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'xray-image-lightbox xray-rtl';
    overlay.setAttribute('dir', 'rtl');

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'xray-lightbox-content';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'xray-lightbox-close';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'بستن (Esc)';

    const img = document.createElement('img');
    img.className = 'xray-lightbox-img';
    img.src = imageUrl;
    img.alt = titleText || 'تصویر نشان/فکشن';

    contentWrapper.appendChild(closeBtn);
    contentWrapper.appendChild(img);

    if (titleText) {
      const caption = document.createElement('div');
      caption.className = 'xray-lightbox-caption';
      caption.textContent = titleText;
      contentWrapper.appendChild(caption);
    }

    overlay.appendChild(contentWrapper);
    document.body.appendChild(overlay);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let isClosing = false;
    function closeLightbox() {
      if (isClosing) return;
      isClosing = true;
      overlay.classList.add('xray-lightbox-closing');
      document.body.style.overflow = prevOverflow;
      setTimeout(() => {
        overlay.remove();
      }, 200);
      document.removeEventListener('keydown', handleKeyDown);
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      }
    }

    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeLightbox();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        e.preventDefault();
        e.stopPropagation();
        closeLightbox();
      }
    });

    document.addEventListener('keydown', handleKeyDown);
  }

  function renderAccountResultBox(containerEl, insertAfterEl, accountObj, options = {}) {
    const existingBox = containerEl.querySelector('.xray-account-box');
    if (existingBox) existingBox.remove();

    const box = document.createElement('div');
    box.className = 'xray-result-box xray-account-box xray-rtl';
    box.setAttribute('dir', 'rtl');

    const idStr = (accountObj && accountObj.identity) ? accountObj.identity : '';
    const lowerId = idStr.toLowerCase();

    const isMojtaba = Boolean(
      (options.authorHandle && /^@?(mkhamenei(?:_ir)?|mojtaba_?khamenei|mojtabakhamenei)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:مجتبی\s*خامنه‌ای|موش‌?تباه|رهبر\s*مقوایی)/i.test(options.displayName)) ||
      lowerId.includes('مجتبی خامنه‌ای') ||
      lowerId.includes('موش تباه') ||
      lowerId.includes('موش‌تباه') ||
      lowerId.includes('رهبر مقوایی')
    );

    const isKhamenei = !isMojtaba && Boolean(
      (options.authorHandle && /^@?khamenei(?:_(?:fa|ir|ar|en|site|es|ru))?$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:سید\s*)?علی\s*خامنه‌ای|موش‌?علی/i.test(options.displayName)) ||
      lowerId.includes('حساب رسمی علی خامنه‌ای') ||
      lowerId.includes('موش‌علی') ||
      lowerId.includes('موش علی') ||
      lowerId.includes('دیکتاتور بهلاکت‌رسیده')
    );

    const isRaisi = !isMojtaba && !isKhamenei && Boolean(
      (options.authorHandle && /^@?(raisi(?:_com|_fa|_ir)?)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:سید\s*)?ابراهیم\s*رئیسی|قاضی\s*مرگ/i.test(options.displayName)) ||
      lowerId.includes('ابراهیم رئیسی') ||
      lowerId.includes('raisi_com') ||
      lowerId.includes('سید محرومان') ||
      lowerId.includes('قاضی مرگ') ||
      lowerId.includes('هیئت مرگ') ||
      lowerId.includes('کتلت پرنده') ||
      lowerId.includes('سقوط بالگرد')
    );

    const isLarijani = !isMojtaba && !isKhamenei && !isRaisi && Boolean(
      (options.authorHandle && /^@?(alilarijani(?:_ir)?|larijani(?:_ir)?)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:علی\s*(?:اردشیر\s*)?)?لاریجانی|ali\s*larijani/i.test(options.displayName)) ||
      lowerId.includes('علی لاریجانی') ||
      lowerId.includes('alilarijani_ir') ||
      lowerId.includes('alilarijani') ||
      lowerId.includes('لاریجانی')
    );

    const isGhalibaf = !isMojtaba && !isKhamenei && !isRaisi && !isLarijani && Boolean(
      (options.authorHandle && /^@?(mb_?ghalibaf|ghalibaf|mb_?qalibaf|qalibaf)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:محمد\s*باقر\s*)?قالیباف|ghalibaf|سردار\s*گاز[اآ]?نبری/i.test(options.displayName)) ||
      lowerId.includes('محمدباقر قالیباف') ||
      lowerId.includes('محمد باقر قالیباف') ||
      lowerId.includes('قالیباف') ||
      lowerId.includes('ghalibaf') ||
      lowerId.includes('گازانبری') ||
      lowerId.includes('سردار گازانبری')
    );

    // Specific identification of Islamic Republic embassies / regime diplomatic organs
    const isIranianRegimeEntity = !isMojtaba && !isKhamenei && !isRaisi && !isLarijani && !isGhalibaf && Boolean(
      (options.authorHandle && (
        /^@?iranin[a-z]{2,15}$/i.test(options.authorHandle) ||
        /^@?(ir|iran)_?(emb|mission|consulate)/i.test(options.authorHandle) ||
        /^@?(emb|mission)_?(ir|iran)/i.test(options.authorHandle) ||
        /^@?(mfa_ir|irimfa|iranmfa|ir_mfa|irangov|president_ir|leader_ir)/i.test(options.authorHandle)
      )) ||
      (options.displayName && /سفارت\s*(جمهوری\s*اسلامی\s*)?ایران|کنسولگری\s*(جمهوری\s*اسلامی\s*)?ایران|نمایندگی\s*دائم\s*ایران|وزارت\s*(امور\s*)?خارجه\s*(جمهوری\s*اسلامی|ایران)|embassy\s*of\s*(the\s*)?(islamic\s*republic\s*of\s*)?iran|iran(\s*|\')s?\s*embassy|consulate\s*general\s*of\s*iran/i.test(options.displayName)) ||
      lowerId.includes('سفارت جمهوری اسلامی') ||
      lowerId.includes('ارگان رسمی حکومت جمهوری اسلامی') ||
      lowerId.includes('ارگان رسمی و دیپلماتیک جمهوری اسلامی') ||
      lowerId.includes('سفارت ایران') ||
      lowerId.includes('mfa.ir') ||
      (options.model && options.model.includes('Iranian Embassy'))
    );

    // 1. Independent checks for official categories
    // STRICT: Only genuine non-regime accounts with an actual verified Grey Badge can be Government
    const isGovernment = Boolean(
      !isIranianRegimeEntity &&
      (
        Boolean(options.isGreyBadge) ||
        options.verifiedType === 'Government' ||
        lowerId.includes('حساب رسمی دولتی') ||
        lowerId.includes('تیک خاکستری') ||
        lowerId.includes('نشان تایید خاکستری') ||
        lowerId.includes('نشان رسمی خاکستری') ||
        lowerId.includes('grey checkmark') ||
        lowerId.includes('grey badge') ||
        (options.model && options.model.includes('Government'))
      )
    );

    const isGoldBadge = Boolean(
      !isGovernment && !isIranianRegimeEntity &&
      (
        Boolean(options.isGoldBadge) ||
        options.verifiedType === 'Business' ||
        lowerId.includes('تیک طلایی') ||
        lowerId.includes('نشان تایید طلایی') ||
        lowerId.includes('سازمان رسمی') ||
        lowerId.includes('شرکت رسمی') ||
        lowerId.includes('شرکت ثبت‌شده') ||
        lowerId.includes('gold checkmark') ||
        lowerId.includes('gold badge') ||
        (options.model && options.model.includes('Organization'))
      )
    );

    const isDiplomatic = Boolean(
      !isGovernment && !isIranianRegimeEntity && (
        lowerId.includes('دیپلماتیک') ||
        lowerId.includes('دولتی خارجی') ||
        lowerId.includes('وزارت امور خارجه') ||
        lowerId.includes('وزارت خارجه') ||
        lowerId.includes('israelpersian') ||
        (options.model && options.model.includes('Diplomatic'))
      )
    );

    const isBbcPersian = Boolean(
      (options.authorHandle && /^@?bbcpersian(?:_(?:tv|persian|sport|news))?$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:بی‌?بی‌?سی\s*فارسی|آیت‌?الله\s*بی‌?بی‌?سی|bbc\s*persian)/i.test(options.displayName)) ||
      lowerId.includes('بی‌بی‌سی فارسی') ||
      lowerId.includes('بی بی سی فارسی') ||
      lowerId.includes('bbcpersian') ||
      lowerId.includes('آیت‌الله بی‌بی‌سی') ||
      lowerId.includes('آیت الله بی بی سی')
    );

    const isRahmani = Boolean(
      (options.authorHandle && /^@?(rahmanitaghi|taghi_?rahmani|taghirahmani)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:تقی\s*رحمانی|taghi\s*rahmani)/i.test(options.displayName)) ||
      lowerId.includes('تقی رحمانی') ||
      lowerId.includes('rahmanitaghi') ||
      lowerId.includes('taghi rahmani')
    );

    const isMohammadi = !isRahmani && Boolean(
      (options.authorHandle && /^@?(nargesfnd|narges_mhd51|nargesmohammadi|narges_mohamadi_51|nargesmohammadi_|nargesfnd_)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:نرگس\s*محمدی|narges\s*mohammadi|بنیاد\s*نرگس)/i.test(options.displayName)) ||
      (!lowerId.includes('همسر نرگس') && !lowerId.includes('شوهر نرگس') && (
        lowerId.includes('نرگس محمدی') ||
        lowerId.includes('narges mohammadi') ||
        lowerId.includes('nargesfnd') ||
        lowerId.includes('فائزه هاشمی') ||
        lowerId.includes('سانسورچی صداهای ملی')
      ))
    );

    const isToomaj = Boolean(
      (options.authorHandle && /^@?(official_?toomaj|toomaj_?salehi|tomaj_?salehi|toomaj|tomaj)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:توماج\s*صالحی|toomaj\s*salehi|tomaj\s*salehi|توماج)/i.test(options.displayName)) ||
      lowerId.includes('توماج صالحی') ||
      lowerId.includes('toomaj') ||
      lowerId.includes('tomaj') ||
      lowerId.includes('officialtoomaj')
    );

    const isGolshifteh = Boolean(
      (options.authorHandle && /^@?(golshifteh|golshiftehfarahani|golshifteh_f|golshifteh_farahani)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:گلشیفته\s*فراهانی|golshifteh\s*farahani|گلشیفته)/i.test(options.displayName)) ||
      lowerId.includes('گلشیفته فراهانی') ||
      lowerId.includes('گلشیفته') ||
      lowerId.includes('golshifteh')
    );

    const isAlidoosti = Boolean(
      (options.authorHandle && /^@?(t_alidoosti|taraneh_alidoosti|taranehalidoosti|t_alidoostii)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:ترانه\s*علیدوستی|taraneh\s*alidoosti|ترانه)/i.test(options.displayName)) ||
      lowerId.includes('ترانه علیدوستی') ||
      lowerId.includes('علیدوستی') ||
      lowerId.includes('alidoosti')
    );

    const isAfshari = Boolean(
      (options.authorHandle && /^@?(afshari_?aku|aliafshari|ali_?afshari)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:علی\s*افشاری|ali\s*afshari)/i.test(options.displayName)) ||
      lowerId.includes('علی افشاری') ||
      lowerId.includes('aliafshari') ||
      lowerId.includes('afshari_aku')
    );

    const isBoniadi = Boolean(
      (options.authorHandle && /^@?(nazaninboniadi|nazanin_boniadi)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:نازنین\s*بنیادی|nazanin\s*boniadi)/i.test(options.displayName)) ||
      lowerId.includes('نازنین بنیادی') ||
      lowerId.includes('nazanin boniadi') ||
      lowerId.includes('boniadi')
    );

    const isEsmaeilion = Boolean(
      (options.authorHandle && /^@?(esmaeilion|hamed_?esmaeilion)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:حامد\s*اسماعیلیون|اسماعیلیون|hamed\s*esmaeilion)/i.test(options.displayName)) ||
      lowerId.includes('اسماعیلیون') ||
      lowerId.includes('esmaeilion')
    );

    const isGolroo = Boolean(
      (options.authorHandle && /^@?(mahdieh_?golroo|m_?golroo)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:مهدیه\s*گلرو|مهدیه\s*گوزو|mahdieh\s*golroo|گلرو)/i.test(options.displayName)) ||
      lowerId.includes('مهدیه گلرو') ||
      lowerId.includes('مهدیه گوزو') ||
      lowerId.includes('mahdieh_golroo') ||
      lowerId.includes('golroo')
    );

    const isModarres = Boolean(
      (options.authorHandle && /^@?(shahinmodarres|shahin_?modarres|modarresshahin)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:شاهین\s*مدرس|shahin\s*modarres)/i.test(options.displayName)) ||
      lowerId.includes('شاهین مدرس') ||
      lowerId.includes('shahinmodarres') ||
      lowerId.includes('shahin modarres')
    );

    const isSazegara = Boolean(
      (options.authorHandle && /^@?(sazegara|mohsensazegara|mohsen_?sazegara|sazegaramohsen)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:محسن\s*سازگارا|سازگارا|mohsen\s*sazegara)/i.test(options.displayName)) ||
      lowerId.includes('محسن سازگارا') ||
      lowerId.includes('سازگارا') ||
      lowerId.includes('sazegara') ||
      lowerId.includes('mohsen sazegara')
    );

    const isKohnavard = Boolean(
      (options.authorHandle && /^@?(nafisehkbbc|nafiseh_?kohnavard|nafisehkohnavard|nafisehk)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:نفیسه\s*کوهنورد|کوهنورد|ضعیفه\s*رژیم|nafiseh\s*kohnavard)/i.test(options.displayName)) ||
      lowerId.includes('نفیسه کوهنورد') ||
      lowerId.includes('کوهنورد') ||
      lowerId.includes('nafisehkbbc') ||
      lowerId.includes('nafiseh kohnavard') ||
      lowerId.includes('ضعیفه رژیم')
    );

    const isJavanmardi = Boolean(
      (options.authorHandle && /^@?(javanmardi75|javanmardi|alijavanmardi|ali_?javanmardi)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:علی\s*جوانمردی|جوانمردی|ali\s*javanmardi)/i.test(options.displayName)) ||
      lowerId.includes('علی جوانمردی') ||
      lowerId.includes('جوانمردی') ||
      lowerId.includes('javanmardi75') ||
      lowerId.includes('javanmardi') ||
      lowerId.includes('ali javanmardi')
    );

    // Negative guard: if the model is explaining what the account is NOT
    const isExplanatoryExclusion = lowerId.includes('قرار نمی‌گیرد') || lowerId.includes('وابسته نیست') || lowerId.includes('ربطی ندارد');

    // 2. Factions (Protected from false triggers when an account is government or diplomatic)
    const isFalseFlag = Boolean(
      !isGovernment && !isMohammadi && !isToomaj && !isGolshifteh && !isBoniadi && !isEsmaeilion && !isGolroo && !isRahmani && !isModarres && !isSazegara && !isKohnavard && !isJavanmardi && !isAlidoosti && !isAfshari && (
        options.isFalseFlag ||
        (options.model && options.model.includes('False-Flag')) ||
        (options.model && options.model.includes('Infiltrator')) ||
        (options.model && options.model.includes('Grifter')) ||
        lowerId.includes('نفوذی') ||
        lowerId.includes('false-flag') ||
        lowerId.includes('نقاب ملی') ||
        lowerId.includes('پادشاهی‌خواه/ملی‌گرای قلابی') ||
        lowerId.includes('پادشاهی‌خواه قلابی') ||
        lowerId.includes('پرستوی نظام') ||
        lowerId.includes('کاسب فاند') ||
        lowerId.includes('فاندبگیر')
      )
    );

    const isMek = Boolean(
      !isGovernment && !isFalseFlag && (
        options.isMekAlert ||
        (options.model && options.model.includes('MEK')) ||
        (
          !isDiplomatic && !isExplanatoryExclusion && (
            lowerId.includes('فرقه تروریستی مجاهدین') ||
            lowerId.includes('فرقه رجوی') ||
            lowerId.includes('سازمان مجاهدین خلق') ||
            /«\s*مجاهدین\s*خلق/i.test(idStr) ||
            /^[^()\n]*مجاهدین\s*خلق/i.test(idStr) ||
            /⛔.*مجاهدین/i.test(idStr) ||
            /^[^()\n]*\bMEK\b/i.test(idStr)
          )
        )
      )
    );

    const isArzeshi = Boolean(
      isIranianRegimeEntity || (
        !isGovernment && !isFalseFlag && !isDiplomatic && !isMek && !isExplanatoryExclusion && (
          lowerId.includes('ارزشی') ||
          lowerId.includes('اصولگرا') ||
          lowerId.includes('حامی سپاه') ||
          lowerId.includes('ولایی') ||
          lowerId.includes('حوثی') ||
          (lowerId.includes('حامی جمهوری اسلامی') && !lowerId.includes('ضد'))
        )
      )
    );

    const isEslahtalab = Boolean(
      !isGovernment && !isFalseFlag && !isDiplomatic && !isMek && !isArzeshi && !isJavanmardi && !isExplanatoryExclusion && (
        lowerId.includes('اصلاح‌طلب') ||
        lowerId.includes('اصلاح طلب') ||
        lowerId.includes('استمرارطلب')
      )
    );

    const isSeparatist = Boolean(
      !isGovernment && !isFalseFlag && !isDiplomatic && !isMek && !isArzeshi && !isEslahtalab && !isExplanatoryExclusion && (
        lowerId.includes('تجزیه‌طلب') ||
        lowerId.includes('تجزیه طلب') ||
        lowerId.includes('قوم‌گرا') ||
        lowerId.includes('قوم گرا') ||
        lowerId.includes('ضد تمامیت ارضی') ||
        (options.model && (options.model.includes('Separatist') || options.model.includes('تجزیه‌طلب')))
      )
    );

    const isChapi = Boolean(
      !isGovernment && !isFalseFlag && !isDiplomatic && !isMek && !isArzeshi && !isEslahtalab && !isSeparatist && !isExplanatoryExclusion && (
        lowerId.includes('چپی‌ها') ||
        lowerId.includes('چپ و چپول') ||
        lowerId.includes('چپول') ||
        lowerId.includes('جریان چپ') ||
        lowerId.includes('طیف چپ') ||
        lowerId.includes('سوسیالیست') ||
        lowerId.includes('مارکسیست') ||
        lowerId.includes('فمینیست') ||
        lowerId.includes('فمینیسم') ||
        lowerId.includes('شادی صدر') ||
        (options.model && (options.model.includes('Leftist') || options.model.includes('چپ')))
      )
    );

    const isPahlavi = Boolean(
      !isGovernment && !isFalseFlag && !isDiplomatic && !isMek && !isArzeshi && !isEslahtalab && !isSeparatist && !isChapi && !isExplanatoryExclusion && (
        lowerId.includes('پادشاهی') ||
        lowerId.includes('ملی‌گرا') ||
        lowerId.includes('پهلوی') ||
        lowerId.includes('مشروطه‌خواه') ||
        (options.model && options.model.includes('Nationalist'))
      )
    );

    const isShahbanou = Boolean(
      (options.authorHandle && /^@?(shahbanoufarah|farahpahlavi)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:شهبانو\s*)?فرح\s*پهلوی|شهبانو\s*فرح|queen\s*farah|empress\s*farah/i.test(options.displayName)) ||
      lowerId.includes('شهبانو فرح پهلوی') ||
      lowerId.includes('شهبانو فرح') ||
      lowerId.includes('مادر میهن') ||
      lowerId.includes('empress farah') ||
      lowerId.includes('queen farah')
    );

    const isVaisi = Boolean(
      (options.authorHandle && /^@?(rezavaisi|reza_vaisi|moradvaisi|morad_vaisi)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:مراد|رضا)\s*ویسی|morad\s*vaisi|reza\s*vaisi/i.test(options.displayName)) ||
      lowerId.includes('مراد ویسی') ||
      lowerId.includes('رضا ویسی') ||
      lowerId.includes('morad vaisi') ||
      lowerId.includes('rezavaisi') ||
      lowerId.includes('جان‌فداهای میهن') ||
      lowerId.includes('جانفداهای میهن') ||
      lowerId.includes('راوی جان‌فدا')
    );

    const isRonaghi = Boolean(
      (options.authorHandle && /^@?(hosseinronaghi|hossein_ronaghi|ronaghihossein|h_ronaghi)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:حسین\s*)?رونقی|hossein\s*ronaghi/i.test(options.displayName)) ||
      lowerId.includes('حسین رونقی') ||
      lowerId.includes('hossein ronaghi') ||
      lowerId.includes('hosseinronaghi') ||
      lowerId.includes('جانش در خطر است')
    );

    const isOmidDana = Boolean(
      (options.authorHandle && /^@?(omiddana19|omiddana|omid_dana|omiddana_ir)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:امید\s*دانا|omid\s*dana)/i.test(options.displayName)) ||
      lowerId.includes('امید دانا') ||
      lowerId.includes('omiddana19')
    );

    const isFakhravar = Boolean(
      (options.authorHandle && /^@?(fakhra(?:v|b)ar|amir_?fakhra(?:v|b)ar|fakhra(?:v|b)ar_amir)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:امیر\s*عباس|امیرعباس)\s*فخرآ?ور|عباس\s*جفرسون|abbas\s*jefferson/i.test(options.displayName)) ||
      lowerId.includes('امیرعباس فخرآور') ||
      lowerId.includes('امیر عباس فخرآور') ||
      lowerId.includes('عباس جفرسون') ||
      lowerId.includes('abbas jefferson')
    );

    const isMasih = Boolean(
      (options.authorHandle && /^@?(alinejadmasih|masih_?alinejad|masihalinejad)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:مسیح|معصومه)\s*علی‌?نژاد|masih\s*alinejad/i.test(options.displayName)) ||
      lowerId.includes('مسیح علی‌نژاد') ||
      lowerId.includes('مسیح علینژاد') ||
      lowerId.includes('معصومه علی‌نژاد') ||
      lowerId.includes('معصومه علینژاد') ||
      lowerId.includes('alinejadmasih') ||
      lowerId.includes('masih alinejad')
    );

    const isHomayoun = !isMasih && Boolean(
      (options.authorHandle && /^@?(homayoun2019|shahram_?homayou?n|homayou?n_?shahram|channelone_?tv)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:شهرام\s*همایون|shahram\s*homayou?n|شهرام\s*شارلاتان)/i.test(options.displayName)) ||
      lowerId.includes('شهرام همایون') ||
      lowerId.includes('shahram homayoun') ||
      lowerId.includes('شهرام شارلاتان')
    );

    const isAliEbrahimzade = Boolean(
      (options.authorHandle && /^@?(aliebrahimzade_|aliebrahimzade|ali_ebrahimzade|aliebrahimzadeh|ali_ebrahimzadeh|mir_?ali_?sabzineh?)$/i.test(options.authorHandle)) ||
      (options.displayName && /(?:علی\s*ابراهیم‌?زاده|کمدساز|میر\s*علی\s*سبزینه|میرعلی\s*سبزینه)/i.test(options.displayName)) ||
      lowerId.includes('علی ابراهیم‌زاده') ||
      lowerId.includes('علی ابراهیمزاده') ||
      lowerId.includes('کمدساز') ||
      lowerId.includes('aliebrahimzade') ||
      lowerId.includes('میرعلی سبزینه') ||
      lowerId.includes('میر علی سبزینه')
    );

    const isMedia = Boolean(
      !isGovernment && !isDiplomatic && !isBbcPersian && !isFalseFlag && !isMek && !isArzeshi && !isEslahtalab && !isSeparatist && !isChapi && !isPahlavi && !isVaisi && !isRonaghi && !isMohammadi && !isToomaj && !isGolshifteh && !isBoniadi && !isEsmaeilion && !isGolroo && !isRahmani && !isModarres && !isSazegara && !isKohnavard && !isJavanmardi && !isAlidoosti && !isAfshari && !isMasih && !isOmidDana && !isFakhravar && !isHomayoun && !isAliEbrahimzade && (
        lowerId.includes('روزنامه‌نگار مستقل') ||
        lowerId.includes('روزنامه نگار مستقل') ||
        lowerId.includes('خبرنگار مستقل') ||
        lowerId.includes('رسانه معتبر') ||
        lowerId.includes('خبرگزاری معتبر') ||
        lowerId.includes('خبرنگار') ||
        lowerId.includes('روزنامه‌نگار') ||
        lowerId.includes('روزنامه نگار') ||
        lowerId.includes('مجری')
      )
    );

    const isCitizen = Boolean(
      !isGovernment && !isDiplomatic && !isMedia && !isFalseFlag && !isMek && !isArzeshi && !isMojtaba && !isKhamenei && !isRaisi && !isLarijani && !isGhalibaf && !isEslahtalab && !isSeparatist && !isChapi && !isPahlavi && !isVaisi && !isRonaghi && !isMohammadi && !isToomaj && !isGolshifteh && !isBoniadi && !isEsmaeilion && !isGolroo && !isRahmani && !isModarres && !isSazegara && !isKohnavard && !isJavanmardi && !isAlidoosti && !isAfshari && !isMasih && !isOmidDana && !isFakhravar && !isHomayoun && !isAliEbrahimzade && (
        lowerId.includes('کاربر عادی') ||
        lowerId.includes('شهروند معمولی')
      )
    );

    let currentFactionKey = null;
    if (isShahbanou) currentFactionKey = 'farah';
    else if (isVaisi) currentFactionKey = 'vaisi';
    else if (isMojtaba) currentFactionKey = 'mojtaba';
    else if (isKhamenei) currentFactionKey = 'khamenei';
    else if (isRaisi) currentFactionKey = 'raisi';
    else if (isLarijani) currentFactionKey = 'larijani';
    else if (isGhalibaf) currentFactionKey = 'ghalibaf';
    else if (isIranianRegimeEntity) currentFactionKey = 'arzeshi';
    else if (isBbcPersian) currentFactionKey = 'bbcpersian';
    else if (isKohnavard) currentFactionKey = 'kohnavard';
    else if (isRonaghi) currentFactionKey = 'ronaghi';
    else if (isRahmani) currentFactionKey = 'rahmani';
    else if (isMohammadi) currentFactionKey = 'mohammadi';
    else if (isToomaj) currentFactionKey = 'toomaj';
    else if (isGolshifteh) currentFactionKey = 'golshifteh';
    else if (isBoniadi) currentFactionKey = 'boniadi';
    else if (isEsmaeilion) currentFactionKey = 'esmaeilion';
    else if (isGolroo) currentFactionKey = 'golroo';
    else if (isModarres) currentFactionKey = 'modarres';
    else if (isSazegara) currentFactionKey = 'sazegara';
    else if (isJavanmardi) currentFactionKey = 'javanmardi';
    else if (isAlidoosti) currentFactionKey = 'alidoosti';
    else if (isAfshari) currentFactionKey = 'afshari';
    else if (isMasih) currentFactionKey = 'alinejad';
    else if (isOmidDana) currentFactionKey = 'omiddana';
    else if (isFakhravar) currentFactionKey = 'fakhravar';
    else if (isHomayoun) currentFactionKey = 'homayoun';
    else if (isAliEbrahimzade) currentFactionKey = 'false_flag';
    else if (isGovernment) currentFactionKey = 'government';
    else if (isGoldBadge) currentFactionKey = 'organization';
    else if (isFalseFlag) currentFactionKey = 'false_flag';
    else if (isMek) currentFactionKey = 'mek';
    else if (isArzeshi) currentFactionKey = 'arzeshi';
    else if (isEslahtalab) currentFactionKey = 'eslahtalab';
    else if (isSeparatist) currentFactionKey = 'separatist';
    else if (isChapi) currentFactionKey = 'chapi';
    else if (isPahlavi) currentFactionKey = 'pahlavi';

    const currentFactionImgUrl = getFactionImageUrl(currentFactionKey);

    if (isMojtaba || isKhamenei || isRaisi || isLarijani || isGhalibaf || isBbcPersian || isKohnavard || isIranianRegimeEntity || isAfshari) {
      box.classList.add('xray-arzeshi-box');
    } else if (isGovernment) {
      box.classList.add('xray-government-box');
    } else if (isGoldBadge) {
      box.classList.add('xray-gold-box');
    } else if (isFalseFlag || isOmidDana || isFakhravar || isHomayoun || isMasih || isRonaghi || isAliEbrahimzade) {
      box.classList.add('xray-arzeshi-box');
    } else if (isMek) {
      box.classList.add('xray-mek-alert-box');
    } else if (isArzeshi) {
      box.classList.add('xray-arzeshi-box');
    } else if (isEslahtalab || isAlidoosti || isSazegara) {
      box.classList.add('xray-eslahtalab-box');
    } else if (isSeparatist || isJavanmardi) {
      box.classList.add('xray-separatist-box');
    } else if (isChapi || isMohammadi || isToomaj || isGolshifteh || isBoniadi || isEsmaeilion || isGolroo || isRahmani || isModarres) {
      box.classList.add('xray-chapi-box');
    } else if (isPahlavi || isShahbanou || isVaisi) {
      box.classList.add('xray-pahlavi-box');
    } else if (isDiplomatic) {
      box.classList.add('xray-diplomatic-box');
    } else if (isMedia) {
      box.classList.add('xray-media-box');
    }

    if (options.isError) box.classList.add('xray-error-state');
    if (options.isLoading) box.classList.add('xray-loading-state');

    // Header
    const header = document.createElement('div');
    header.className = 'xray-result-header';

    const titleArea = document.createElement('div');
    titleArea.className = 'xray-title-area';

    let headerIcon = '🕵️';
    let headerTitle = 'بازرس اصالت و گرایش سیاسی اکانت';
    let modelBadgeClass = 'xray-header-model xray-badge-account';

    if (isMojtaba) {
      headerIcon = '📦';
      headerTitle = '🔴 مجتبی خامنه‌ای «موش‌تباه / رهبر مقوایی» (جمهوری اسلامی)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isKhamenei) {
      headerIcon = '🐀';
      headerTitle = '🔴 حساب رسمی علی خامنه‌ای «موش‌علی» (دیکتاتور بهلاکت‌رسیده جمهوری اسلامی)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isRaisi) {
      headerIcon = '🚁💥';
      headerTitle = '🔴 ابراهیم رئیسی «قاضی مرگ / کتلت پرنده» (بهلاکت‌رسیده در سقوط هلیکوپتر دیزمار)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isLarijani) {
      headerIcon = '💥🎯';
      headerTitle = '🔴 علی لاریجانی (از سران رژیم / بهلاکت‌رسیده توسط ارتش اسرائیل)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isGhalibaf) {
      headerIcon = '🦀✈️';
      headerTitle = '🔴 محمدباقر قالیباف «سردار گازانبری / خلبان اسباب‌بازی» (رئیس مجلس فرمایشی رژیم)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isIranianRegimeEntity) {
      headerIcon = '🔴🏛️';
      headerTitle = '🔴🏛️ سفارت / ارگان رسمی رژیم جمهوری اسلامی (حکومتی و مدافع ولایت)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isBbcPersian) {
      headerIcon = '👳‍♂️📻';
      headerTitle = '🔴 «آیت‌الله بی‌بی‌سی» (صداوسیمای برون‌مرزی جمهوری اسلامی)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isKohnavard) {
      headerIcon = '🍉🎤';
      headerTitle = '🍉🎤 نفیسه کوهنورد «ضعیفه رژیم» (خبرنگار بی‌بی‌سی، مروج خط فلسطین و حزب‌الله)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isGovernment) {
      headerIcon = '🏛️';
      headerTitle = '🏛️ حساب رسمی دولتی / حاکمیتی (تیک خاکستری)';
      modelBadgeClass += ' xray-badge-government';
    } else if (isGoldBadge) {
      headerIcon = '🏢';
      headerTitle = '🏢 سازمان رسمی / رسانه و شرکت ثبت‌شده (تیک طلایی)';
      modelBadgeClass += ' xray-badge-gold';
    } else if (isRahmani) {
      headerIcon = '🟣☭';
      headerTitle = '🟣☭ تقی رحمانی (مذهبی‌چپول ۵۷ی / همسر نرگس محمدی و ضد پادشاهی)';
      modelBadgeClass += ' xray-badge-chapi';
    } else if (isToomaj) {
      headerIcon = '🟣🚩';
      headerTitle = '🟣 توماج صالحی (طیف چپ ۵۷ی و همسو با مجاهدین خلق)';
      modelBadgeClass += ' xray-badge-chapi';
    } else if (isMohammadi) {
      headerIcon = '🟣🤐';
      headerTitle = '🟣 نرگس محمدی (پروژه فائزه هاشمی / چپ ۵۷ی و سانسورچی دادخواهان)';
      modelBadgeClass += ' xray-badge-chapi';
    } else if (isGolshifteh) {
      headerIcon = '🟣🍉';
      headerTitle = '🟣 گلشیفته فراهانی (سلبریتی چپول، ضد پرچم شیر و خورشید و مروج خط فلسطین)';
      modelBadgeClass += ' xray-badge-chapi';
    } else if (isBoniadi) {
      headerIcon = '🟣🎭';
      headerTitle = '🟣 نازنین بنیادی (سلبریتی هالیوودی / فرقه «زن، زندگی، آزادی» و طیف چپ)';
      modelBadgeClass += ' xray-badge-chapi';
    } else if (isEsmaeilion) {
      headerIcon = '🟣🟡✈️';
      headerTitle = '🟣🟡 حامد اسماعیلیون (دادخواه پرواز / گرایش اصلاح‌طلبانه، چپ ۵۷ی و همسو با مجاهدین)';
      modelBadgeClass += ' xray-badge-chapi';
    } else if (isGolroo) {
      headerIcon = '🟣💨';
      headerTitle = '🟣💨 مهدیه گلرو «مهدیه گوزو» (فرزند روحانی، اصلاح‌طلب صادراتی و تخریب‌گر پادشاهی)';
      modelBadgeClass += ' xray-badge-chapi';
    } else if (isModarres) {
      headerIcon = '🟣🏴';
      headerTitle = '🟣🏴 شاهین مدرس (تحلیل‌گر چپول، مروج خطوط قوم‌گرایانه و ضد پادشاهی)';
      modelBadgeClass += ' xray-badge-chapi';
    } else if (isSazegara) {
      headerIcon = '🟡🪖';
      headerTitle = '🟡🪖 محسن سازگارا (بنیان‌گذار سپاه، ۵۷ی و حفظ رژیم به بهانه زیرساخت)';
      modelBadgeClass += ' xray-badge-eslahtalab';
    } else if (isJavanmardi) {
      headerIcon = '🏴✂️';
      headerTitle = '🏴✂️ علی جوانمردی (جریان تجزیه‌طلب، مروج جدایی کردستان و همکار اصلاح‌طلبان)';
      modelBadgeClass += ' xray-badge-separatist';
    } else if (isAlidoosti) {
      headerIcon = '🟡🎬';
      headerTitle = '🟡 ترانه علیدوستی (سلبریتی اصلاح‌طلب / پروژه فائزه هاشمی و اپوزیسیون مدیریت‌شده)';
      modelBadgeClass += ' xray-badge-eslahtalab';
    } else if (isAfshari) {
      headerIcon = '🔴🗣️';
      headerTitle = '🔴 علی افشاری (اصلاح‌طلب باقیمانده، ضد پهلوی و مدافع عملی خط اصولگرایان رژیم)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isFalseFlag || isOmidDana || isFakhravar || isHomayoun || isMasih || isRonaghi || isAliEbrahimzade) {
      const isAliKarimi = Boolean(
        (options.authorHandle && /^@?(alikarimi_ak8|alikarimi8|alikarimi_8|alikarimi)$/i.test(options.authorHandle)) ||
        (options.displayName && /^علی\s*کریمی$/i.test(options.displayName.trim())) ||
        lowerId.includes('علی کریمی (@alikarimi')
      );
      if (isAliEbrahimzade) {
        headerIcon = '🎭🪓';
        headerTitle = '🎭 علی ابراهیم‌زاده «کمدساز کیونی» (نفوذی مظنون، پرونده‌ساز امنیتی و ضد پهلوی)';
      } else if (isRonaghi) {
        headerIcon = '🎭⚠️';
        headerTitle = '🎭 حسین رونقی (سوپاپ اطمینان اصلاح‌طلبان / پروژه انحراف قیام‌ها)';
      } else if (isMasih) {
        headerIcon = '🕊️💵';
        headerTitle = '🕊️💵 معصومه (مسیح) علی‌نژاد (پرستوی نظام / فاندبگیر و کاسب خون)';
      } else if (isFakhravar) {
        headerIcon = '🤡📜';
        headerTitle = '🤡 امیرعباس فخرآور «عباس جفرسون» (لاف‌زن و دلقک سیاسی)';
      } else if (isHomayoun) {
        headerIcon = '🎪🏴';
        headerTitle = '🎪 شهرام همایون «شهرام شارلاتان» (فسیل ۵۷ی / دکان‌دار پرچم‌فروش)';
      } else if (isOmidDana) {
        headerIcon = '🎭';
        headerTitle = '🎭 امید دانا (پادشاهی‌خواه قلابی / پروژه نفوذ و تفرقه‌افکنی)';
      } else if (isAliKarimi) {
        headerIcon = '🎭';
        headerTitle = '🎭 علی کریمی (پادشاهی‌خواه قلابی / ضد شاهزاده رضا پهلوی)';
      } else {
        headerIcon = '🎭';
        headerTitle = 'پادشاهی‌خواه/ملی‌گرای قلابی (ضد پهلوی)';
      }
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isMek) {
      headerIcon = '🚨';
      headerTitle = 'فرقه تروریستی مجاهدین خلق (MEK)';
      modelBadgeClass += ' xray-badge-mek';
    } else if (isArzeshi) {
      headerIcon = '🔴';
      headerTitle = 'حامی جمهوری اسلامی (ارزشی و ولایی)';
      modelBadgeClass += ' xray-badge-arzeshi';
    } else if (isEslahtalab) {
      headerIcon = '🟡';
      headerTitle = 'حامی رژیم (اصلاح‌طلب و استمرارطلب)';
      modelBadgeClass += ' xray-badge-eslahtalab';
    } else if (isSeparatist) {
      headerIcon = '🏴';
      headerTitle = 'جریان تجزیه‌طلب و ضد تمامیت ارضی';
      modelBadgeClass += ' xray-badge-separatist';
    } else if (isChapi) {
      headerIcon = '🟣';
      headerTitle = 'جریان چپ و چپول (مخالف پادشاهی)';
      modelBadgeClass += ' xray-badge-chapi';
    } else if (isVaisi) {
      headerIcon = '🦁🟢';
      headerTitle = '🦁🟢 مراد ویسی (روزنامه‌نگار میهن‌دوست و راوی جان‌فداهای میهن)';
      modelBadgeClass += ' xray-badge-pahlavi';
    } else if (isPahlavi || isShahbanou) {
      const isRezaPahlavi = lowerId.includes('رهبر اپوزیسیون') ||
        (options.authorHandle && /pahlavireza|reza_pahlavi/i.test(options.authorHandle));
      const isPahlaviComms = lowerId.includes('دفتر مطبوعاتی') || lowerId.includes('دفتر رسانه‌ای') ||
        (options.authorHandle && /pahlavicomms|pahlavi_comms/i.test(options.authorHandle));

      if (isShahbanou) {
        headerIcon = '👑🌸';
        headerTitle = '👑 علیاحضرت شهبانو فرح پهلوی (مادر میهن و نماد تاریخی پادشاهی ایران)';
      } else if (isRezaPahlavi) {
        headerIcon = '🦁☀️';
        headerTitle = '🦁☀️👑 رهبر اپوزیسیون و انقلاب ملی ایران (شاهزاده رضا پهلوی)';
      } else if (isPahlaviComms) {
        headerIcon = '🦁☀️';
        headerTitle = '🦁☀️🏛️ دفتر مطبوعاتی شاهزاده رضا پهلوی (اطلاع‌رسانی رسمی و فکت‌چک)';
      } else {
        headerIcon = '🦁';
        headerTitle = 'ملی‌گرا و دموکرات (همراه شاهزاده رضا پهلوی)';
      }
      modelBadgeClass += ' xray-badge-pahlavi';
    } else if (isDiplomatic) {
      headerIcon = '🌐';
      headerTitle = 'نهاد رسمی دیپلماتیک و دولتی خارجی';
      modelBadgeClass += ' xray-badge-diplomatic';
    } else if (isMedia) {
      headerIcon = '🟢';
      headerTitle = 'روزنامه‌نگار مستقل و رسانه معتبر';
      modelBadgeClass += ' xray-badge-media';
    }

    const cleanModelTag = formatModelTag(options.model);

    const headerAvatarHtml = currentFactionImgUrl
      ? `<img src="${currentFactionImgUrl}" class="xray-faction-avatar-header" alt="آیکون جریان" title="${headerTitle}" />`
      : `<span class="xray-header-icon">${headerIcon}</span>`;

    titleArea.innerHTML = `
      ${headerAvatarHtml}
      <span class="xray-header-title">${headerTitle}</span>
      ${cleanModelTag ? `<span class="${modelBadgeClass}">${cleanModelTag}</span>` : ''}
    `;

    const actionsArea = document.createElement('div');
    actionsArea.className = 'xray-header-actions';

    // Resolve restId and any previous handles (Handle-Change Detector)
    const cleanTargetH = (options.authorHandle || '').replace('@', '').toLowerCase();
    const normTargetH = normalizeHandleKey(cleanTargetH);
    const localRec = cleanTargetH ? accountHistoryMemory.get(cleanTargetH) : null;
    const resolvedRestId = options.restId || (localRec && localRec.restId) || handleToRestId.get(normTargetH) || '';
    const restMapEntry = resolvedRestId ? badgeDirectory.restIdMap[resolvedRestId] : null;
    const detectedPrevHandles = Array.from(new Set([
      ...(Array.isArray(options.previousHandles) ? options.previousHandles : []),
      ...(Array.isArray(restMapEntry?.previousHandles) ? restMapEntry.previousHandles : []),
      ...(Array.isArray(localRec?.previousHandles) ? localRec.previousHandles : [])
    ])).filter(h => h && normalizeHandleKey(h) !== normTargetH);

    // Header Action Buttons: 📸 Copy as Image, 👍 Feedback, 🏷️ Minimal Faction Dropdown
    if (!options.isLoading && !options.isError && accountObj) {
      // 1. Copy Analysis Card as PNG Image to Clipboard (📸)
      const imgCopyBtn = document.createElement('button');
      imgCopyBtn.type = 'button';
      imgCopyBtn.className = 'xray-icon-btn xray-img-copy-btn';
      imgCopyBtn.title = 'کپی کارت تحلیل به صورت تصویر در کلیپ‌بورد (الصاق در ریپلای با Ctrl+V / Cmd+V)';
      imgCopyBtn.innerHTML = '📸';
      imgCopyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (imgCopyBtn.disabled) return;
        imgCopyBtn.disabled = true;
        imgCopyBtn.innerHTML = '⏳';
        try {
          const blob = await renderAnalysisCardToPngBlob({
            headerTitle,
            headerIcon,
            avatarUrl: currentFactionImgUrl,
            authorHandle: options.authorHandle || '',
            displayName: options.displayName || '',
            factionKey: currentFactionKey,
            accountObj,
            previousHandles: detectedPrevHandles,
            restId: resolvedRestId
          });
          if (blob && navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            imgCopyBtn.innerHTML = '✓ عکس کپی شد';
            imgCopyBtn.classList.add('xray-btn-success');
          } else if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `xray-${cleanTargetH || 'account'}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 3000);
            imgCopyBtn.innerHTML = '✓ ذخیره شد';
            imgCopyBtn.classList.add('xray-btn-success');
          }
        } catch (err) {
          console.warn('[X-Ray] Image copy error:', err);
          imgCopyBtn.innerHTML = '⚠️';
        } finally {
          setTimeout(() => {
            imgCopyBtn.disabled = false;
            imgCopyBtn.innerHTML = '📸';
            imgCopyBtn.classList.remove('xray-btn-success');
          }, 2200);
        }
      });
      actionsArea.appendChild(imgCopyBtn);

      if (options.authorHandle) {
        // 2. Minimal Faction Dropdown Menu Toggle (🏷️)
        const dropdownWrap = document.createElement('div');
        dropdownWrap.className = 'xray-dropdown-wrap';

        const dropdownBtn = document.createElement('button');
        dropdownBtn.type = 'button';
        dropdownBtn.className = 'xray-icon-btn xray-dropdown-toggle-btn';
        dropdownBtn.title = `تعیین یا اصلاح گروه اکانت ${options.authorHandle}`;
        dropdownBtn.innerHTML = '🏷️';

        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'xray-faction-dropdown-menu';
        dropdownMenu.innerHTML = `
          <div class="xray-dropdown-header">📌 تعیین گروه ${options.authorHandle}</div>
          <button type="button" data-faction="pahlavi" class="xray-dropdown-item">🦁👑 ملی‌گرا / همراه پهلوی</button>
          <button type="button" data-faction="chapi" class="xray-dropdown-item">🟣 چپ / چپول</button>
          <button type="button" data-faction="mek" class="xray-dropdown-item">🚨 مجاهدین خلق (MEK)</button>
          <button type="button" data-faction="arzeshi" class="xray-dropdown-item">🔴 ارزشی / سایبری رژیم</button>
          <button type="button" data-faction="eslahtalab" class="xray-dropdown-item">🟡 اصلاح‌طلب / استمرارطلب</button>
          <button type="button" data-faction="separatist" class="xray-dropdown-item">🏴 تجزیه‌طلب</button>
          <button type="button" data-faction="false_flag" class="xray-dropdown-item">🎭 پادشاهی‌خواه قلابی / نفوذی</button>
          <button type="button" data-faction="media" class="xray-dropdown-item">🟢 رسانه / خبرنگار</button>
          <div class="xray-dropdown-divider"></div>
          <button type="button" data-faction="clear" class="xray-dropdown-item xray-dropdown-reset">🔄 بازگشت به تشخیص هوشمند</button>
        `;

        dropdownBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropdownMenu.classList.toggle('xray-dropdown-open');
        });

        dropdownMenu.querySelectorAll('.xray-dropdown-item').forEach((itemBtn) => {
          itemBtn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const selectedFaction = itemBtn.getAttribute('data-faction');
            dropdownMenu.classList.remove('xray-dropdown-open');
            dropdownBtn.innerHTML = '⏳';
            try {
              const res = await chrome.runtime.sendMessage({
                action: 'SET_CUSTOM_ACCOUNT_ALIGNMENT',
                username: options.authorHandle,
                displayName: options.displayName || options.authorHandle,
                faction: selectedFaction,
                restId: resolvedRestId
              });
              if (res && res.success && res.analysis) {
                badgeDirectory.handleMap[normTargetH] = {
                  faction: selectedFaction,
                  handle: options.authorHandle,
                  restId: resolvedRestId,
                  isCustom: true
                };
                if (resolvedRestId && badgeDirectory.restIdMap[resolvedRestId]) {
                  badgeDirectory.restIdMap[resolvedRestId].faction = selectedFaction;
                }
                refreshAllVisibleMiniBadges();
                const updatedParsed = parseAccountAnalysis(res.analysis);
                renderAccountResultBox(containerEl, insertAfterEl, updatedParsed, {
                  ...options,
                  model: res.model,
                  isMekAlert: res.isMekAlert,
                  isFalseFlag: res.isFalseFlag,
                  restId: resolvedRestId,
                  previousHandles: detectedPrevHandles
                });
              } else if (res && res.cleared) {
                delete badgeDirectory.handleMap[normTargetH];
                refreshAllVisibleMiniBadges();
                dropdownBtn.innerHTML = '✓';
                setTimeout(() => { dropdownBtn.innerHTML = '🏷️'; }, 1500);
              }
            } catch (err) {
              console.warn('[X-Ray] Dropdown faction set error:', err);
              dropdownBtn.innerHTML = '🏷️';
            }
          });
        });

        dropdownWrap.appendChild(dropdownBtn);
        dropdownWrap.appendChild(dropdownMenu);
        actionsArea.appendChild(dropdownWrap);

        // Close dropdown when clicking anywhere inside the box or document
        box.addEventListener('click', () => {
          dropdownMenu.classList.remove('xray-dropdown-open');
        });
      }
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'xray-icon-btn xray-close-btn';
    closeBtn.title = 'بستن پنجره';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.classList.add('xray-fade-out');
      setTimeout(() => {
        box.remove();
        resetTriggerButton(containerEl);
      }, 200);
    });

    actionsArea.appendChild(closeBtn);
    header.appendChild(titleArea);
    header.appendChild(actionsArea);
    box.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'xray-result-body';

    if (options.isLoading) {
      const authorText = options.authorHandle ? `اکانت ${options.authorHandle}` : 'اکانت';
      body.innerHTML = `
        <div class="xray-scanner-container">
          <div class="xray-scanner-beam xray-beam-amber"></div>
          <div class="xray-loading-text" style="color: #f59e0b;">
            <span class="xray-pulse-dot" style="background: #f59e0b; box-shadow: 0 0 8px #f59e0b;"></span>
            در حال کالبدشکافی شناسنامه، گراف تعاملات، تاریخ ساخت و سابقه ${authorText}...
          </div>
        </div>
      `;
    } else if (options.isError) {
      body.innerHTML = `
        <div class="xray-error-notice">
          <div class="xray-error-icon">⚠️</div>
          <div class="xray-error-content">
            <div class="xray-error-title">خطا در بررسی اکانت</div>
            <div class="xray-error-desc">${formatMarkdown(options.errorMessage || 'بررسی هویت اکانت با مشکل مواجه شد.')}</div>
          </div>
        </div>
      `;
    } else if (accountObj) {
      if (accountObj.raw) {
        body.innerHTML = `<div class="xray-raw-analysis">${formatMarkdown(accountObj.raw)}</div>`;
      } else {
        // Evaluate risk level for color accents
        const probText = accountObj.probability || '';
        let riskClass = 'xray-risk-med';
        if (isGovernment) {
          riskClass = 'xray-risk-low xray-badge-government';
        } else if (isFalseFlag) {
          riskClass = 'xray-risk-high xray-badge-arzeshi';
        } else if (isMek) {
          riskClass = 'xray-risk-high xray-badge-mek';
        } else if (isArzeshi) {
          riskClass = 'xray-risk-high xray-badge-arzeshi';
        } else if (isSeparatist) {
          riskClass = 'xray-risk-high xray-badge-separatist';
        } else if (isEslahtalab) {
          riskClass = 'xray-risk-med xray-badge-eslahtalab';
        } else if (isChapi) {
          riskClass = 'xray-risk-med xray-badge-chapi';
        } else if (isPahlavi || isShahbanou || isVaisi || isDiplomatic || isMedia) {
          riskClass = 'xray-risk-low' + (isDiplomatic ? ' xray-badge-diplomatic' : '');
        } else if (
          probText.includes('۰') ||
          probText.includes('0%') ||
          probText.includes('صفر') ||
          probText.includes('کم') ||
          probText.includes('پایین') ||
          probText.includes('۱۰') ||
          probText.includes('۲۰') ||
          probText.includes('10%') ||
          probText.includes('5%') ||
          probText.includes('۵٪') ||
          probText.includes('واقعی')
        ) {
          riskClass = 'xray-risk-low';
        } else if (
          probText.includes('بالا') ||
          probText.includes('خیلی') ||
          probText.includes('۸') ||
          probText.includes('۹') ||
          probText.includes('100') ||
          probText.includes('8') ||
          probText.includes('9') ||
          probText.includes('۷') ||
          probText.includes('7') ||
          probText.includes('هفتاد')
        ) {
          riskClass = 'xray-risk-high';
        }

        let identityBadge = '🏷️ گرایش و هویت سیاسی';
        let probBadge = '📊 ریسک و احتمال فیک';
        let flagsBadge = '🚩 شواهد و سرنخ‌ها';
        let verdictBadge = '💡 حکم نهایی X-Ray';

        if (isMojtaba) {
          identityBadge = '🔴📦 مجتبی خامنه‌ای «موش‌تباه / رهبر مقوایی»';
          probBadge = '📊 شاخص استبداد موروثی: ۱۰۰٪ حکومتی';
          flagsBadge = '🚩 مهره سرکوب، ترور و خفقان امنیتی';
          verdictBadge = '⛔ حکم قطعی X-Ray: رهبر مقوایی بهلاکت‌رسیده';
        } else if (isKhamenei) {
          identityBadge = '🔴🐀 علی خامنه‌ای معروف به «موش‌علی»';
          probBadge = '📊 شاخص استبداد و تروریسم: ۱۰۰٪ حکومتی';
          flagsBadge = '🚩 کشتار بیش از ۴۵,۰۰۰ جان‌فدا و هلاکت ۲۰ ثانیه‌ای';
          verdictBadge = '⛔ حکم قطعی X-Ray: کتلت‌شده در آغاز جنگ';
        } else if (isRaisi) {
          identityBadge = '🔴🚁 ابراهیم رئیسی «قاضی مرگ / هلی‌کوپتری»';
          probBadge = '📊 عضو هیئت مرگ ۶۷: ۱۰۰٪ جلاد بهلاکت‌رسیده';
          flagsBadge = '🚩 سقوط با هلی‌کوپتر در جنگل‌های شمال / خوراک خرس و گرگ‌های دیزمار';
          verdictBadge = '⛔ حکم قطعی X-Ray: کتلت هوایی؛ اکانت مرده در دست بنیاد رژیم';
        } else if (isLarijani) {
          identityBadge = '🔴💥 علی لاریجانی «مهره ۴ دهه غارت و سرکوب»';
          probBadge = '📊 وابستگی حاکمیتی: ۱۰۰٪ مهره ارشد بهلاکت‌رسیده';
          flagsBadge = '🚩 رجزخوانی در جنگ و هلاکت قطعی توسط ارتش اسرائیل';
          verdictBadge = '⛔ حکم قطعی X-Ray: ترتیبش داده شد؛ توهم رهبری به گور رفت!';
        } else if (isGhalibaf) {
          identityBadge = '🔴🦀✈️ محمدباقر قالیباف «سردار گازانبری / خلبان اسباب‌بازی»';
          probBadge = '📊 کارنامه سرکوب، دزدی و شوآف: ۱۰۰٪ حکومتی';
          flagsBadge = '🚩 حمله گازانبری به کوی دانشگاه، غارت شهرداری، شوآف خلبانی و توهم در جنگ';
          verdictBadge = '⛔ حکم قطعی X-Ray: در نوبت کتلت‌شدن؛ بایکوت کامل!';
        } else if (isIranianRegimeEntity) {
          identityBadge = '🔴🏛️ ارگان رسمی و دیپلماتیک جمهوری اسلامی (تیک تجاری/آبی)';
          probBadge = '📊 وابستگی حاکمیتی: ۱۰۰٪ رسمی رژیم (تبلیغ ولایت فقیه)';
          flagsBadge = '🚩 مأموریت توجیه جنایات، تروریسم دیپلماتیک و ترویج خط علی/مجتبی خامنه‌ای';
          verdictBadge = '⛔ حکم قطعی X-Ray: ارگان تبلیغاتی رژیم اشغالگر اسلامی؛ بایکوت کامل!';
        } else if (isBbcPersian) {
          identityBadge = '🔴👳‍♂️ بی‌بی‌سی فارسی («آیت‌الله بی‌بی‌سی»)';
          probBadge = '📊 شاخص سفیدشویی و خط صادراتی: ۱۰۰٪';
          flagsBadge = '🚩 فتنه ۵۷، تطهیر جنایات رژیم، بایکوت پهلوی و خط فلسطین';
          verdictBadge = '⛔ حکم قطعی X-Ray: صداوسیمای رژیم در لندن؛ بایکوت کامل!';
        } else if (isKohnavard) {
          identityBadge = '🍉🎤 نفیسه کوهنورد «ضعیفه رژیم» (خبرنگار بی‌بی‌سی فارسی و مروج خط مقاومت)';
          probBadge = '📊 شاخص سوگیری به نفع رژیم و مقاومت: ۹۵٪ (پروپاگاندا / حزب‌الله)';
          flagsBadge = '🚩 حمایت از خط فلسطین، سفیدشویی قدرت حزب‌الله، گزارش‌های جهت‌دار به نفع رژیم، سابقه همشهری و برچسب ضعیفه رژیم';
          verdictBadge = '🚨 هشدار مهره رسانه‌ای مقاومت: کارکرد در خدمت توجیه جنایات رژیم و حزب‌الله؛ بایکوت کامل!';
        } else if (isGovernment) {
          identityBadge = '🏛️ ماهیت: حساب رسمی دولتی (تیک خاکستری)';
          probBadge = '📊 احتمال فیک بودن: ۰٪';
          flagsBadge = '🚩 شواهد نشان خاکستری حاکمیتی';
          verdictBadge = '🏛️ تاییدیه رسمی حاکمیتی';
        } else if (isRahmani) {
          identityBadge = '🟣☭ تقی رحمانی (مذهبی‌چپول ۵۷ی، نماد داس و چکش و ضد ملی‌گرا)';
          probBadge = '📊 شاخص عدم همراهی با جنبش ملی: ۹۵٪ (ملی‌مذهبی / ضد پهلوی)';
          flagsBadge = '🚩 مذهبی‌چپول ۵۷ی، متون شلخته و بی‌سوادانه، ضدیت شدید با پادشاهی مشروطه و همسر نرگس محمدی';
          verdictBadge = '🚨 هشدار چهره مذهبی-چپول و تفرقه‌افکن: فاقد هویت ملی و در تقابل با پادشاهی؛ بایکوت کامل!';
        } else if (isToomaj) {
          identityBadge = '🟣🚩 توماج صالحی (طیف چپ ۵۷ی و همسو با مجاهدین خلق)';
          probBadge = '📊 شاخص ریسک و انحراف: ۹۵٪ (چپ ۵۷ی / گرایش به مجاهدین خلق)';
          flagsBadge = '🚩 حمله به اپوزیسیون به عنوان فیک، مخالفت با ضربه به زیرساخت‌ها، اتهام پروژه امنیتی و ضدیت با پادشاهی';
          verdictBadge = '🚨 هشدار چهره چپ و تفرقه‌افکن: فاقد هرگونه هویت ملی‌گرایی یا پادشاهی؛ هوشیاری کامل!';
        } else if (isMohammadi) {
          identityBadge = '🟣🤐 چهره چپ ۵۷ی، پروژه فائزه هاشمی و سانسورچی صداهای ملی';
          probBadge = '📊 شاخص فریب و همسویی: ۹۵٪ (چپ ۵۷ی، خط مجاهدین خلق و سانسور)';
          flagsBadge = '🚩 سانسور کامنت‌های خانواده‌های دادخواه، حذف #جاویدشاه و پیوند با هاشمی';
          verdictBadge = '🚨 هشدار چهره چپ ۵۷ی: ریاکاری در آزادی بیان و سانسور دادخواهان؛ بایکوت کامل!';
        } else if (isGolshifteh) {
          identityBadge = '🟣🍉 گلشیفته فراهانی (سلبریتی چپول، ضد پرچم شیر و خورشید و مروج خط فلسطین)';
          probBadge = '📊 شاخص تقابل با هویت ملی: ۹۵٪ (چپولیسم سینمایی / مروج فلسطین)';
          flagsBadge = '🚩 موضع‌گیری علیه پرچم شیر و خورشید، سکوت در کشتار ۴۵ هزار هموطن در ۱۸ و ۱۹ دی، ضدیت با پادشاهی و تمرکز بر فلسطین';
          verdictBadge = '🚨 هشدار چهره چپول و ضد پرچم ملی: فاقد هویت ملی‌گرایی، مروج خط فلسطین و تفرقه‌افکن؛ بایکوت کامل!';
        } else if (isBoniadi) {
          identityBadge = '🟣🎭 نازنین بنیادی (سلبریتی هالیوودی، فرقه «زن، زندگی، آزادی» و طیف چپ)';
          probBadge = '📊 شاخص عدم همراهی با جنبش ملی: ۹۵٪ (چپ نو / WLF)';
          flagsBadge = '🚩 سلبریتی تبلیغاتی، دوری از پرچم شیر و خورشید، فاصله از پادشاهی مشروطه و همسویی با خطوط چپ';
          verdictBadge = '🚨 هشدار چهره چپول و سلبریتی فرقه‌ای: فاقد هویت ملی‌گرایی؛ هوشیاری کامل!';
        } else if (isEsmaeilion) {
          identityBadge = '🟣🟡 حامد اسماعیلیون (دادخواه پرواز، گرایش اصلاح‌طلبانه، چپ ۵۷ی و همسو با خطوط مجاهدین)';
          probBadge = '📊 شاخص عدم همراهی با جنبش ملی: ۹۵٪ (اصلاح‌طلب / چپ / MEK)';
          flagsBadge = '🚩 دادخواهی گزینشی، گرایش اصلاح‌طلبانه و چپ، همسویی با خطوط مجاهدین، انحلال ائتلاف و تقابل با پادشاهی';
          verdictBadge = '🚨 هشدار چهره اصلاح‌طلب و چپول: فاقد هویت ملی‌گرایی اصیل و در تضاد با پادشاهی مشروطه!';
        } else if (isGolroo) {
          identityBadge = '🟣💨 مهدیه گلرو ملقب به «مهدیه گوزو» (فرزند روحانی، اصلاح‌طلب و تخریب‌گر پادشاهی)';
          probBadge = '📊 شاخص تفرقه‌افکنی و استمرارطلبی: ۹۵٪ (اصلاح‌طلب / ضد پهلوی)';
          flagsBadge = '🚩 حمله به پادشاهی‌خواهان با برچسب فاشیسم، فرزند روحانی (محمدکاظم گلرو)، دوقطبی‌سازی اپوزیسیون و سوپاپ رژیم';
          verdictBadge = '🚨 هشدار مهره تفرقه‌افکن: در خدمت جنگ روانی علیه انقلاب ملی ایران؛ بایکوت کامل!';
        } else if (isModarres) {
          identityBadge = '🟣🏴 شاهین مدرس (چپ شبه‌روشنفکر، تضعیف مفهوم ملت ایران و ضد پهلوی)';
          probBadge = '📊 شاخص انحراف و تقابل با منافع ملی: ۹۰٪ (چپ / قوم‌گرا)';
          flagsBadge = '🚩 سفیدشویی جنایات رژیم با برچسب خطای اداری، ترویج «هم‌سرنوشتی» تجزیه‌طلبانه، تخریب شاهزاده رضا پهلوی';
          verdictBadge = '🚨 هشدار چهره چپول و ضد تمامیت ارضی: فاقد هویت ملی‌گرایی اصیل؛ بایکوت و عدم استناد!';
        } else if (isSazegara) {
          identityBadge = '🟡🪖 محسن سازگارا (بنیان‌گذار سپاه پاسداران، ۵۷ی و حامی بقای رژیم)';
          probBadge = '📊 شاخص استمرارطلبی و ممانعت از سرنگونی: ۹۵٪ (۵۷ی / سوپاپ نظام)';
          flagsBadge = '🚩 بنیان‌گذاری سپاه، پروژه «نه به جنگ»، بهانه‌تراشی زیرساخت جهت جلوگیری از فروپاشی، دفاع از رژیم در بزنگاه‌ها';
          verdictBadge = '🚨 هشدار بانی سپاه و مانع سرنگونی: اپوزیسیون قلابی و مدافع رژیم؛ بایکوت و عدم اعتماد!';
        } else if (isJavanmardi) {
          identityBadge = '🏴✂️ علی جوانمردی (چهره تجزیه‌طلب قومی، همکار اصلاح‌طلبان و مروج جدایی کردستان)';
          probBadge = '📊 شاخص تجزیه‌طلبی و تقابل با تمامیت ارضی: ۹۵٪ (تجزیه‌طلب / ضد ایران یکپارچه)';
          flagsBadge = '🚩 تلاش برای جدایی کردستان از ایران، پروژه‌بگیری قومی، همسویی با خطوط اصلاح‌طلبان و تخریب جنبش ملی';
          verdictBadge = '🚨 هشدار ضدیت با تمامیت ارضی: مروج تجزیه ایران؛ بایکوت کامل و افشای دروغ‌پردازی‌ها!';
        } else if (isAlidoosti) {
          identityBadge = '🟡🎬 ترانه علیدوستی (سلبریتی اصلاح‌طلب، مبارزه فیک و پروژه فائزه هاشمی)';
          probBadge = '📊 شاخص اپوزیسیون ساختگی و فریب: ۹۰٪ (متصل به اصلاح‌طلبان و حلقه هاشمی)';
          flagsBadge = '🚩 اتهام مبارزه فیک و سلبریتی‌گری، پروژه رسانه‌ای (مستندسازی بی‌بی‌سی)، پیوند با فائزه هاشمی و هدایت کنترل‌شده اعتراضات';
          verdictBadge = '🚨 هشدار سوپاپ اصلاح‌طلبان: اپوزیسیون مدیریت‌شده و مبارزه نمایشی؛ فاقد اصالت براندازی راستین!';
        } else if (isAfshari) {
          identityBadge = '🔴🗣️ علی افشاری (اصلاح‌طلب باقیمانده، خط اصولگرای رژیم و تخریب پادشاهی)';
          probBadge = '📊 شاخص تقابل با جریان ملی و همسویی با خطوط رژیم: ۹۵٪';
          flagsBadge = '🚩 حملات هیستریک به پهلوی، فراخوان «پاکسازی خائنان»، سکوت در کشتار ۱۸ و ۱۹ دی، تئوریزه کردن «انسجام ملی» به نفع رژیم در جنگ';
          verdictBadge = '🚨 هشدار مهره تفرقه‌افکن: در عمل در جهت اصولگرایان جمهوری اسلامی و تثبیت رژیم؛ بایکوت کامل!';
        } else if (isFalseFlag || isOmidDana || isFakhravar || isHomayoun || isMasih || isRonaghi || isAliEbrahimzade) {
          const isAliKarimi = Boolean(
            (options.authorHandle && /^@?(alikarimi_ak8|alikarimi8|alikarimi_8|alikarimi)$/i.test(options.authorHandle)) ||
            (options.displayName && /^علی\s*کریمی$/i.test(options.displayName.trim())) ||
            lowerId.includes('علی کریمی (@alikarimi')
          );
          if (isAliEbrahimzade) {
            identityBadge = '🎭 علی ابراهیم‌زاده «کمدساز» (نفوذی، پرونده‌ساز امنیتی و میرعلی سبزینه سابق)';
            probBadge = '📊 شاخص نفوذ و فریب: ۹۸٪ (پرونده‌ساز / مامور نفوذی)';
            flagsBadge = '🚩 پرونده‌سازی علیه مبارزان (محبوبه رضایی)، فتوشاپ موهن جانفدایان میهن در آبان، تخریب پهلوی و سابقه عکس خامنه‌ای';
            verdictBadge = '🚨 هشدار امنیتی نفوذ: پرونده‌ساز و مهره تفرقه‌افکن؛ بایکوت و بلاک کامل!';
          } else if (isRonaghi) {
            identityBadge = '🎭 مهره انحراف افکار عمومی، سوپاپ اصلاح‌طلبان و شارلاتانیسم';
            probBadge = '📊 شاخص فریب و انحراف: ۹۵٪ (پروژه جانش در خطر است و شوآف)';
            flagsBadge = '🚩 حاشیه‌سازی در بزنگاه قیام‌ها، تناقض‌گویی، نقش‌بازی و تخریب مبارزان';
            verdictBadge = '🚨 هشدار امنیتی فریب: سوپاپ اطمینان رژیم برای انحراف خیزش‌ها؛ بایکوت کامل!';
          } else if (isMasih) {
            identityBadge = '🕊️💵 پرستوی صادراتی نظام، اصلاح‌طلب سابق و کاسب فاند';
            probBadge = '📊 شاخص فریب و انحراف: ۹۸٪ (جنسیتی‌کردن نبرد و تجارت از خون)';
            flagsBadge = '🚩 باور به اصلاحات، فاندبگیری در آمریکا، تقلیل براندازی و دکان‌داری';
            verdictBadge = '🚨 هشدار امنیتی فریب: سوپاپ اطمینان و کاسب رنج مردم؛ بایکوت کامل!';
          } else if (isFakhravar) {
            identityBadge = '🤡 دلقک و لاف‌زن سیاسی ملقب به «عباس جفرسون»';
            probBadge = '📊 شاخص لاف‌زنی و توهم: ۹۸٪ (جعل گلف با سیا و مکالمه ترامپ)';
            flagsBadge = '🚩 قانون اساسی خیالی، چاخان‌های نجومی و عناد با پهلوی';
            verdictBadge = '🚨 هشدار سیرک سیاسی: مضحکه افکار عمومی؛ بایکوت کامل!';
          } else if (isHomayoun) {
            identityBadge = '🎪 فسیل ۵۷ی، دکان‌دار سیاسی و ملقب به «شهرام شارلاتان»';
            probBadge = '📊 شاخص تفرقه‌افکنی و ماله‌کشی: ۹۸٪ (ضد پهلوی و تطهیر سپاه)';
            flagsBadge = '🚩 دکان پرچم‌فروشی، کینه مصدقی علیه پهلوی و تطهیر تروریست‌های سپاه';
            verdictBadge = '🚨 هشدار شارلاتانیسم: دکان‌دار سیاسی و ارتجاع ۵۷؛ بایکوت کامل!';
          } else if (isOmidDana) {
            identityBadge = '🎭 مهره نفوذی، تطهیرکننده پیشین رژیم و مدعی قلابی پادشاهی';
            probBadge = '📊 شاخص تفرقه‌افکنی: ۹۸٪ (پروژه نفوذ و عملیات فریب)';
            flagsBadge = '🚩 مقایسه خامنه‌ای با کوروش، تخریب پهلوی و ایجاد انشقاق';
            verdictBadge = '🚨 هشدار امنیتی فریب: مهره سوخته جنگ روانی رژیم؛ بلاک کامل!';
          } else if (isAliKarimi) {
            identityBadge = '🎭 مدعی پادشاهی‌خواهی و مخالف شاهزاده رضا پهلوی';
            probBadge = '📊 شاخص تفرقه‌افکنی: ۹۵٪ (عملیات فریب)';
            flagsBadge = '🚩 تقابل با شاهزاده رضا پهلوی و شکستن اتحاد ملی';
            verdictBadge = '🚨 هشدار فریب: تقابل علنی با انقلاب ملی ایران';
          } else {
            identityBadge = '🎭 هشدار نقاب نفوذی (ضد پهلوی)';
            probBadge = '📊 شاخص فریب و هدایت پنهان';
            flagsBadge = '🚩 شواهد تخریب در پوشش پادشاهی';
            verdictBadge = '🚨 هشدار امنیتی (عملیات فریب)';
          }
        } else if (isMek) {
          identityBadge = '🚨 هویت: فرقه مجاهدین (MEK)';
          probBadge = '📊 ارزیابی ریسک: قطعی';
          flagsBadge = '🚩 سابقه ترور و ارتش سایبری';
          verdictBadge = '🚨 هشدار امنیتی X-Ray';
        } else if (isArzeshi) {
          identityBadge = '🔴 گرایش: حامی رژیم (ارزشی)';
          probBadge = '📊 شاخص همسویی و پروپاگاندا';
          flagsBadge = '🚩 شواهد دفاع از حکومت و ولایت';
          verdictBadge = '⛔ حکم قطعی X-Ray';
        } else if (isEslahtalab) {
          identityBadge = '🟡 گرایش: اصلاح‌طلب و استمرارطلب';
          probBadge = '📊 شاخص استمرارطلبی و بزک';
          flagsBadge = '🚩 شواهد دفاع از صندوق رأی';
          verdictBadge = '⚠️ ارزیابی نهایی X-Ray';
        } else if (isSeparatist) {
          identityBadge = '🏴 گرایش: تجزیه‌طلب / قوم‌گرا';
          probBadge = '📊 شاخص تهدید تمامیت ارضی';
          flagsBadge = '🚩 شواهد واگرایی و تجزیه‌طلبی';
          verdictBadge = '🚨 هشدار امنیتی X-Ray';
        } else if (isChapi) {
          identityBadge = '🟣 گرایش: جریان چپ / چپول';
          probBadge = '📊 شاخص تقابل با ملی‌گرایی';
          flagsBadge = '🚩 خط‌مشی سوسیالیستی و سوابق ۵۷ی';
          verdictBadge = '💡 ارزیابی تحلیلی X-Ray';
        } else if (isVaisi) {
          identityBadge = '🦁🟢 مراد ویسی (روزنامه‌نگار میهن‌دوست و تحلیل‌گر ارشد)';
          probBadge = '📊 احتمال فیک/سایبری بودن: ۰٪ (انسان ۱۰۰٪ واقعی)';
          flagsBadge = '🚩 راوی نام جان‌فداهای ۱۸ و ۱۹ دی‌ماه، شعار «یا با ایران یا جمهوری اسلامی» و افشای سپاه';
          verdictBadge = '🦁 تاییدیه اصالت ملی: روزنامه‌نگار شجاع و میهن‌دوست؛ مورد تایید قطعی X-Ray';
        } else if (isPahlavi || isShahbanou) {
          const isRezaPahlavi = lowerId.includes('رهبر اپوزیسیون') ||
            (options.authorHandle && /pahlavireza|reza_pahlavi/i.test(options.authorHandle));
          const isPahlaviComms = lowerId.includes('دفتر مطبوعاتی') || lowerId.includes('دفتر رسانه‌ای') ||
            (options.authorHandle && /pahlavicomms|pahlavi_comms/i.test(options.authorHandle));

          if (isShahbanou) {
            identityBadge = '👑 نماد مهر و اصالت: علیاحضرت شهبانو فرح پهلوی';
            probBadge = '📊 اصالت و جایگاه ملی: ۱۰۰٪ (مادر میهن و انسان ۱۰۰٪ واقعی)';
            flagsBadge = '🚩 دهه‌ها پاسداری از فرهنگ، هنر، شأن و هویت ملت ایران';
            verdictBadge = '👑 تاییدیه رسمی: نماد فرهنگ، هنر و تاریخ زرین ایران‌زمین';
          } else if (isRezaPahlavi) {
            identityBadge = '🦁☀️ پرچم شیر و خورشید / رهبر انقلاب ملی ایران';
            probBadge = '📊 احتمال فیک/سایبری بودن: ۰٪ (انسان ۱۰۰٪ واقعی)';
            flagsBadge = '🚩 پیشینه، دیدگاه‌ها و رهبری انقلاب ملی';
            verdictBadge = '👑 تاییدیه رسمی رهبر انقلاب ملی ایران';
          } else if (isPahlaviComms) {
            identityBadge = '🦁☀️ پایگاه اطلاع‌رسانی و دفتر مطبوعاتی شاهزاده رضا پهلوی';
            probBadge = '📊 مرجعیت و وثاقت اخبار: ۱۰۰٪ رسمی';
            flagsBadge = '🚩 بیانیه‌ها، اخبار رسمی و راستی‌آزمایی (Fact Checking)';
            verdictBadge = '🏛️ تاییدیه رسمی دفتر مطبوعاتی شاهزاده رضا پهلوی';
          } else {
            identityBadge = '🦁👑 گرایش: ملی‌گرا (همراه پهلوی)';
            probBadge = '📊 ریسک فیک/سایبری (احتمال ربات)';
            flagsBadge = '🚩 شواهد همراهی با شاهزاده رضا پهلوی';
            verdictBadge = '👑 تاییدیه هویت ملی';
          }
        } else if (isDiplomatic) {
          identityBadge = '🌐 ماهیت: نهاد دیپلماتیک رسمی';
          probBadge = '📊 احتمال فیک بودن: ۰٪';
          flagsBadge = '🚩 شواهد اصالت بین‌المللی';
          verdictBadge = '✅ تاییدیه دیپلماتیک';
        } else if (isMedia) {
          identityBadge = '🟢 ماهیت: خبرنگار / رسانه مستقل';
          probBadge = '📊 احتمال فیک بودن: ۰٪';
          flagsBadge = '🚩 سوابق رسانه‌ای و روزنامه‌نگاری';
          verdictBadge = '✅ تاییدیه اصالت رسانه‌ای';
        } else if (isCitizen) {
          identityBadge = '⚪ هویت: کاربر عادی / شهروند';
          probBadge = '📊 شاخص فیک / سایبری بودن';
          flagsBadge = '🚩 الگو و سبک فعالیت';
          verdictBadge = '💡 ارزیابی کلی X-Ray';
        }

        const factionSectionClass = (isMojtaba || isKhamenei || isRaisi || isLarijani || isGhalibaf || isBbcPersian || isKohnavard || isArzeshi || isFalseFlag || isRonaghi || isAfshari) ? 'xray-section-arzeshi' :
                                    isGovernment ? 'xray-section-government' :
                                    isMek ? 'xray-section-mek' :
                                    (isEslahtalab || isAlidoosti || isSazegara) ? 'xray-section-eslahtalab' :
                                    (isSeparatist || isJavanmardi) ? 'xray-section-separatist' :
                                    (isChapi || isMohammadi || isToomaj || isGolshifteh || isBoniadi || isEsmaeilion || isGolroo || isRahmani || isModarres) ? 'xray-section-chapi' :
                                    (isPahlavi || isShahbanou || isVaisi) ? 'xray-section-pahlavi' :
                                    isDiplomatic ? 'xray-section-diplomatic' :
                                    isMedia ? 'xray-section-media' : '';

        const factionVerdictClass = (isMojtaba || isKhamenei || isRaisi || isLarijani || isGhalibaf || isBbcPersian || isKohnavard || isArzeshi || isFalseFlag || isRonaghi || isAfshari) ? 'xray-section-arzeshi-verdict' :
                                    isGovernment ? 'xray-section-government-verdict' :
                                    isMek ? 'xray-section-mek-verdict' :
                                    (isEslahtalab || isAlidoosti || isSazegara) ? 'xray-section-eslahtalab-verdict' :
                                    (isSeparatist || isJavanmardi) ? 'xray-section-separatist-verdict' :
                                    (isChapi || isMohammadi || isToomaj || isGolshifteh || isBoniadi || isEsmaeilion || isGolroo || isRahmani || isModarres) ? 'xray-section-chapi-verdict' :
                                    (isPahlavi || isShahbanou || isVaisi) ? 'xray-section-pahlavi-verdict' :
                                    isDiplomatic ? 'xray-section-diplomatic-verdict' :
                                    isMedia ? 'xray-section-media-verdict' : 'xray-section-verdict';

        const badgeTone = (isMojtaba || isKhamenei || isRaisi || isLarijani || isGhalibaf || isBbcPersian || isKohnavard || isArzeshi || isFalseFlag || isRonaghi || isAfshari) ? 'xray-badge-arzeshi' :
                          isGovernment ? 'xray-badge-government' :
                          isMek ? 'xray-badge-mek' :
                          (isEslahtalab || isAlidoosti || isSazegara) ? 'xray-badge-eslahtalab' :
                          (isSeparatist || isJavanmardi) ? 'xray-badge-separatist' :
                          (isChapi || isMohammadi || isToomaj || isGolshifteh || isBoniadi || isEsmaeilion || isGolroo || isRahmani || isModarres) ? 'xray-badge-chapi' :
                          (isPahlavi || isShahbanou || isVaisi) ? 'xray-badge-pahlavi' :
                          isDiplomatic ? 'xray-badge-diplomatic' :
                          isMedia ? 'xray-badge-media' : '';

        const identityAvatarHtml = currentFactionImgUrl
          ? `<img src="${currentFactionImgUrl}" class="xray-faction-avatar-thumb" alt="${headerTitle}" />`
          : '';

        const handleChangeBannerHtml = detectedPrevHandles.length > 0
          ? `<div class="xray-handle-change-alert">
               <span class="xray-hc-icon">⚠️</span>
               <div class="xray-hc-content">
                 <strong>هشدار تغییر نام کاربری (کشف با ID دائمی ${resolvedRestId ? `#${resolvedRestId}` : 'توییتر'}):</strong>
                 این اکانت پیش‌تر با آیدی <span class="xray-hc-old">${detectedPrevHandles.map(h => '@' + String(h).replace(/^@/, '')).join(' ، ')}</span> فعالیت می‌کرده است!
               </div>
             </div>`
          : '';

        body.innerHTML = `
          ${handleChangeBannerHtml}
          <div class="xray-account-grid">
            <div class="xray-section xray-section-identity ${factionSectionClass}">
              <div class="xray-section-label">
                <span class="xray-badge ${badgeTone || 'xray-badge-identity'}">${identityBadge}</span>
              </div>
              <div class="xray-identity-with-avatar">
                <div class="xray-identity-text-col">
                  <div class="xray-section-text xray-identity-text ${isMek ? 'xray-mek-text' : ''}">${formatMarkdown(accountObj.identity)}</div>
                </div>
                ${identityAvatarHtml}
              </div>
            </div>

            <div class="xray-section xray-section-prob ${factionSectionClass}">
              <div class="xray-section-label">
                <span class="xray-badge ${riskClass}">${probBadge}</span>
              </div>
              <div class="xray-section-text xray-prob-text ${isMek ? 'xray-mek-text' : ''}">${formatMarkdown(accountObj.probability)}</div>
            </div>
          </div>

          ${accountObj.redFlags ? `
            <div class="xray-section xray-section-flags ${factionSectionClass}">
              <div class="xray-section-label">
                <span class="xray-badge ${badgeTone || 'xray-badge-flags'}">${flagsBadge}</span>
              </div>
              <div class="xray-section-text ${isMek ? 'xray-mek-desc' : ''}">${formatMarkdown(accountObj.redFlags)}</div>
            </div>
          ` : ''}

          ${accountObj.verdict ? `
            <div class="xray-section ${factionVerdictClass}">
              <div class="xray-section-label">
                <span class="xray-badge ${badgeTone || 'xray-badge-verdict'}">${verdictBadge}</span>
              </div>
              <div class="xray-section-text ${isMek ? 'xray-mek-verdict-highlight' : 'xray-verdict-highlight'}">${formatMarkdown(accountObj.verdict)}</div>
            </div>
          ` : ''}
        `;
      }
    }

    box.appendChild(body);
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('mousedown', (e) => e.stopPropagation());

    // Enable 1-click full-size lightbox on all faction avatars (header and thumbnail)
    box.querySelectorAll('.xray-faction-avatar-thumb, .xray-faction-avatar-header').forEach((avatarEl) => {
      avatarEl.style.cursor = 'zoom-in';
      avatarEl.title = 'مشاهده تصویر در اندازه اصلی / Click to view full size';
      avatarEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const src = avatarEl.getAttribute('src');
        if (src) {
          openImageLightbox(src, headerTitle);
        }
      });
    });

    insertAfterEl.insertAdjacentElement('afterend', box);
  }

  /**
   * High-DPI Canvas2D Renderer: Converts an X-Ray analysis card into a crisp PNG Blob
   * 100% CSP-compliant on x.com (no external scripts or tainted foreignObjects)
   */
  async function renderAnalysisCardToPngBlob(cardData) {
    const {
      headerTitle = 'گزارش کالبدشکافی اکانت',
      headerIcon = '🕵️',
      avatarUrl = '',
      authorHandle = '',
      factionKey = '',
      accountObj = {},
      previousHandles = [],
      restId = ''
    } = cardData || {};

    // Determine faction accent colors
    let accent = '#00f2fe';
    let bgTint = 'rgba(0, 242, 254, 0.08)';
    if (['pahlavi', 'farah', 'vaisi'].includes(factionKey)) {
      accent = '#10b981';
      bgTint = 'rgba(16, 185, 129, 0.10)';
    } else if (['mek', 'arzeshi', 'khamenei', 'mojtaba', 'raisi', 'larijani', 'ghalibaf', 'bbcpersian', 'kohnavard', 'afshari', 'false_flag', 'omiddana', 'fakhravar', 'homayoun', 'alinejad', 'ronaghi'].includes(factionKey)) {
      accent = '#ef4444';
      bgTint = 'rgba(239, 68, 68, 0.11)';
    } else if (['eslahtalab', 'alidoosti', 'sazegara'].includes(factionKey)) {
      accent = '#eab308';
      bgTint = 'rgba(234, 179, 8, 0.10)';
    } else if (['chapi', 'mohammadi', 'toomaj', 'golshifteh', 'boniadi', 'esmaeilion', 'golroo', 'rahmani', 'modarres'].includes(factionKey)) {
      accent = '#a855f7';
      bgTint = 'rgba(168, 85, 247, 0.10)';
    } else if (['separatist', 'javanmardi'].includes(factionKey)) {
      accent = '#f43f5e';
      bgTint = 'rgba(244, 63, 94, 0.11)';
    } else if (['media', 'diplomatic'].includes(factionKey)) {
      accent = '#38bdf8';
      bgTint = 'rgba(56, 189, 248, 0.10)';
    }

    const width = 680;
    const padX = 24;
    const innerW = width - padX * 2;
    const textMaxW = innerW - 32;
    const fontStack = 'Tahoma, "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif';

    const measureCanvas = document.createElement('canvas');
    const mCtx = measureCanvas.getContext('2d');

    function wrapRtlParagraphs(rawStr, font, maxW) {
      mCtx.font = font;
      const clean = String(rawStr || '').replace(/\*\*/g, '').trim();
      if (!clean) return [];
      const paragraphs = clean.split(/\n+/);
      const lines = [];
      for (const p of paragraphs) {
        const words = p.trim().split(/\s+/);
        let currentLine = '';
        for (const w of words) {
          const testLine = currentLine ? `${currentLine} ${w}` : w;
          if (mCtx.measureText(testLine).width > maxW && currentLine) {
            lines.push(currentLine);
            currentLine = w;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);
      }
      return lines;
    }

    const idLines = wrapRtlParagraphs(accountObj.identity || '', `bold 14px ${fontStack}`, textMaxW);
    const probLines = wrapRtlParagraphs(accountObj.probability || '', `bold 13.5px ${fontStack}`, textMaxW);
    const flagLines = wrapRtlParagraphs(accountObj.redFlags || '', `13px ${fontStack}`, textMaxW);
    const verdictLines = wrapRtlParagraphs(accountObj.verdict || '', `bold 13.5px ${fontStack}`, textMaxW);

    const hasRenameAlert = Array.isArray(previousHandles) && previousHandles.length > 0;
    const renameText = hasRenameAlert
      ? `⚠️ هشدار تغییر هویت (ID #${restId}): این اکانت قبلاً با نام ${previousHandles.map(h => '@' + String(h).replace(/^@/, '')).join(' ، ')} فعالیت می‌کرده است!`
      : '';
    const renameLines = hasRenameAlert ? wrapRtlParagraphs(renameText, `bold 12.5px ${fontStack}`, textMaxW) : [];

    const lineH = 22;
    const secPad = 38; // label + top/bottom padding
    const hHeader = 64;
    const hRename = hasRenameAlert ? (renameLines.length * 20 + 24) : 0;
    const hId = Math.max(1, idLines.length) * lineH + secPad;
    const hProb = Math.max(1, probLines.length) * lineH + secPad;
    const hFlags = flagLines.length > 0 ? (flagLines.length * lineH + secPad) : 0;
    const hVerdict = verdictLines.length > 0 ? (verdictLines.length * lineH + secPad) : 0;
    const hFooter = 42;

    const totalHeight = hHeader + 18 + (hRename ? hRename + 12 : 0) + hId + 12 + hProb + (hFlags ? 12 + hFlags : 0) + (hVerdict ? 12 + hVerdict : 0) + hFooter + 16;

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = totalHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    function drawRoundRect(x, y, w, h, r, fill, stroke, strokeW = 1) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.lineWidth = strokeW;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }

    // Card Background
    drawRoundRect(2, 2, width - 4, totalHeight - 4, 16, '#0b0f17', accent, 2);

    // Header Bar
    drawRoundRect(4, 4, width - 8, hHeader, [14, 14, 0, 0], bgTint, null);
    ctx.beginPath();
    ctx.moveTo(4, hHeader + 4);
    ctx.lineTo(width - 4, hHeader + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Load avatar bitmap if available
    let avatarBitmap = null;
    if (avatarUrl) {
      try {
        const resp = await fetch(avatarUrl);
        const b = await resp.blob();
        avatarBitmap = await createImageBitmap(b);
      } catch (e) {}
    }

    let titleRightX = width - padX;
    if (avatarBitmap) {
      const avSize = 38;
      const avX = width - padX - avSize;
      const avY = 4 + (hHeader - avSize) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarBitmap, avX, avY, avSize, avSize);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      titleRightX = avX - 12;
    }

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `bold 15px ${fontStack}`;
    const displayHeader = avatarBitmap ? headerTitle : `${headerIcon} ${headerTitle}`;
    ctx.fillText(displayHeader.slice(0, 62), titleRightX, 4 + hHeader / 2 + 5);

    if (authorHandle) {
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.font = `bold 12.5px ${fontStack}`;
      ctx.fillStyle = accent;
      ctx.fillText(authorHandle, padX, 4 + hHeader / 2 + 5);
    }

    let curY = hHeader + 18;

    // Optional Handle-Change Alert Box
    if (hasRenameAlert) {
      drawRoundRect(padX, curY, innerW, hRename, 10, 'rgba(245, 158, 11, 0.14)', '#f59e0b', 1.2);
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.font = `bold 12.5px ${fontStack}`;
      ctx.fillStyle = '#fde047';
      renameLines.forEach((ln, idx) => {
        ctx.fillText(ln, width - padX - 14, curY + 22 + idx * 20);
      });
      curY += hRename + 12;
    }

    function drawSectionBox(y, h, badgeLabel, linesArr, textFont, textColor, isVerdictSec = false) {
      const secBg = isVerdictSec ? bgTint : 'rgba(255, 255, 255, 0.035)';
      const secBorder = isVerdictSec ? accent : 'rgba(255, 255, 255, 0.1)';
      drawRoundRect(padX, y, innerW, h, 10, secBg, secBorder, isVerdictSec ? 1.5 : 1);

      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.font = `bold 11.5px ${fontStack}`;
      ctx.fillStyle = accent;
      ctx.fillText(badgeLabel, width - padX - 14, y + 20);

      ctx.font = textFont;
      ctx.fillStyle = textColor;
      linesArr.forEach((ln, i) => {
        ctx.fillText(ln, width - padX - 16, y + 44 + i * lineH);
      });
    }

    drawSectionBox(curY, hId, '🤖 تشخیص هویت و گرایش اکانت', idLines, `bold 14px ${fontStack}`, '#f1f5f9');
    curY += hId + 12;

    drawSectionBox(curY, hProb, '📊 شاخص و احتمال سایبری / بات', probLines, `bold 13.5px ${fontStack}`, '#fde047');
    curY += hProb + 12;

    if (hFlags > 0) {
      drawSectionBox(curY, hFlags, '🚩 شواهد، سوابق و سرنخ‌ها', flagLines, `13px ${fontStack}`, '#e2e8f0');
      curY += hFlags + 12;
    }

    if (hVerdict > 0) {
      drawSectionBox(curY, hVerdict, '💡 حکم نهایی X-Ray', verdictLines, `bold 13.5px ${fontStack}`, '#ffffff', true);
      curY += hVerdict + 10;
    }

    // Watermark Footer
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = `bold 11px ${fontStack}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText('🕵️ X-Ray Account Check • رادار جریان‌شناسی و اصالت‌سنجی اکانت در X', width - padX - 4, totalHeight - 14);

    if (restId) {
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.font = `11px ${fontStack}`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(`X-ID: #${restId}`, padX + 4, totalHeight - 14);
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  /**
   * Preserves both the beginning and the end of a tweet (where hashtags live!)
   */
  function smartTrimTweetPreservingHashtags(text, maxLen = 420) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    const headLen = Math.floor(maxLen * 0.6);
    const tailLen = maxLen - headLen;
    return `${text.slice(0, headLen)} [...] ${text.slice(-tailLen)}`;
  }

  /**
   * Active Deep Profile Timeline Harvester:
   * When on a user's profile page, briefly scrolls to force X's virtual DOM to render
   * older posts and harvests their full text and hashtags, then restores scroll position.
   */
  async function harvestProfileTimelineOnDemand(cleanHandle) {
    if (!cleanHandle) return;
    // First record everything currently in DOM
    document.querySelectorAll('article[data-testid="tweet"]').forEach(t => recordTweetInHistory(t));

    const existing = accountHistoryMemory.get(cleanHandle);
    const currentCount = existing ? existing.tweets.size : 0;
    if (currentCount >= 14) return; // Already have a rich set of tweets in memory

    const startScrollY = window.scrollY;
    try {
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        window.scrollBy({ top: Math.round(window.innerHeight * 1.35), behavior: 'instant' });
        await new Promise(r => setTimeout(r, 320));
        document.querySelectorAll('article[data-testid="tweet"]').forEach(t => recordTweetInHistory(t));
      }
    } catch (e) {
      // Ignore scroll errors
    } finally {
      window.scrollTo({ top: startScrollY, behavior: 'instant' });
    }
  }

  /**
   * Builds a rich historical payload (all observed tweets + hashtag frequency map + interaction graph) for an @handle
   */
  function buildAccountHistoryPayload(cleanHandle, currentTweetData, bio = '') {
    // Ensure all currently rendered tweets in DOM are recorded first
    document.querySelectorAll('article[data-testid="tweet"]').forEach(t => recordTweetInHistory(t));

    const record = cleanHandle ? accountHistoryMemory.get(cleanHandle) : null;
    const authorTweetsList = [];
    const hashtagFreqMap = new Map(); // normKey -> { tag, count }

    const addHashtagCount = (tag, weight = 1) => {
      const normKey = normalizeHashtagKey(tag);
      if (!normKey || normKey.length < 2) return;
      const prev = hashtagFreqMap.get(normKey) || { tag: tag.replace(/^#/, ''), count: 0 };
      prev.count += weight;
      hashtagFreqMap.set(normKey, prev);
    };

    // 1. Extract hashtags from Bio (high importance: weighted 3x)
    if (bio) {
      const bioTags = extractHashtagsFromTextAndNode(bio, null);
      bioTags.forEach(t => addHashtagCount(t, 3));
    }

    // 2. Include current tweet if available
    if (currentTweetData && currentTweetData.rawMainText) {
      authorTweetsList.push({
        text: currentTweetData.rawMainText,
        quoteText: currentTweetData.quoteText || '',
        quotedAuthorHandle: currentTweetData.quotedAuthorHandle || '',
        isRetweet: Boolean(currentTweetData.isRetweet),
        hashtags: currentTweetData.authorHashtags || []
      });
    }

    // 3. Include all historical tweets from accountHistoryMemory
    if (record && record.tweets) {
      const storedTweets = Array.from(record.tweets.values()).reverse(); // newest first
      for (const item of storedTweets) {
        if (!item.text) continue;
        const alreadyIn = authorTweetsList.some(x => x.text.slice(0, 100) === item.text.slice(0, 100));
        if (!alreadyIn) {
          authorTweetsList.push({
            text: item.text,
            quoteText: item.quoteText || '',
            quotedAuthorHandle: item.quotedAuthorHandle || '',
            isRetweet: Boolean(item.isRetweet),
            hashtags: item.hashtags || extractHashtagsFromTextAndNode(item.text, null)
          });
        }
      }
    }

    // 4. Aggregate hashtag frequencies across all collected author tweets
    for (const tw of authorTweetsList) {
      const tags = (tw.hashtags && tw.hashtags.length > 0)
        ? tw.hashtags
        : extractHashtagsFromTextAndNode(tw.text, null);
      for (const tag of tags) {
        addHashtagCount(tag, tw.isRetweet ? 0.5 : 1);
      }
    }

    const sortedHashtags = Array.from(hashtagFreqMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 35);

    // 5. Build Retweet & Quote Interaction Graph
    const retweetedList = [];
    if (record && record.retweetedHandles) {
      for (const [h, cnt] of record.retweetedHandles.entries()) {
        retweetedList.push({ handle: h, count: cnt });
      }
      retweetedList.sort((a, b) => b.count - a.count);
    }

    const quotedInteractions = [];
    if (currentTweetData && currentTweetData.quotedAuthorHandle) {
      quotedInteractions.push({
        targetHandle: currentTweetData.quotedAuthorHandle,
        comment: currentTweetData.rawMainText || '',
        quotedText: currentTweetData.quoteText || ''
      });
    }
    if (record && Array.isArray(record.quotedInteractions)) {
      for (const qi of record.quotedInteractions) {
        if (!quotedInteractions.some(x => x.targetHandle === qi.targetHandle && x.comment === qi.comment)) {
          quotedInteractions.push(qi);
        }
      }
    }

    const formattedTweets = authorTweetsList.slice(0, 22).map((tw, idx) => {
      const prefix = tw.isRetweet ? `[بازنشر / Retweet #${idx + 1}]` : `[پست #${idx + 1}]`;
      let line = `${prefix}: "${smartTrimTweetPreservingHashtags(tw.text, 420)}"`;
      if (tw.quoteText && idx < 3) {
        line += `\n   ↳ (در پاسخ/کوت به ${tw.quotedAuthorHandle ? '@' + tw.quotedAuthorHandle : 'توییت دیگران'}: "${smartTrimTweetPreservingHashtags(tw.quoteText, 180)}")`;
      }
      return line;
    });

    let tweetsSample = formattedTweets.join('\n\n');
    if (sortedHashtags.length > 0) {
      const hashtagSummary = sortedHashtags
        .map(h => `#${h.tag}${h.count > 1 ? ` (${Math.ceil(h.count)} بار)` : ''}`)
        .join(' ، ');
      tweetsSample = `📊 تاریخچه هشتگ‌های استفاده‌شده توسط خودِ این اکانت در پست‌های قدیم و جدید:\n${hashtagSummary}\n\n` + tweetsSample;
    }

    return {
      tweetsSample,
      authorOwnTextOnly: authorTweetsList.filter(t => !t.isRetweet).map(t => t.text).join('\n'),
      authorHashtags: sortedHashtags,
      retweetedHandles: retweetedList,
      quotedInteractions,
      observedTweetCount: authorTweetsList.length
    };
  }

  /**
   * Resets trigger buttons
   */
  function resetTriggerButton(tweetEl) {
    const botBtn = tweetEl.querySelector('.xray-bot-btn');
    if (botBtn) {
      botBtn.disabled = false;
      botBtn.innerHTML = `<span class="xray-btn-icon">🕵️</span><span class="xray-btn-label">اکانت‌چک</span>`;
      botBtn.classList.remove('xray-btn-active', 'xray-btn-loading');
    }
  }

  /**
   * Handles user clicking the Bot/Account Check button on a tweet
   */
  async function handleAccountCheckClick(e, tweetEl, actionGroup, botBtn) {
    e.preventDefault();
    e.stopPropagation();

    if (activeScans.has(tweetEl)) return;

    // Toggle close if already open
    const existingBox = tweetEl.querySelector('.xray-account-box:not(.xray-loading-state)');
    if (existingBox) {
      existingBox.classList.add('xray-fade-out');
      setTimeout(() => existingBox.remove(), 200);
      resetTriggerButton(tweetEl);
      return;
    }

    const tweetAuthor = extractTweetAuthor(tweetEl);
    const authorHandle = extractAuthorHandle(tweetEl);
    const currentTweetData = extractTweetData(tweetEl);
    const currentTweetText = currentTweetData.rawMainText || currentTweetData.text;
    const cleanHandle = authorHandle.replace('@', '').toLowerCase();
    const cachedAuthorRecord = cleanHandle ? accountHistoryMemory.get(cleanHandle) : null;
    const isIranianAccount = Boolean(
      /^iranin[a-z]{2,15}$/i.test(cleanHandle) ||
      /^(ir|iran)_?(emb|mission|consulate)/i.test(cleanHandle) ||
      /^(emb|mission)_?(ir|iran)/i.test(cleanHandle) ||
      /^(mfa_ir|irimfa|iranmfa|ir_mfa|irangov|president_ir|leader_ir)/i.test(cleanHandle)
    );
    const isCachedAuthorStrictGov = Boolean(
      !isIranianAccount &&
      cachedAuthorRecord &&
      (Boolean(cachedAuthorRecord.isGreyBadge) || cachedAuthorRecord.verifiedType === 'Government')
    );
    const domIsGreyBadge = !isIranianAccount && isAuthorGreyBadge(tweetEl);
    const isGreyBadge = isCachedAuthorStrictGov || domIsGreyBadge;
    const domIsGoldBadge = !isIranianAccount && (!isGreyBadge) && isAuthorGoldBadge(tweetEl);
    const isGoldBadge = (!isGreyBadge) && (Boolean(cachedAuthorRecord?.isGoldBadge) || domIsGoldBadge || cachedAuthorRecord?.verifiedType === 'Business');
    const verifiedType = isGreyBadge ? 'Government' : (isGoldBadge ? 'Business' : (cachedAuthorRecord?.verifiedType || ''));
    const governmentLabel = isGreyBadge
      ? (cachedAuthorRecord?.governmentLabel || extractAffiliateLabel(tweetEl) || 'حساب رسمی دولتی / حاکمیتی')
      : (isGoldBadge ? 'سازمان رسمی / شرکت ثبت‌شده (تیک طلایی)' : '');
    const isVerified = Boolean(isAuthorVerified(tweetEl) || isGreyBadge || isGoldBadge || (cachedAuthorRecord && cachedAuthorRecord.isVerified));

    // Check if user is currently on this author's profile page (e.g. x.com/mslm1090305)
    let bio = '';
    let userUrl = '';
    let metadata = '';
    let joinDate = '';
    let followersRaw = '';
    let followingRaw = '';
    let followerStats = '';
    const currentPath = window.location.pathname.toLowerCase();
    const isProfilePage = cleanHandle && (currentPath === `/${cleanHandle}` || currentPath.startsWith(`/${cleanHandle}/`));

    if (isProfilePage) {
      const userDescEl = document.querySelector('div[data-testid="UserDescription"]');
      const userHeaderItems = document.querySelector('div[data-testid="UserProfileHeader_Items"]');
      const userUrlEl = document.querySelector('a[data-testid="UserUrl"]');
      const joinDateEl = document.querySelector('[data-testid="UserJoinDate"]');
      if (userDescEl) bio = (userDescEl.innerText || '').trim();
      if (userHeaderItems) metadata = (userHeaderItems.innerText || '').trim().replace(/\n+/g, ' | ');
      if (userUrlEl) userUrl = (userUrlEl.innerText || userUrlEl.href || '').trim();
      if (joinDateEl) joinDate = (joinDateEl.innerText || '').trim();

      const followersLink = document.querySelector('a[href*="/followers"], a[href*="/verified_followers"]');
      const followingLink = document.querySelector('a[href*="/following"]');
      if (followersLink) {
        followersRaw = followersLink.innerText.trim().replace(/\n+/g, ' ');
        followerStats += `دنبال‌کنندگان: ${followersRaw} | `;
      }
      if (followingLink) {
        followingRaw = followingLink.innerText.trim().replace(/\n+/g, ' ');
        followerStats += `دنبال‌شوندگان: ${followingRaw}`;
      }
      if (cleanHandle) {
        const rec = ensureAccountHistoryRecord(cleanHandle);
        if (bio) rec.bio = bio;
        if (joinDate) rec.joinDate = joinDate;
        if (userUrl) rec.userUrl = userUrl;
        if (followersRaw) rec.followersRaw = followersRaw;
        if (followingRaw) rec.followingRaw = followingRaw;
      }
    } else if (cleanHandle && accountHistoryMemory.has(cleanHandle)) {
      const cached = accountHistoryMemory.get(cleanHandle);
      if (cached.bio) bio = cached.bio;
      if (cached.joinDate) joinDate = cached.joinDate;
      if (cached.userUrl) userUrl = cached.userUrl;
      if (cached.followersRaw) {
        followersRaw = cached.followersRaw;
        followerStats += `دنبال‌کنندگان: ${followersRaw} | `;
      }
      if (cached.followingRaw) {
        followingRaw = cached.followingRaw;
        followerStats += `دنبال‌شوندگان: ${followingRaw}`;
      }
    }

    // Set Loading UI on Button
    botBtn.disabled = true;
    botBtn.classList.add('xray-btn-loading');
    botBtn.innerHTML = `<span class="xray-spinner" style="border-top-color: #f59e0b;"></span><span class="xray-btn-label">بررسی پروفایل و پست‌ها...</span>`;

    // Render Account Loading Box
    renderAccountResultBox(tweetEl, actionGroup, null, { isLoading: true, authorHandle, displayName: tweetAuthor });

    activeScans.add(tweetEl);

    // If on profile page, harvest older tweets from timeline before sending
    if (isProfilePage) {
      await harvestProfileTimelineOnDemand(cleanHandle);
    }

    const allReferencedHandles = new Set(currentTweetData.referencedHandles);
    const allLinks = new Set(currentTweetData.links);
    if (userUrl) allLinks.add(userUrl);

    if (authorHandle) {
      document.querySelectorAll('article[data-testid="tweet"]').forEach(t => {
        if (extractAuthorHandle(t) === authorHandle) {
          const tData = extractTweetData(t);
          tData.referencedHandles.forEach(h => allReferencedHandles.add(h));
          tData.links.forEach(l => allLinks.add(l));
        }
      });
    }

    const historyPayload = buildAccountHistoryPayload(cleanHandle, currentTweetData, bio);
    const tweetRestId = (cleanHandle && accountHistoryMemory.get(cleanHandle)?.restId) || handleToRestId.get(normalizeHandleKey(cleanHandle)) || '';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'ANALYZE_ACCOUNT',
        accountInfo: {
          username: authorHandle,
          restId: tweetRestId,
          displayName: tweetAuthor,
          isVerified,
          isGreyBadge,
          isGoldBadge,
          verifiedType,
          governmentLabel,
          bio,
          userUrl,
          joinDate,
          followersRaw,
          followingRaw,
          metadata: [metadata, followerStats].filter(Boolean).join(' | '),
          followerStats,
          currentTweet: currentTweetData.rawMainText || currentTweetText,
          quoteTweetInCurrent: currentTweetData.quoteText || '',
          quotedAuthorHandle: currentTweetData.quotedAuthorHandle || '',
          authorOwnTextOnly: historyPayload.authorOwnTextOnly,
          authorHashtags: historyPayload.authorHashtags,
          retweetedHandles: historyPayload.retweetedHandles,
          quotedInteractions: historyPayload.quotedInteractions,
          observedTweetCount: historyPayload.observedTweetCount,
          referencedHandles: Array.from(allReferencedHandles),
          links: Array.from(allLinks),
          tweetsSample: historyPayload.tweetsSample
        }
      });

      // If background harvested remote profile data, sync it into this tab's memory
      if (response && response.harvestedData && cleanHandle) {
        ingestGraphQLSnifferPayload({
          users: [{
            handle: cleanHandle,
            bio: response.harvestedData.bio || '',
            joinDate: response.harvestedData.joinDate || '',
            userUrl: response.harvestedData.userUrl || ''
          }],
          tweets: (response.harvestedData.rawTweets || []).map(t => ({
            authorHandle: cleanHandle,
            text: typeof t === 'string' ? t : (t.text || ''),
            hashtags: Array.isArray(t.hashtags) ? t.hashtags : [],
            isRetweet: Boolean(t.isRetweet),
            retweetedAuthor: t.retweetedAuthor || '',
            quotedAuthorHandle: t.quotedAuthorHandle || '',
            quoteText: t.quoteText || ''
          }))
        });
      }

      activeScans.delete(tweetEl);
      botBtn.disabled = false;
      botBtn.classList.remove('xray-btn-loading');
      botBtn.classList.add('xray-btn-active');
      botBtn.innerHTML = `<span class="xray-btn-icon">🕵️</span><span class="xray-btn-label">اکانت‌چک ✓</span>`;

      if (!response) {
        throw new Error('پاسخی از هسته تحلیلی دریافت نشد.');
      }

      if (response.success && response.analysis) {
        const parsed = parseAccountAnalysis(response.analysis);
        const resolvedFaction = response.faction || inferFactionKeyFromIdentityText(parsed.identity, response.isMekAlert, response.isFalseFlag);
        if (resolvedFaction && cleanHandle) {
          badgeDirectory.handleMap[normalizeHandleKey(cleanHandle)] = {
            faction: resolvedFaction,
            handle: authorHandle,
            restId: response.restId || tweetRestId
          };
          refreshAllVisibleMiniBadges();
        }
        renderAccountResultBox(tweetEl, actionGroup, parsed, {
          isLoading: false,
          model: response.model,
          authorHandle,
          displayName: tweetAuthor,
          isGreyBadge: Boolean(isGreyBadge),
          isMekAlert: response.isMekAlert,
          isFalseFlag: response.isFalseFlag,
          restId: response.restId || tweetRestId,
          previousHandles: response.previousHandles || []
        });
      } else {
        renderAccountResultBox(tweetEl, actionGroup, null, {
          isError: true,
          errorMessage: response.message || 'خطا در اسکن هویت اکانت.'
        });
      }
    } catch (err) {
      console.error('[X-Ray] Account check error:', err);
      activeScans.delete(tweetEl);
      resetTriggerButton(tweetEl);
      renderAccountResultBox(tweetEl, actionGroup, null, {
        isError: true,
        errorMessage: `خطای ارتباط با افزونه: ${err.message}`
      });
    }
  }

  /**
   * Injects the Account Check action button into a tweet's action bar
   */
  function injectAccountCheckButton(tweetEl) {
    const actionGroup = tweetEl.querySelector('div[role="group"]');
    if (!actionGroup) return;

    if (actionGroup.querySelector('.xray-action-container')) return;

    const container = document.createElement('div');
    container.className = 'xray-action-container';

    // Account & Bot Scout Button
    const botBtn = document.createElement('button');
    botBtn.type = 'button';
    botBtn.className = 'xray-trigger-btn xray-bot-btn';
    botBtn.setAttribute('aria-label', 'Account Check');
    botBtn.setAttribute('title', 'کالبدشکافی اصالت اکانت و کشف سایبری/بات');
    botBtn.innerHTML = `<span class="xray-btn-icon">🕵️</span><span class="xray-btn-label">اکانت‌چک</span>`;
    botBtn.addEventListener('click', (e) => handleAccountCheckClick(e, tweetEl, actionGroup, botBtn));
    botBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    botBtn.addEventListener('mouseup', (e) => e.stopPropagation());

    container.appendChild(botBtn);

    actionGroup.appendChild(container);
    tweetEl.dataset.xrayInjected = 'true';
  }

  /**
   * Injects the Account X-Ray scanner button on Profile Pages (x.com/username)
   */
  function injectProfileScanner() {
    // Check if on a profile page
    const userDescription = document.querySelector('div[data-testid="UserDescription"]');
    const userHeaderItems = document.querySelector('div[data-testid="UserProfileHeader_Items"]');
    const userNameEl = document.querySelector('div[data-testid="UserName"]');

    if (!userNameEl) return;

    const headerContainer = userDescription ? userDescription.parentElement : (userHeaderItems ? userHeaderItems.parentElement : userNameEl.parentElement);
    if (!headerContainer) return;

    if (headerContainer.querySelector('.xray-profile-scan-container')) return;

    const banner = document.createElement('div');
    banner.className = 'xray-profile-scan-container';

    const scanBtn = document.createElement('button');
    scanBtn.type = 'button';
    scanBtn.className = 'xray-profile-scan-btn';
    scanBtn.innerHTML = `🕵️ اسکن اصالت و سابقه اکانت (Account X-Ray Bot Scout)`;

    scanBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const existingProfileBox = headerContainer.querySelector('.xray-account-box');
      if (existingProfileBox) {
        existingProfileBox.remove();
        scanBtn.innerHTML = `🕵️ اسکن اصالت و سابقه اکانت (Account X-Ray Bot Scout)`;
        return;
      }

      const displayName = userNameEl.innerText.split('\n')[0] || '';
      const handleMatch = userNameEl.innerText.match(/@([a-zA-Z0-9_]+)/);
      const username = handleMatch ? `@${handleMatch[1]}` : '';
      const cleanHandle = username.replace('@', '').toLowerCase();
      const bio = userDescription ? userDescription.innerText.trim() : '';
      const metadata = userHeaderItems ? userHeaderItems.innerText.trim().replace(/\n+/g, ' | ') : '';
      const joinDateEl = document.querySelector('[data-testid="UserJoinDate"]');
      const joinDate = joinDateEl ? (joinDateEl.innerText || '').trim() : '';
      const cachedProfileRecord = cleanHandle ? accountHistoryMemory.get(cleanHandle) : null;
      const isIranianProfile = Boolean(
        /^iranin[a-z]{2,15}$/i.test(cleanHandle) ||
        /^(ir|iran)_?(emb|mission|consulate)/i.test(cleanHandle) ||
        /^(emb|mission)_?(ir|iran)/i.test(cleanHandle) ||
        /^(mfa_ir|irimfa|iranmfa|ir_mfa|irangov|president_ir|leader_ir)/i.test(cleanHandle)
      );
      const isCachedProfileStrictGov = Boolean(
        !isIranianProfile &&
        cachedProfileRecord &&
        (Boolean(cachedProfileRecord.isGreyBadge) || cachedProfileRecord.verifiedType === 'Government')
      );
      const domProfileGreyBadge = !isIranianProfile && (
        isAuthorGreyBadge(headerContainer) ||
        isAuthorGreyBadge(userNameEl) ||
        isAuthorGreyBadge(document.querySelector('[data-testid="UserName"]')) ||
        isAuthorGreyBadge(document.querySelector('[data-testid="User-Name"]'))
      );
      const isGreyBadge = isCachedProfileStrictGov || domProfileGreyBadge;
      const domProfileGoldBadge = !isIranianProfile && (!isGreyBadge) && (
        isAuthorGoldBadge(headerContainer) ||
        isAuthorGoldBadge(userNameEl) ||
        isAuthorGoldBadge(document.querySelector('[data-testid="UserName"]')) ||
        isAuthorGoldBadge(document.querySelector('[data-testid="User-Name"]'))
      );
      const isGoldBadge = (!isGreyBadge) && (Boolean(cachedProfileRecord?.isGoldBadge) || domProfileGoldBadge || cachedProfileRecord?.verifiedType === 'Business');
      const verifiedType = isGreyBadge ? 'Government' : (isGoldBadge ? 'Business' : (cachedProfileRecord?.verifiedType || ''));
      const governmentLabel = isGreyBadge ? (cachedProfileRecord?.governmentLabel ||
        extractAffiliateLabel(headerContainer) ||
        extractAffiliateLabel(userNameEl) ||
        extractAffiliateLabel(document.querySelector('[data-testid="UserName"]')) ||
        'حساب رسمی دولتی / حاکمیتی (تیک خاکستری)') : (isGoldBadge ? 'سازمان رسمی / شرکت ثبت‌شده (تیک طلایی)' : '');
      const isVerified = Boolean(
        isAuthorVerified(headerContainer) ||
        isAuthorVerified(userNameEl) ||
        isGreyBadge ||
        isGoldBadge ||
        (cachedProfileRecord && cachedProfileRecord.isVerified)
      );

      // Scrape external user website URL if present in profile header
      const userUrlEl = document.querySelector('a[data-testid="UserUrl"]');
      const userUrl = userUrlEl ? (userUrlEl.innerText || userUrlEl.href || '').trim() : '';

      // Scrape links inside bio
      const bioLinks = userDescription
        ? Array.from(userDescription.querySelectorAll('a[href]')).map(a => (a.innerText || a.href || '').trim()).filter(Boolean)
        : [];

      // Scrape followers count and following count if visible
      let followerStats = '';
      let followersRaw = '';
      let followingRaw = '';
      const followersLink = document.querySelector('a[href*="/followers"], a[href*="/verified_followers"]');
      const followingLink = document.querySelector('a[href*="/following"]');
      if (followersLink) {
        followersRaw = followersLink.innerText.trim().replace(/\n+/g, ' ');
        followerStats += `دنبال‌کنندگان: ${followersRaw} | `;
      }
      if (followingLink) {
        followingRaw = followingLink.innerText.trim().replace(/\n+/g, ' ');
        followerStats += `دنبال‌شوندگان: ${followingRaw}`;
      }

      scanBtn.disabled = true;
      scanBtn.innerHTML = `<span class="xray-spinner" style="border-top-color: #f59e0b;"></span> در حال کالبدشکافی پست‌های قدیمی، گراف تعاملات و هشتگ‌های ${username}...`;

      renderAccountResultBox(headerContainer, banner, null, { isLoading: true, authorHandle: username, displayName });

      // Perform active deep timeline harvest on the profile page
      await harvestProfileTimelineOnDemand(cleanHandle);

      const profileReferencedHandles = new Set();
      const profileLinks = new Set();
      if (userUrl) profileLinks.add(userUrl);
      bioLinks.forEach(l => profileLinks.add(l));

      const tweetArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      tweetArticles.forEach((article) => {
        const tData = extractTweetData(article);
        tData.referencedHandles.forEach(h => profileReferencedHandles.add(h));
        tData.links.forEach(l => profileLinks.add(l));
      });

      const historyPayload = buildAccountHistoryPayload(cleanHandle, null, bio);
      const profileRestId = (cleanHandle && accountHistoryMemory.get(cleanHandle)?.restId) || handleToRestId.get(normalizeHandleKey(cleanHandle)) || '';

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'ANALYZE_ACCOUNT',
          accountInfo: {
            username,
            restId: profileRestId,
            displayName,
            bio,
            userUrl,
            joinDate,
            followersRaw,
            followingRaw,
            metadata: [metadata, followerStats].filter(Boolean).join(' | '),
            isVerified,
            isGreyBadge,
            isGoldBadge,
            verifiedType,
            governmentLabel,
            followerStats,
            authorOwnTextOnly: historyPayload.authorOwnTextOnly,
            authorHashtags: historyPayload.authorHashtags,
            retweetedHandles: historyPayload.retweetedHandles,
            quotedInteractions: historyPayload.quotedInteractions,
            observedTweetCount: historyPayload.observedTweetCount,
            referencedHandles: Array.from(profileReferencedHandles),
            links: Array.from(profileLinks),
            tweetsSample: historyPayload.tweetsSample || 'توییتی در تایم‌لاین اولیه پروفایل بارگذاری نشده است.'
          }
        });

        scanBtn.disabled = false;
        scanBtn.innerHTML = `🕵️ اسکن مجدد اصالت اکانت`;

        if (response && response.success && response.analysis) {
          if (response.faction && cleanHandle) {
            badgeDirectory.handleMap[normalizeHandleKey(cleanHandle)] = {
              faction: response.faction,
              handle: username,
              restId: response.restId || profileRestId
            };
            refreshAllVisibleMiniBadges();
          }
          const parsed = parseAccountAnalysis(response.analysis);
          renderAccountResultBox(headerContainer, banner, parsed, {
            model: response.model,
            authorHandle: username,
            displayName,
            isGreyBadge: Boolean(isGreyBadge),
            isMekAlert: response.isMekAlert,
            isFalseFlag: response.isFalseFlag,
            restId: response.restId || profileRestId,
            previousHandles: response.previousHandles || []
          });
        } else {
          renderAccountResultBox(headerContainer, banner, null, {
            isError: true,
            errorMessage: response?.message || 'خطا در ارزیابی پروفایل.'
          });
        }
      } catch (err) {
        scanBtn.disabled = false;
        scanBtn.innerHTML = `🕵️ اسکن اصالت و سابقه اکانت (Account X-Ray Bot Scout)`;
        renderAccountResultBox(headerContainer, banner, null, {
          isError: true,
          errorMessage: `خطا: ${err.message}`
        });
      }
    });

    banner.appendChild(scanBtn);
    headerContainer.appendChild(banner);
  }

  /**
   * Harvests profile header + timeline tweets on demand when background.js opens a temporary
   * background profile tab (so checking a single post in the feed gets the full profile history!).
   */
  function collectProfileSnapshotForBackground(targetHandle, doScroll = false) {
    try {
      window.postMessage({ source: 'XRAY_CONTENT_SCRIPT', type: 'REQUEST_BUFFER' }, '*');
    } catch (e) {}

    const cleanHandle = (targetHandle || '').replace('@', '').toLowerCase();
    document.querySelectorAll('article[data-testid="tweet"]').forEach(t => recordTweetInHistory(t));

    if (doScroll && document.querySelectorAll('article[data-testid="tweet"]').length > 0) {
      try {
        window.scrollBy({ top: Math.round(window.innerHeight * 1.3), behavior: 'instant' });
      } catch (e) {}
    }

    const userDescEl = document.querySelector('div[data-testid="UserDescription"]');
    const userHeaderItems = document.querySelector('div[data-testid="UserProfileHeader_Items"]');
    const userUrlEl = document.querySelector('a[data-testid="UserUrl"]');
    const joinDateEl = document.querySelector('[data-testid="UserJoinDate"]');
    const userNameEl = document.querySelector('div[data-testid="UserName"]');

    const rec = cleanHandle ? ensureAccountHistoryRecord(cleanHandle) : null;

    const domBio = userDescEl ? (userDescEl.innerText || '').trim() : '';
    const domJoinDate = joinDateEl ? (joinDateEl.innerText || '').trim() : '';
    const domUserUrl = userUrlEl ? (userUrlEl.innerText || userUrlEl.href || '').trim() : '';
    const domMetadata = userHeaderItems ? (userHeaderItems.innerText || '').trim().replace(/\n+/g, ' | ') : '';
    const domDisplayName = userNameEl ? (userNameEl.innerText.split('\n')[0] || '').trim() : '';

    const followersLink = document.querySelector('a[href*="/followers"], a[href*="/verified_followers"]');
    const followingLink = document.querySelector('a[href*="/following"]');
    const domFollowers = followersLink ? followersLink.innerText.trim().replace(/\n+/g, ' ') : '';
    const domFollowing = followingLink ? followingLink.innerText.trim().replace(/\n+/g, ' ') : '';

    if (rec) {
      if (domBio) rec.bio = domBio;
      if (domJoinDate) rec.joinDate = domJoinDate;
      if (domUserUrl) rec.userUrl = domUserUrl;
      if (domDisplayName) rec.displayName = domDisplayName;
      if (domFollowers) rec.followersRaw = domFollowers;
      if (domFollowing) rec.followingRaw = domFollowing;
    }

    const finalBio = (rec && rec.bio) || domBio || '';
    const finalJoinDate = (rec && rec.joinDate) || domJoinDate || '';
    const finalUserUrl = (rec && rec.userUrl) || domUserUrl || '';
    const finalFollowers = (rec && rec.followersRaw) || domFollowers || '';
    const finalFollowing = (rec && rec.followingRaw) || domFollowing || '';
    const finalDisplayName = (rec && rec.displayName) || domDisplayName || '';

    const historyPayload = buildAccountHistoryPayload(cleanHandle, null, finalBio);
    const rawTweets = (rec && rec.tweets)
      ? Array.from(rec.tweets.values()).map(t => ({
          text: t.text,
          hashtags: t.hashtags || [],
          isRetweet: Boolean(t.isRetweet),
          retweetedAuthor: t.retweetedAuthor || '',
          quotedAuthorHandle: t.quotedAuthorHandle || '',
          quoteText: t.quoteText || ''
        }))
      : [];

    const hasProfileHeaderLoaded = Boolean(userNameEl || userDescEl || joinDateEl || (rec && rec.bio));
    const isCachedRecStrictGov = Boolean(
      rec &&
      (Boolean(rec.isGreyBadge) || rec.verifiedType === 'Government')
    );
    const profileContainer = userNameEl ? (userNameEl.parentElement || userNameEl) : null;
    const domHeaderGreyBadge = isAuthorGreyBadge(profileContainer) || isAuthorGreyBadge(userNameEl) || isAuthorGreyBadge(document.querySelector('[data-testid="UserName"]'));
    const isGreyBadge = isCachedRecStrictGov || domHeaderGreyBadge;
    const domHeaderGoldBadge = (!isGreyBadge) && (
      isAuthorGoldBadge(profileContainer) ||
      isAuthorGoldBadge(userNameEl) ||
      isAuthorGoldBadge(document.querySelector('[data-testid="UserName"]'))
    );
    const isGoldBadge = (!isGreyBadge) && (Boolean(rec?.isGoldBadge) || domHeaderGoldBadge || rec?.verifiedType === 'Business');
    const verifiedType = isGreyBadge ? 'Government' : (isGoldBadge ? 'Business' : (rec?.verifiedType || ''));
    const governmentLabel = isGreyBadge
      ? (rec?.governmentLabel || extractAffiliateLabel(profileContainer || userNameEl) || 'حساب رسمی دولتی / حاکمیتی')
      : (isGoldBadge ? 'سازمان رسمی / شرکت ثبت‌شده (تیک طلایی)' : '');

    return {
      success: true,
      hasProfileHeaderLoaded,
      handle: cleanHandle,
      displayName: finalDisplayName,
      bio: finalBio,
      joinDate: finalJoinDate,
      userUrl: finalUserUrl,
      followersRaw: finalFollowers,
      followingRaw: finalFollowing,
      metadata: domMetadata,
      isVerified: Boolean((rec && rec.isVerified) || isAuthorVerified(userNameEl) || (profileContainer && isAuthorVerified(profileContainer)) || isGreyBadge || isGoldBadge),
      isGreyBadge,
      isGoldBadge,
      verifiedType,
      governmentLabel,
      observedTweetCount: historyPayload.observedTweetCount || rawTweets.length,
      authorOwnTextOnly: historyPayload.authorOwnTextOnly,
      authorHashtags: historyPayload.authorHashtags,
      retweetedHandles: historyPayload.retweetedHandles,
      quotedInteractions: historyPayload.quotedInteractions,
      tweetsSample: historyPayload.tweetsSample,
      rawTweets
    };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'HARVEST_PROFILE_FOR_BG') {
      const snap = collectProfileSnapshotForBackground(request.handle, Boolean(request.doScroll));
      sendResponse(snap);
      return true;
    }
    return false;
  });

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.xrayCustomAccounts || changes.xrayScannedBadgesCache || changes.xrayRestIdRegistry) {
        refreshBadgeDirectory();
      }
    });
  }

  /**
   * Scans current DOM for unhandled tweets and profile headers
   */
  function scanAndInject() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    for (let i = 0; i < tweets.length; i++) {
      recordTweetInHistory(tweets[i]);
      injectAccountCheckButton(tweets[i]);
      injectMiniBadgeOnTweet(tweets[i]);
    }
    injectProfileScanner();
  }

  /**
   * Debounced MutationObserver for performance on virtual DOM / infinite scroll
   */
  let debounceTimeout = null;
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }

    if (shouldScan) {
      if (debounceTimeout) cancelAnimationFrame(debounceTimeout);
      debounceTimeout = requestAnimationFrame(() => {
        scanAndInject();
      });
    }
  });

  // Start observing DOM changes on document.body
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    scanAndInject();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      scanAndInject();
    });
  }
})();
