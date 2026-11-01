/**
 * JobCopilot Live Auto-Fill Module (v1.2)
 * Supports Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Keka, Yello, MyNextHire, Superset & standard HTML5 forms.
 * Renders a non-intrusive floating HUD pill and NEVER auto-submits forms without user confirmation.
 */

(async () => {
  const bannedDomains = ['indeed.com', 'glassdoor.com', 'naukri.com'];
  if (bannedDomains.some(domain => window.location.hostname.includes(domain))) {
    return;
  }

  let cachedData = null;

  const setNativeValue = (element, value) => {
    if (!element || !value) return false;
    try {
      const proto = Object.getPrototypeOf(element);
      const setter = (Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(element, 'value'))?.set;
      if (setter) {
        setter.call(element, value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      element.style.outline = '2px solid #10b981';
      element.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
      return true;
    } catch (e) {
      return false;
    }
  };

  const executeAutoFill = (data, overwrite = false) => {
    if (!data) return 0;
    let filledCount = 0;
    const fullName = data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim();

    const inputs = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea'
      )
    );

    for (const el of inputs) {
      if (!overwrite && el.value && el.value.trim().length > 0) continue;
      const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
      const hint = [
        el.name,
        el.id,
        el.placeholder,
        el.getAttribute('aria-label'),
        el.getAttribute('autocomplete'),
        el.getAttribute('data-automation-id'),
        labelEl ? labelEl.innerText : ''
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (el.tagName === 'TEXTAREA') {
        if (/cover|letter|additional|comment|note|summary/i.test(hint) && data.cover_letter) {
          if (setNativeValue(el, data.cover_letter)) filledCount++;
        } else if (/why|interest|motivat|fit/i.test(hint) && (data.why_company_pitch || data.cover_letter)) {
          if (setNativeValue(el, data.why_company_pitch || data.cover_letter)) filledCount++;
        }
        continue;
      }

      if (/first.*name|given.*name|fname|legalnametablesection.*first/i.test(hint)) {
        if (setNativeValue(el, data.first_name)) filledCount++;
      } else if (/last.*name|family.*name|surname|lname|legalnametablesection.*last/i.test(hint)) {
        if (setNativeValue(el, data.last_name)) filledCount++;
      } else if (/\bname\b|full.*name|candidate.*name/i.test(hint) && !/company|school|university|refer|employer/i.test(hint)) {
        if (setNativeValue(el, fullName)) filledCount++;
      } else if (el.type === 'email' || /email|e-mail/i.test(hint)) {
        if (setNativeValue(el, data.email)) filledCount++;
      } else if (el.type === 'tel' || /phone|mobile|contact.*number|cell/i.test(hint)) {
        if (setNativeValue(el, data.phone)) filledCount++;
      } else if (/linkedin/i.test(hint)) {
        if (setNativeValue(el, data.linkedin_url)) filledCount++;
      } else if (/github|git/i.test(hint)) {
        if (setNativeValue(el, data.github_url)) filledCount++;
      } else if (/portfolio|website|personal.*url|blog/i.test(hint)) {
        if (setNativeValue(el, data.portfolio_url || data.github_url)) filledCount++;
      } else if (/city|current.*location|address/i.test(hint)) {
        if (setNativeValue(el, data.location)) filledCount++;
      }
    }

    return filledCount;
  };

  const mountHudWidget = (data, initialFilled) => {
    if (document.getElementById('jobcopilot-autofill-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'jobcopilot-autofill-hud';
    hud.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:2147483646;background:#09090b;color:#f4f4f5;border:1px solid #3f3f46;border-radius:16px;padding:12px 14px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;box-shadow:0 12px 32px rgba(0,0,0,0.55);display:flex;align-items:center;gap:10px;';

    const statusSpan = document.createElement('span');
    statusSpan.innerHTML = `<strong style="color:#a5b4fc;">🤖 JobCopilot</strong> <span style="color:#a1a1aa;">${
      initialFilled > 0 ? `Filled ${initialFilled} field(s)` : 'Ready to Auto-Fill'
    }</span>`;

    const fillBtn = document.createElement('button');
    fillBtn.type = 'button';
    fillBtn.innerText = '⚡ Auto-Fill Form';
    fillBtn.style.cssText =
      'background:linear-gradient(135deg,#4f46e5,#0d9488);color:#fff;border:none;border-radius:10px;padding:6px 12px;font-weight:700;font-size:11px;cursor:pointer;';
    fillBtn.onclick = () => {
      const count = executeAutoFill(data, true);
      statusSpan.innerHTML = `<strong style="color:#34d399;">✓ Filled ${count} field(s)</strong>`;
    };

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerText = '×';
    closeBtn.style.cssText =
      'background:transparent;color:#71717a;border:none;font-size:15px;font-weight:700;cursor:pointer;padding:0 4px;';
    closeBtn.onclick = () => hud.remove();

    hud.appendChild(statusSpan);
    hud.appendChild(fillBtn);
    hud.appendChild(closeBtn);
    document.body.appendChild(hud);
  };

  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'fetchBackend',
          url: `/api/auto-apply/data?url=${encodeURIComponent(window.location.href)}`
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp);
          }
        }
      );
    });

    if (response && response.success && response.data && response.data.enabled) {
      cachedData = response.data;
      const initialFilled = executeAutoFill(cachedData, false);
      mountHudWidget(cachedData, initialFilled);
    }
  } catch (err) {
    console.error('JobCopilot Auto-Apply Error:', err);
  }

  // Listen for manual trigger from extension popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'triggerAutoFillNow') {
      const payload = msg.data || cachedData;
      const count = executeAutoFill(payload, true);
      if (payload) mountHudWidget(payload, count);
      sendResponse({ success: true, filledCount: count });
    }
  });
})();
