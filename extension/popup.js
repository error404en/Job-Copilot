document.getElementById('autofillBtn')?.addEventListener('click', async () => {
  const fillBtn = document.getElementById('autofillBtn');
  const dashBtn = document.getElementById('dashboardBtn');
  const status = document.getElementById('status');
  const errDiv = document.getElementById('error');

  fillBtn.disabled = true;
  fillBtn.innerText = 'Fetching Profile...';
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

    const res = await fetch(`${session.backendUrl}/api/auto-apply/data?url=${encodeURIComponent(tab.url || '')}`, {
      headers: { 'Authorization': `Bearer ${session.token}` }
    });
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const data = await res.json();

    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [data],
      func: (d) => {
        const setVal = (el, val) => {
          if (!el || !val) return false;
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
        let count = 0;
        const fullName = d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim();
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea'));
        for (const el of inputs) {
          const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
          const hint = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('autocomplete'), el.getAttribute('data-automation-id'), labelEl?.innerText].filter(Boolean).join(' ').toLowerCase();
          if (el.tagName === 'TEXTAREA') {
            if (/cover|letter|additional|comment|note|summary/i.test(hint) && d.cover_letter) { if (setVal(el, d.cover_letter)) count++; }
            else if (/why|interest|motivat|fit/i.test(hint) && (d.why_company_pitch || d.cover_letter)) { if (setVal(el, d.why_company_pitch || d.cover_letter)) count++; }
            continue;
          }
          if (/first.*name|given.*name|fname|legalnametablesection.*first/i.test(hint)) { if (setVal(el, d.first_name)) count++; }
          else if (/last.*name|family.*name|surname|lname|legalnametablesection.*last/i.test(hint)) { if (setVal(el, d.last_name)) count++; }
          else if ((/\bname\b|full.*name|candidate.*name/i.test(hint)) && !/company|school|university|refer|employer/i.test(hint)) { if (setVal(el, fullName)) count++; }
          else if (el.type === 'email' || /email|e-mail/i.test(hint)) { if (setVal(el, d.email)) count++; }
          else if (el.type === 'tel' || /phone|mobile|contact.*number|cell/i.test(hint)) { if (setVal(el, d.phone)) count++; }
          else if (/linkedin/i.test(hint)) { if (setVal(el, d.linkedin_url)) count++; }
          else if (/github|git/i.test(hint)) { if (setVal(el, d.github_url)) count++; }
          else if (/portfolio|website|personal.*url|blog/i.test(hint)) { if (setVal(el, d.portfolio_url || d.github_url)) count++; }
          else if (/city|current.*location|address/i.test(hint)) { if (setVal(el, d.location)) count++; }
        }
        return count;
      }
    });

    const filledCount = injection?.[0]?.result || 0;
    status.innerText = `✅ Auto-filled ${filledCount} field(s)! Attach "${data.recommended_resume_title || 'your resume'}" & review before submitting.`;
    fillBtn.innerText = `✓ Filled ${filledCount} Field(s)`;
    fillBtn.disabled = false;
  } catch (err) {
    errDiv.innerText = err.message || 'Auto-fill failed';
    errDiv.style.display = 'block';
    fillBtn.disabled = false;
    fillBtn.innerText = '⚡ Auto-Fill Application Form';
  }
});

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

    // Inject script to extract page text
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

    // Get fresh Clerk session token and resolved endpoint
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

    // Offload parsing to the background worker so it survives tab switches
    chrome.runtime.sendMessage({
      action: 'parseJobBackground',
      raw_jd: rawText,
      url: url,
      session: session
    }, (response) => {
      // Note: If the popup is closed, this callback just won't run, which is fine!
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
