let cachedAutofillData = null;
let detectedQuestions = [];

// Initialize popup on load
(async () => {
  const status = document.getElementById('status');
  const resumePill = document.getElementById('resumePill');
  const resumeTitle = document.getElementById('resumeTitle');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    const session = await getAuthSession();
    if (!session || !session.token) return;

    const res = await fetch(`${session.backendUrl}/api/auto-apply/data?url=${encodeURIComponent(tab.url)}`, {
      headers: { 'Authorization': `Bearer ${session.token}` }
    });

    if (res.ok) {
      cachedAutofillData = await res.json();
      if (cachedAutofillData && cachedAutofillData.recommended_resume_title) {
        resumeTitle.innerText = cachedAutofillData.recommended_resume_title;
        resumePill.style.display = 'block';
      }
    }
  } catch (e) {
    console.warn('[JobCopilot Popup] Prefetch error:', e);
  }
})();

// 1. Smart Auto-Fill Button
document.getElementById('autofillBtn')?.addEventListener('click', async () => {
  const fillBtn = document.getElementById('autofillBtn');
  const aiBtn = document.getElementById('aiSolveBtn');
  const dashBtn = document.getElementById('dashboardBtn');
  const status = document.getElementById('status');
  const errDiv = document.getElementById('error');
  const resumePill = document.getElementById('resumePill');
  const resumeTitle = document.getElementById('resumeTitle');

  fillBtn.disabled = true;
  fillBtn.innerText = 'Scanning Page...';
  errDiv.style.display = 'none';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('Could not detect active tab.');

    const session = await getAuthSession();
    if (!session || !session.token) {
      dashBtn.onclick = () => chrome.tabs.create({ url: CLOUD_CONFIG.dashboardUrl });
      dashBtn.style.display = 'block';
      throw new Error('Please sign into your JobCopilot dashboard first.');
    }

    if (!cachedAutofillData) {
      fillBtn.innerText = 'Fetching Profile...';
      const res = await fetch(`${session.backendUrl}/api/auto-apply/data?url=${encodeURIComponent(tab.url || '')}`, {
        headers: { 'Authorization': `Bearer ${session.token}` }
      });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      cachedAutofillData = await res.json();
    }

    const data = cachedAutofillData;
    if (data.recommended_resume_title) {
      resumeTitle.innerText = data.recommended_resume_title;
      resumePill.style.display = 'block';
    }

    fillBtn.innerText = 'Filling Form...';

    // Comprehensive page scanner and filler injected into tab
    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [data],
      func: (d) => {
        const setVal = (el, val) => {
          if (!el || val === undefined || val === null || val === '') return false;
          try {
            const proto = Object.getPrototypeOf(el);
            const setter = (Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(el, 'value'))?.set;
            if (setter) setter.call(el, val); else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            el.style.outline = '2px solid #10b981';
            el.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
            return true;
          } catch (e) { return false; }
        };

        const getHint = (el) => {
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
          ].filter(Boolean).join(' ').toLowerCase();
        };

        let count = 0;
        const customQ = [];
        const fullName = d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim();

        // 1. Text Inputs & Textareas
        const textInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea'));
        for (const el of textInputs) {
          const hint = getHint(el);

          if (el.tagName === 'TEXTAREA') {
            if (/cover|letter|additional|comment|note|summary/i.test(hint) && d.cover_letter) {
              if (setVal(el, d.cover_letter)) count++;
            } else if (/why.*(join|work|company|interest|us)|motivat|fit/i.test(hint) && (d.why_company_pitch || d.cover_letter)) {
              if (setVal(el, d.why_company_pitch || d.cover_letter)) count++;
            } else if (!el.value || el.value.trim().length === 0) {
              const label = (el.closest('label')?.innerText || el.getAttribute('aria-label') || el.placeholder || el.name || 'Question').trim();
              if (label.length > 5) {
                customQ.push({ id: el.id || el.name || `ai_q_${customQ.length}`, label });
              }
            }
            continue;
          }

          if (el.value && el.value.trim().length > 0) continue;

          // Identity
          if (/first.*name|given.*name|fname|legalnametablesection.*first/i.test(hint)) { if (setVal(el, d.first_name)) count++; }
          else if (/last.*name|family.*name|surname|lname|legalnametablesection.*last/i.test(hint)) { if (setVal(el, d.last_name)) count++; }
          else if (/\bname\b|full.*name|candidate.*name/i.test(hint) && !/company|school|university|refer|employer/i.test(hint)) { if (setVal(el, fullName)) count++; }
          else if (el.type === 'email' || /email|e-mail/i.test(hint)) { if (setVal(el, d.email)) count++; }
          else if (el.type === 'tel' || /phone|mobile|contact.*number|cell/i.test(hint)) { if (setVal(el, d.phone)) count++; }
          
          // Links
          else if (/linkedin/i.test(hint)) { if (setVal(el, d.linkedin_url)) count++; }
          else if (/github|git/i.test(hint)) { if (setVal(el, d.github_url)) count++; }
          else if (/portfolio|personal.*url|website|blog/i.test(hint) && !/linkedin|github/i.test(hint)) { if (setVal(el, d.portfolio_url || d.github_url)) count++; }
          else if (/twitter|x\.com/i.test(hint)) { if (setVal(el, d.twitter_url || '')) count++; }

          // Location
          else if (/city|current.*location/i.test(hint)) { if (setVal(el, d.city || d.location)) count++; }
          else if (/state|province|region/i.test(hint)) { if (setVal(el, d.state || '')) count++; }
          else if (/postal|zip|pincode/i.test(hint)) { if (setVal(el, d.postal_code || '201301')) count++; }
          else if (/address/i.test(hint) && !/email/i.test(hint)) { if (setVal(el, d.location)) count++; }

          // Education
          else if (/school|university|college/i.test(hint)) { if (setVal(el, d.school)) count++; }
          else if (/degree|qualification/i.test(hint)) { if (setVal(el, d.degree)) count++; }
          else if (/major|discipline|field.*study/i.test(hint)) { if (setVal(el, d.major)) count++; }
          else if (/grad.*year|end.*date|completion.*year/i.test(hint)) { if (setVal(el, d.grad_year || '2027')) count++; }
          else if (/gpa|cgpa|grade/i.test(hint)) { if (setVal(el, d.gpa || '8.5')) count++; }

          // Experience & Comp
          else if (/current.*company|recent.*company|employer/i.test(hint)) { if (setVal(el, d.current_company)) count++; }
          else if (/current.*title|job.*title|designation/i.test(hint)) { if (setVal(el, d.current_title)) count++; }
          else if (/years.*exp|total.*exp/i.test(hint)) { if (setVal(el, d.years_of_experience || '1')) count++; }
          else if (/notice.*period|availability/i.test(hint)) { if (setVal(el, d.notice_period || 'Immediate / 15 Days')) count++; }
          else if (/expected.*salary|expected.*ctc/i.test(hint)) { if (setVal(el, d.expected_salary || '12,00,000')) count++; }
        }

        // 2. Selects
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
          const hint = getHint(sel);
          const options = Array.from(sel.options);
          let matchedIndex = -1;

          if (/country/i.test(hint)) {
            matchedIndex = options.findIndex(o => /india/i.test(o.text || o.value));
          } else if (/authoriz|right.*to.*work|eligible.*work/i.test(hint)) {
            matchedIndex = options.findIndex(o => /^yes\b|authorized/i.test(o.text || o.value));
          } else if (/sponsor|visa/i.test(hint)) {
            matchedIndex = options.findIndex(o => /^no\b|not.*require|will.*not/i.test(o.text || o.value));
          } else if (/gender|sex/i.test(hint)) {
            matchedIndex = options.findIndex(o => /^male\b|man/i.test(o.text || o.value)) || options.findIndex(o => /decline/i.test(o.text || o.value));
          } else if (/veteran/i.test(hint)) {
            matchedIndex = options.findIndex(o => /not.*veteran|i am not/i.test(o.text || o.value)) || options.findIndex(o => /decline/i.test(o.text || o.value));
          } else if (/disability/i.test(hint)) {
            matchedIndex = options.findIndex(o => /no.*disability|do not have/i.test(o.text || o.value)) || options.findIndex(o => /decline/i.test(o.text || o.value));
          } else if (/hear.*about|source/i.test(hint)) {
            matchedIndex = options.findIndex(o => /linkedin|job.*board|company.*site/i.test(o.text || o.value));
          } else if (/notice.*period/i.test(hint)) {
            matchedIndex = options.findIndex(o => /immediate|<.*30|15.*days|1.*month/i.test(o.text || o.value));
          } else if (/degree|education/i.test(hint)) {
            matchedIndex = options.findIndex(o => /bachelor|undergraduate|b\.tech/i.test(o.text || o.value));
          }

          if (matchedIndex > 0 && sel.selectedIndex !== matchedIndex) {
            sel.selectedIndex = matchedIndex;
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sel.dispatchEvent(new Event('blur', { bubbles: true }));
            sel.style.outline = '2px solid #10b981';
            count++;
          }
        }

        // 3. Radios
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        const radioGroups = {};
        for (const r of radios) {
          const key = r.name || r.id;
          if (!radioGroups[key]) radioGroups[key] = [];
          radioGroups[key].push(r);
        }

        for (const key in radioGroups) {
          const group = radioGroups[key];
          const groupHint = group.map(r => getHint(r)).join(' ');
          let targetPattern = null;

          if (/authoriz|right.*to.*work|18.*years|relocate|hybrid|consent/i.test(groupHint)) {
            targetPattern = /^yes\b|authorized|agree/i;
          } else if (/sponsor|visa|previously.*worked|convicted/i.test(groupHint)) {
            targetPattern = /^no\b|not.*require|never/i;
          }

          if (targetPattern) {
            for (const r of group) {
              const rHint = getHint(r);
              if (targetPattern.test(rHint) || targetPattern.test(r.value)) {
                if (!r.checked) {
                  r.checked = true;
                  r.dispatchEvent(new Event('change', { bubbles: true }));
                  r.dispatchEvent(new Event('click', { bubbles: true }));
                  count++;
                }
                break;
              }
            }
          }
        }

        // 4. Checkboxes (Terms / Consent)
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        for (const cb of checkboxes) {
          const hint = getHint(cb);
          if (/terms|privacy|consent|agree|acknowledge|certify/i.test(hint) && !cb.checked) {
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            cb.dispatchEvent(new Event('click', { bubbles: true }));
            count++;
          }
        }

        return { filledCount: count, customQuestions: customQ };
      }
    });

    const result = injection?.[0]?.result || { filledCount: 0, customQuestions: [] };
    const filledCount = result.filledCount || 0;
    detectedQuestions = result.customQuestions || [];

    status.innerHTML = `<strong style="color:#34d399;">✓ Auto-filled ${filledCount} field(s)!</strong><br>Inputs, dropdowns, and radio options populated. Review & attach your resume before submitting.`;
    fillBtn.innerText = `✓ Filled ${filledCount} Field(s)`;
    fillBtn.disabled = false;

    if (detectedQuestions.length > 0) {
      aiBtn.style.display = 'flex';
      aiBtn.innerText = `✨ AI Answer Questions (${detectedQuestions.length})`;
    } else {
      aiBtn.style.display = 'none';
    }

  } catch (err) {
    errDiv.innerText = err.message || 'Auto-fill failed';
    errDiv.style.display = 'block';
    fillBtn.disabled = false;
    fillBtn.innerText = '⚡ Smart Auto-Fill Form';
  }
});

