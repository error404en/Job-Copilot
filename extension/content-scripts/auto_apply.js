/**
 * JobCopilot Intelligent Auto-Apply Engine (v2.0)
 * Reads and analyzes the active page to intelligently populate the ENTIRE application form:
 * - Standard Identity & Contact (Name, Email, Phone, Country, City, Address)
 * - Online Portals & Profiles (LinkedIn, GitHub, Portfolio, Twitter)
 * - Education (School, Degree, Major, Graduation Year, CGPA/GPA)
 * - Experience & Work History (Current Company, Title, Total Exp, Notice Period)
 * - Compensation Expectations (Expected CTC, Current CTC, Currency)
 * - Work Authorization & Sponsorship (Legal Right to Work, Visa Sponsorship, 18+ Age, Relocation)
 * - Dropdowns (<select>), Radio Groups & Terms Checkboxes
 * - On-Demand AI Question Solver: Reads company-specific / screening textareas from the DOM
 *   and answers them in first-person using candidate's verified resume background.
 */

(async () => {
  const bannedDomains = ['indeed.com', 'glassdoor.com', 'naukri.com'];
  if (bannedDomains.some(domain => window.location.hostname.includes(domain))) {
    return;
  }

  let cachedData = null;
  let isSolvingAI = false;

  // React/Vue/Angular-compatible native property setters
  const setNativeValue = (element, value) => {
    if (!element || value === undefined || value === null || value === '') return false;
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

  // Helper to extract full contextual hint for any form element from surrounding DOM
  const getElementHint = (el) => {
    if (!el) return '';
    const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
    const container = el.closest('.field, .form-group, fieldset, [data-automation-id], .application-question, .form-item, tr, li');
    const containerText = container ? container.innerText.slice(0, 300) : '';
    const legendEl = el.closest('fieldset')?.querySelector('legend');

    return [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('aria-labelledby'),
      el.getAttribute('autocomplete'),
      el.getAttribute('data-automation-id'),
      labelEl ? labelEl.innerText : '',
      legendEl ? legendEl.innerText : '',
      containerText
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  };

  // Detect company name and role title directly from page DOM if not known
  const detectPageJobContext = () => {
    let company = '';
    let role = '';

    // 1. Lever
    const leverHeadline = document.querySelector('.posting-headline h2');
    const leverCompany = document.querySelector('.main-header-logo img')?.getAttribute('alt') || document.querySelector('.posting-headline .company-name');
    if (leverHeadline) role = leverHeadline.innerText.trim();
    if (leverCompany) company = (typeof leverCompany === 'string' ? leverCompany : leverCompany.innerText).trim();

    // 2. Greenhouse
    const ghTitle = document.querySelector('.app-title') || document.querySelector('#header .job-title');
    const ghCompany = document.querySelector('.company-name') || document.querySelector('#header .company-name');
    if (ghTitle) role = ghTitle.innerText.trim();
    if (ghCompany) company = ghCompany.innerText.trim();

    // 3. Ashby
    const ashbyHeader = document.querySelector('h1, h2');
    if (ashbyHeader && window.location.hostname.includes('ashby')) {
      role = ashbyHeader.innerText.trim();
      const parts = window.location.pathname.split('/');
      if (parts[1]) company = parts[1].replace(/[-_]/g, ' ');
    }

    // 4. Workday
    const wdTitle = document.querySelector('[data-automation-id="jobPostingHeader"]');
    if (wdTitle) role = wdTitle.innerText.trim();

    // 5. Generic Document Title fallback
    if (!role && document.title) {
      const titleParts = document.title.split(/[-–|·at]/i).map(s => s.trim()).filter(Boolean);
      if (titleParts.length >= 2) {
        role = titleParts[0];
        company = titleParts[1];
      } else if (titleParts.length === 1) {
        role = titleParts[0];
      }
    }

    return { company, role };
  };

  // Scans the page and executes deterministic auto-fill across all supported field types
  const executeAutoFill = (data, overwrite = false) => {
    if (!data) return { filledCount: 0, customQuestions: [] };
    let filledCount = 0;
    const fullName = data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim();

    // --- 1. Text Inputs & Textareas ---
    const textInputs = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea'
      )
    );

    const customQuestions = [];

    for (const el of textInputs) {
      if (!overwrite && el.value && el.value.trim().length > 0) continue;
      const hint = getElementHint(el);

      // Textareas
      if (el.tagName === 'TEXTAREA') {
        if (/cover|letter|additional|comment|note|summary/i.test(hint) && data.cover_letter) {
          if (setNativeValue(el, data.cover_letter)) filledCount++;
        } else if (/why.*(join|work|company|interest|us)|motivat|fit/i.test(hint) && (data.why_company_pitch || data.cover_letter)) {
          if (setNativeValue(el, data.why_company_pitch || data.cover_letter)) filledCount++;
        } else {
          // Unfilled open-ended / screening question eligible for AI solving
          const questionLabel = (el.closest('label')?.innerText || el.getAttribute('aria-label') || el.placeholder || el.name || 'Question').trim();
          if (questionLabel.length > 5 && !customQuestions.some(q => q.element === el)) {
            customQuestions.push({
              id: el.id || el.name || `ai_q_${customQuestions.length}`,
              label: questionLabel,
              field_type: 'textarea',
              element: el
            });
          }
        }
        continue;
      }

      // First Name
      if (/first.*name|given.*name|fname|forename|legalnametablesection.*first|candidate.*first/i.test(hint)) {
        if (setNativeValue(el, data.first_name)) filledCount++;
      }
      // Last Name
      else if (/last.*name|family.*name|surname|lname|legalnametablesection.*last|candidate.*last/i.test(hint)) {
        if (setNativeValue(el, data.last_name)) filledCount++;
      }
      // Full Name
      else if (/\bname\b|full.*name|candidate.*name|legal.*name/i.test(hint) && !/company|school|university|refer|employer|friend|recruiter/i.test(hint)) {
        if (setNativeValue(el, fullName)) filledCount++;
      }
      // Email
      else if (el.type === 'email' || /email|e-mail/i.test(hint)) {
        if (setNativeValue(el, data.email)) filledCount++;
      }
      // Phone
      else if (el.type === 'tel' || /phone|mobile|contact.*number|cell|telephone/i.test(hint)) {
        if (setNativeValue(el, data.phone)) filledCount++;
      }
      // Links
      else if (/linkedin|li.*url/i.test(hint)) {
        if (setNativeValue(el, data.linkedin_url)) filledCount++;
      } else if (/github|git.*url|gh.*profile/i.test(hint)) {
        if (setNativeValue(el, data.github_url)) filledCount++;
      } else if (/portfolio|website|personal.*url|blog|web.*site/i.test(hint) && !/linkedin|github/i.test(hint)) {
        if (setNativeValue(el, data.portfolio_url || data.github_url)) filledCount++;
      } else if (/twitter|x\.com/i.test(hint)) {
        if (setNativeValue(el, data.twitter_url || '')) filledCount++;
      }
      // Location
      else if (/city|current.*location/i.test(hint)) {
        if (setNativeValue(el, data.city || data.location)) filledCount++;
      } else if (/state|province|region/i.test(hint)) {
        if (setNativeValue(el, data.state || '')) filledCount++;
      } else if (/postal|zip|pincode|pin.*code/i.test(hint)) {
        if (setNativeValue(el, data.postal_code || '201301')) filledCount++;
      } else if (/street|address/i.test(hint) && !/email/i.test(hint)) {
        if (setNativeValue(el, data.location)) filledCount++;
      }
      // Education
      else if (/school|university|college|institution/i.test(hint)) {
        if (setNativeValue(el, data.school)) filledCount++;
      } else if (/degree|qualification|study.*level/i.test(hint)) {
        if (setNativeValue(el, data.degree)) filledCount++;
      } else if (/major|discipline|field.*study|specialization/i.test(hint)) {
        if (setNativeValue(el, data.major)) filledCount++;
      } else if (/grad.*year|end.*date|completion.*year|year.*pass/i.test(hint)) {
        if (setNativeValue(el, data.grad_year || '2027')) filledCount++;
      } else if (/gpa|cgpa|grade|percentage/i.test(hint)) {
        if (setNativeValue(el, data.gpa || '8.5')) filledCount++;
      }
      // Experience & Compensation
      else if (/current.*company|recent.*company|employer|current.*org/i.test(hint)) {
        if (setNativeValue(el, data.current_company)) filledCount++;
      } else if (/current.*title|job.*title|designation|current.*role/i.test(hint)) {
        if (setNativeValue(el, data.current_title)) filledCount++;
      } else if (/years.*exp|total.*exp|work.*exp/i.test(hint)) {
        if (setNativeValue(el, data.years_of_experience || '1')) filledCount++;
      } else if (/notice.*period|availability|available.*start/i.test(hint)) {
        if (setNativeValue(el, data.notice_period || 'Immediate / 15 Days')) filledCount++;
      } else if (/expected.*salary|expected.*ctc|desired.*salary|salary.*expectation/i.test(hint)) {
        if (setNativeValue(el, data.expected_salary || '12,00,000')) filledCount++;
      } else if (/current.*salary|current.*ctc/i.test(hint)) {
        if (setNativeValue(el, data.current_salary || '0')) filledCount++;
      }
    }

    // --- 2. Select Dropdowns ---
    const selects = Array.from(document.querySelectorAll('select'));
    for (const sel of selects) {
      const hint = getElementHint(sel);
      const options = Array.from(sel.options);
      let matchedIndex = -1;

      if (/country|nationality/i.test(hint)) {
        matchedIndex = options.findIndex(o => /india/i.test(o.text || o.value));
      } else if (/authoriz|right.*to.*work|eligible.*work/i.test(hint)) {
        matchedIndex = options.findIndex(o => /^yes\b|authorized/i.test(o.text || o.value));
      } else if (/sponsor|visa/i.test(hint)) {
        matchedIndex = options.findIndex(o => /^no\b|not.*require|will.*not/i.test(o.text || o.value));
      } else if (/gender|sex/i.test(hint)) {
        matchedIndex = options.findIndex(o => /^male\b|man/i.test(o.text || o.value));
        if (matchedIndex === -1) matchedIndex = options.findIndex(o => /decline|prefer.*not/i.test(o.text || o.value));
      } else if (/veteran/i.test(hint)) {
        matchedIndex = options.findIndex(o => /not.*veteran|i am not/i.test(o.text || o.value));
        if (matchedIndex === -1) matchedIndex = options.findIndex(o => /decline/i.test(o.text || o.value));
      } else if (/disability/i.test(hint)) {
        matchedIndex = options.findIndex(o => /no.*disability|do not have/i.test(o.text || o.value));
        if (matchedIndex === -1) matchedIndex = options.findIndex(o => /decline/i.test(o.text || o.value));
      } else if (/race|ethnicity/i.test(hint)) {
        matchedIndex = options.findIndex(o => /asian|indian/i.test(o.text || o.value));
        if (matchedIndex === -1) matchedIndex = options.findIndex(o => /decline|prefer.*not/i.test(o.text || o.value));
      } else if (/hear.*about|source|referral/i.test(hint)) {
        matchedIndex = options.findIndex(o => /linkedin|job.*board|company.*site|careers/i.test(o.text || o.value));
      } else if (/notice.*period|availability/i.test(hint)) {
        matchedIndex = options.findIndex(o => /immediate|<.*30|15.*days|1.*month/i.test(o.text || o.value));
      } else if (/degree|education.*level/i.test(hint)) {
        matchedIndex = options.findIndex(o => /bachelor|undergraduate|b\.tech/i.test(o.text || o.value));
      }

      if (matchedIndex > 0 && sel.selectedIndex !== matchedIndex) {
        sel.selectedIndex = matchedIndex;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('blur', { bubbles: true }));
        sel.style.outline = '2px solid #10b981';
        sel.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
        filledCount++;
      }
    }

    // --- 3. Radio Buttons (Work Auth, Sponsorship, Relocation, 18+) ---
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    const radioGroups = {};
    for (const r of radios) {
      const key = r.name || r.id;
      if (!radioGroups[key]) radioGroups[key] = [];
      radioGroups[key].push(r);
    }

    for (const key in radioGroups) {
      const group = radioGroups[key];
      const groupHint = group.map(r => getElementHint(r)).join(' ');
      let targetPattern = null;

      if (/authoriz|right.*to.*work|18.*years|relocate|hybrid|consent/i.test(groupHint)) {
        targetPattern = /^yes\b|authorized|agree/i;
      } else if (/sponsor|visa|previously.*worked|convicted/i.test(groupHint)) {
        targetPattern = /^no\b|not.*require|never/i;
      } else if (/gender|sex/i.test(groupHint)) {
        targetPattern = /^male\b|man|decline/i;
      } else if (/veteran/i.test(groupHint)) {
        targetPattern = /not.*veteran|decline/i;
      } else if (/disability/i.test(groupHint)) {
        targetPattern = /no.*disability|decline/i;
      }

      if (targetPattern) {
        for (const r of group) {
          const rHint = getElementHint(r);
          if (targetPattern.test(rHint) || targetPattern.test(r.value)) {
            if (!r.checked) {
              r.checked = true;
              r.dispatchEvent(new Event('change', { bubbles: true }));
              r.dispatchEvent(new Event('click', { bubbles: true }));
              filledCount++;
            }
            break;
          }
        }
      }
    }

    // --- 4. Consent / Terms Checkboxes ---
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    for (const cb of checkboxes) {
      const hint = getElementHint(cb);
      if (/terms|privacy|consent|agree|acknowledge|certify|declaration/i.test(hint) && !cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        cb.dispatchEvent(new Event('click', { bubbles: true }));
        filledCount++;
      }
    }

    return { filledCount, customQuestions };
  };

  // Triggers AI Question Solving for custom/screening questions
  const solveCustomQuestionsWithAI = async (questions, jobContext, data, onProgress) => {
    if (!questions || questions.length === 0 || isSolvingAI) return 0;
    isSolvingAI = true;

    try {
      if (onProgress) onProgress('Analyzing questions with candidate resume...');

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: 'fetchBackend',
            url: '/api/auto-apply/solve-questions',
            method: 'POST',
            body: {
              url: window.location.href,
              company: jobContext.company || data.company,
              role_title: jobContext.role || data.role_title,
              job_id: data.job_id,
              questions: questions.map(q => ({
                id: q.id,
                label: q.label,
                field_type: q.field_type
              }))
            }
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

      if (!response || !response.success || !response.data || !response.data.answers) {
        throw new Error(response?.error || 'Failed to solve questions with AI');
      }

      const answers = response.data.answers;
      let aiFilledCount = 0;

      for (const q of questions) {
        const ans = answers[q.id];
        if (ans && q.element) {
          if (setNativeValue(q.element, ans)) {
            aiFilledCount++;
            // Attach subtle visual AI badge
            const badge = document.createElement('div');
            badge.innerText = '✨ AI Generated';
            badge.style.cssText = 'font-size:10px;font-weight:700;color:#a78bfa;margin-top:2px;font-family:system-ui,sans-serif;';
            q.element.parentNode?.insertBefore(badge, q.element.nextSibling);
          }
        }
      }

      return aiFilledCount;
    } catch (e) {
      console.error('[JobCopilot] AI Solve Error:', e);
      return 0;
    } finally {
      isSolvingAI = false;
    }
  };

  // Mounts or updates the interactive floating HUD pill matching the dark luxury design system
  const mountHudWidget = (data, initialFilled, customQuestions = []) => {
    let hud = document.getElementById('jobcopilot-autofill-hud');
    const jobContext = detectPageJobContext();
    const companyDisplay = jobContext.company || data?.company || 'Application';

    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'jobcopilot-autofill-hud';
      hud.style.cssText =
        'position:fixed;bottom:24px;right:24px;z-index:2147483647;background:rgba(10,11,15,0.92);color:#F3EFE7;border:1px solid rgba(255,255,255,0.14);border-radius:9999px;padding:6px 10px 6px 14px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:12px;box-shadow:0 16px 40px rgba(0,0,0,0.75),0 0 0 1px rgba(255,255,255,0.06),inset 0 1px 0 rgba(255,255,255,0.1);display:flex;align-items:center;gap:12px;transition:all 0.25s cubic-bezier(0.16,1,0.3,1);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px);-webkit-font-smoothing:antialiased;';
      document.body.appendChild(hud);
    }

    hud.innerHTML = '';

    // Status area
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:145px;';
    statusDiv.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="width:20px;height:20px;border-radius:6px;background:#F3EFE7;color:#0A0A0C;font-weight:800;font-size:10px;display:flex;align-items:center;justify-content:center;letter-spacing:-0.03em;font-family:ui-monospace,monospace;">JC</div>
        <span style="font-weight:700;color:#F3EFE7;letter-spacing:-0.02em;font-size:12px;">jobcopilot</span>
        <span style="font-size:10px;padding:1px 7px;border-radius:999px;background:rgba(140,151,255,0.12);color:#8C97FF;border:1px solid rgba(140,151,255,0.3);font-family:ui-monospace,monospace;font-weight:600;text-transform:uppercase;">${companyDisplay.slice(0, 16)}</span>
      </div>
      <div id="jobcopilot-hud-status" style="display:flex;align-items:center;gap:5px;font-size:11px;font-family:ui-monospace,monospace;">
        ${
          initialFilled > 0
            ? `<span style="width:6px;height:6px;border-radius:50%;background:#5EEAA8;box-shadow:0 0 6px #5EEAA8;"></span><span style="color:#5EEAA8;font-weight:600;">Filled ${initialFilled} field(s)</span>`
            : `<span style="width:6px;height:6px;border-radius:50%;background:#8C97FF;"></span><span style="color:#A8A59D;">Page Analyzed · Ready</span>`
        }
      </div>
    `;

    // Action 1: Re-scan / Auto-Fill
    const fillBtn = document.createElement('button');
    fillBtn.type = 'button';
    fillBtn.innerText = initialFilled > 0 ? '⚡ Re-Fill Form' : '⚡ Auto-Fill Form';
    fillBtn.style.cssText =
      'background:#F3EFE7;color:#0A0A0C;border:none;border-radius:999px;padding:7px 15px;font-weight:600;font-size:11px;cursor:pointer;white-space:nowrap;transition:all 0.2s cubic-bezier(0.16,1,0.3,1);box-shadow:0 2px 8px rgba(0,0,0,0.35);font-family:inherit;display:inline-flex;align-items:center;gap:4px;';
    fillBtn.onmouseenter = () => {
      fillBtn.style.background = '#FFFFFF';
      fillBtn.style.transform = 'translateY(-1px)';
      fillBtn.style.boxShadow = '0 4px 12px rgba(255,255,255,0.2)';
    };
    fillBtn.onmouseleave = () => {
      fillBtn.style.background = '#F3EFE7';
      fillBtn.style.transform = 'none';
      fillBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
    };
    fillBtn.onclick = () => {
      const res = executeAutoFill(data, true);
      const statusContainer = document.getElementById('jobcopilot-hud-status');
      if (statusContainer) {
        statusContainer.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#5EEAA8;box-shadow:0 0 6px #5EEAA8;"></span><span style="color:#5EEAA8;font-weight:600;">Filled ${res.filledCount} field(s)</span>`;
      }
      fillBtn.innerText = '⚡ Re-Fill Form';
      if (res.customQuestions.length > 0 && aiBtn) {
        aiBtn.style.display = 'inline-flex';
        aiBtn.innerText = `✨ AI Answer (${res.customQuestions.length})`;
      }
    };

    // Action 2: AI Solve Custom Questions (if any open textareas exist)
    const aiBtn = document.createElement('button');
    aiBtn.type = 'button';
    aiBtn.innerText = `✨ AI Answer (${customQuestions.length})`;
    aiBtn.style.cssText = `background:rgba(140,151,255,0.14);color:#C9CCFF;border:1px solid rgba(140,151,255,0.35);border-radius:999px;padding:7px 13px;font-weight:600;font-size:11px;cursor:pointer;white-space:nowrap;display:${customQuestions.length > 0 ? 'inline-flex' : 'none'};align-items:center;gap:4px;font-family:inherit;transition:all 0.2s;`;
    aiBtn.onmouseenter = () => {
      aiBtn.style.background = 'rgba(140,151,255,0.24)';
      aiBtn.style.transform = 'translateY(-1px)';
    };
    aiBtn.onmouseleave = () => {
      aiBtn.style.background = 'rgba(140,151,255,0.14)';
      aiBtn.style.transform = 'none';
    };
    aiBtn.onclick = async () => {
      aiBtn.disabled = true;
      aiBtn.innerText = '✨ Generating...';
      const statusContainer = document.getElementById('jobcopilot-hud-status');
      if (statusContainer) {
        statusContainer.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#8C97FF;animation:pulse 1.5s infinite;"></span><span style="color:#C9CCFF;">AI drafting from resume...</span>`;
      }

      const aiCount = await solveCustomQuestionsWithAI(customQuestions, jobContext, data);
      if (statusContainer) {
        statusContainer.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#5EEAA8;box-shadow:0 0 6px #5EEAA8;"></span><span style="color:#5EEAA8;font-weight:600;">Solved ${aiCount} question(s)</span>`;
      }
      aiBtn.innerText = `✓ Done (${aiCount})`;
      setTimeout(() => {
        aiBtn.style.display = 'none';
      }, 3000);
    };

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerText = '×';
    closeBtn.title = 'Dismiss Copilot HUD';
    closeBtn.style.cssText =
      'width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#A8A59D;font-size:14px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;line-height:1;transition:all 0.15s;padding:0;';
    closeBtn.onmouseenter = () => {
      closeBtn.style.background = 'rgba(255,255,255,0.12)';
      closeBtn.style.color = '#F3EFE7';
      closeBtn.style.borderColor = 'rgba(255,255,255,0.2)';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.background = 'rgba(255,255,255,0.06)';
      closeBtn.style.color = '#A8A59D';
      closeBtn.style.borderColor = 'rgba(255,255,255,0.1)';
    };
    closeBtn.onclick = () => hud.remove();

    hud.appendChild(statusDiv);
    hud.appendChild(fillBtn);
    hud.appendChild(aiBtn);
    hud.appendChild(closeBtn);
  };

  // Main execution on page load
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
      const { filledCount, customQuestions } = executeAutoFill(cachedData, false);
      mountHudWidget(cachedData, filledCount, customQuestions);
    }
  } catch (err) {
    console.error('[JobCopilot] Auto-Apply initialization error:', err);
  }

  // Listen for manual triggers from the extension popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'triggerAutoFillNow') {
      const payload = msg.data || cachedData;
      const { filledCount, customQuestions } = executeAutoFill(payload, true);
      if (payload) mountHudWidget(payload, filledCount, customQuestions);
      sendResponse({ success: true, filledCount, customQuestionsCount: customQuestions.length });
    }
  });
})();