// 2. AI Question Solver Button
document.getElementById('aiSolveBtn')?.addEventListener('click', async () => {
  const aiBtn = document.getElementById('aiSolveBtn');
  const status = document.getElementById('status');
  const errDiv = document.getElementById('error');

  if (!detectedQuestions || detectedQuestions.length === 0) return;

  aiBtn.disabled = true;
  aiBtn.innerText = '✨ AI Drafting Answers...';
  status.innerText = 'Generating tailored responses from your verified projects and experience...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const session = await getAuthSession();
    if (!session || !session.token) throw new Error('Not logged into JobCopilot.');

    const res = await fetch(`${session.backendUrl}/api/auto-apply/solve-questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({
        url: tab.url,
        company: cachedAutofillData?.company || '',
        role_title: cachedAutofillData?.role_title || '',
        job_id: cachedAutofillData?.job_id,
        questions: detectedQuestions.map(q => ({
          id: q.id,
          label: q.label,
          field_type: 'textarea'
        }))
      })
    });

    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const solveData = await res.json();
    const answers = solveData.answers || {};

    // Inject answers into the tab
    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [answers],
      func: (ansMap) => {
        let count = 0;
        const setVal = (el, val) => {
          if (!el || !val) return false;
          try {
            const proto = Object.getPrototypeOf(el);
            const setter = (Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(el, 'value'))?.set;
            if (setter) setter.call(el, val); else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            el.style.outline = '2px solid #a855f7';
            el.style.backgroundColor = 'rgba(168, 85, 247, 0.08)';
            return true;
          } catch (e) { return false; }
        };

        const textareas = Array.from(document.querySelectorAll('textarea'));
        for (const el of textareas) {
          const id = el.id || el.name;
          for (const key in ansMap) {
            if (id === key || (el.closest('label')?.innerText || '').toLowerCase().includes(key.toLowerCase())) {
              if (setVal(el, ansMap[key])) count++;
              break;
            }
          }
        }
        return count;
      }
    });

    const aiSolvedCount = injection?.[0]?.result || Object.keys(answers).length;
    status.innerHTML = `<strong style="color:#c084fc;">✓ AI answered ${aiSolvedCount} custom question(s)!</strong><br>Tailored from your verified projects and engineering stack.`;
    aiBtn.innerText = `✓ Solved (${aiSolvedCount})`;
    setTimeout(() => {
      aiBtn.style.display = 'none';
    }, 4000);

  } catch (err) {
    errDiv.innerText = err.message || 'AI solving failed';
    errDiv.style.display = 'block';
    aiBtn.disabled = false;
    aiBtn.innerText = '✨ AI Answer Custom Questions';
  }
});

// 3. Analyze Job Fit Button
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const btn = document.getElementById('analyzeBtn');
  const dashBtn = document.getElementById('dashboardBtn');
  const status = document.getElementById('status');
  const errDiv = document.getElementById('error');

  btn.disabled = true;
  btn.innerText = 'Extracting page text...';
  errDiv.style.display = 'none';
  dashBtn.style.display = 'none';
  status.innerText = 'Reading the current page...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      throw new Error('Could not detect the current tab. Try closing and reopening the popup.');
    }

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText,
    });

    const rawText = injectionResults[0]?.result;
    if (!rawText || rawText.trim().length < 100) {
      throw new Error('Page text is too short or empty. Make sure you are on a job posting page.');
    }

    const url = tab.url;
    btn.innerText = 'Checking authentication...';
    status.innerText = 'Verifying your JobCopilot login session...';

    const session = await getAuthSession();
    if (!session || !session.token) {
      dashBtn.onclick = () => {
        chrome.tabs.create({ url: CLOUD_CONFIG.dashboardUrl });
      };
      dashBtn.style.display = 'block';
      throw new Error('Your login session has expired or you are not logged in.\n\nPlease open your JobCopilot dashboard and sign in to refresh your session.');
    }

    btn.innerText = 'Analyzing in Background...';
    status.innerText = `Sending ${rawText.length} characters to AI... You can safely close this popup!`;

    chrome.runtime.sendMessage({
      action: 'parseJobBackground',
      raw_jd: rawText,
      url: url,
      session: session
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError);
      }
      
      if (response && response.success) {
        status.innerText = '✅ Analysis complete! Opening your JobCopilot dashboard...';
        btn.innerText = 'Done ✓';
      } else if (response && response.error) {
        errDiv.innerText = response.error;
        errDiv.style.display = 'block';
        btn.disabled = false;
        btn.innerText = 'Try Again';
        status.innerText = 'Something went wrong.';
      }
    });

  } catch (err) {
    let msg = err.message;
    if (msg.includes('Failed to fetch') || msg.includes('ERR_CONNECTION_REFUSED')) {
      msg = '❌ Cannot reach backend server. If using cloud, it might be waking up (wait ~20s). If local, check port 8000.';
    }
    errDiv.innerText = msg;
    errDiv.style.display = 'block';
    btn.disabled = false;
    btn.innerText = 'Try Again';
    status.innerText = 'Something went wrong.';
  }
});
