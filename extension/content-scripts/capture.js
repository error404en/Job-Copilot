/**
 * JobCopilot Capture Module (Phase 6)
 * Injects an "Analyze with JobCopilot" button on single job pages.
 * 
 * GUARDRAIL: NO BULK SCRAPING.
 * This script only extracts the single job currently visible on the screen.
 * It does not and will never navigate pagination, run in the background, 
 * or harvest multiple listings. 
 */

(function() {
  // Prevent duplicate injections
  if (window.jobCopilotInjected) return;
  window.jobCopilotInjected = true;

  const siteConfigs = {
    'linkedin.com': {
      titleSelector: '.jobs-details-top-card__job-title, .job-details-jobs-unified-top-card__job-title, .t-24.t-bold, h1',
      contentSelector: '#job-details, .jobs-description__content, .jobs-description-content__text, article',
    },
    'indeed.com': {
      titleSelector: '.jobsearch-JobInfoHeader-title, h1',
      contentSelector: '#jobDescriptionText, .jobsearch-jobDescriptionText',
    },
    'glassdoor.com': {
      titleSelector: '.JobDetails_jobTitle__1D91E, h1',
      contentSelector: '.JobDetails_jobDescriptionWrapper__wL3qK, .jobDescriptionContent',
    },
    'naukri.com': {
      titleSelector: '.jd-header-title, h1',
      contentSelector: '.job-desc, .styles_Jd__description__4tPsz',
    }
  };

  const domain = Object.keys(siteConfigs).find(d => window.location.hostname.includes(d));
  if (!domain) return;
  
  const config = siteConfigs[domain];

  function injectButton() {
    // Only inject if the button doesn't exist yet
    if (document.getElementById('jobcopilot-capture-btn')) return;

    const titleEl = document.querySelector(config.titleSelector);
    if (!titleEl) return;

    const btn = document.createElement('button');
    btn.id = 'jobcopilot-capture-btn';
    btn.innerText = '🤖 Analyze with JobCopilot';
    btn.style.cssText = `
      margin-left: 12px;
      padding: 6px 12px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 0 10px rgba(37,99,235,0.3);
      z-index: 9999;
    `;

    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const contentEl = document.querySelector(config.contentSelector);
      const rawText = contentEl ? contentEl.innerText : document.body.innerText;

      if (!rawText || rawText.length < 100) {
        btn.innerText = '❌ Failed to read JD';
        return;
      }

      btn.innerText = '⏳ Analyzing...';
      btn.disabled = true;

      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'fetchBackend',
            url: 'http://localhost:8000/api/jobs/parse',
            method: 'POST',
            body: {
              raw_jd: rawText,
              source: domain.split('.')[0],
              url: window.location.href
            }
          }, (resp) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(resp);
            }
          });
        });

        if (!response || !response.success) throw new Error(response ? response.error : 'Background error');
        
        const data = response.data;
        btn.innerText = '✅ Open Dashboard';
        btn.style.background = '#16a34a';
        
        // When clicked again, open dashboard
        btn.onclick = () => {
          window.open(`http://localhost:3000/jobs/${data.job_id}`, '_blank');
        };

        // Show a little toast inside the button
        setTimeout(() => {
          if(btn.innerText.includes('Dashboard')) {
             // keep it as open dashboard
          }
        }, 3000);

      } catch (err) {
        btn.innerText = '❌ Backend Offline';
        btn.style.background = '#dc2626';
        btn.disabled = false;
      }
    };

    // Inject next to title
    titleEl.appendChild(btn);
  }

  // Use a MutationObserver because these sites are SPAs
  const observer = new MutationObserver(() => {
    injectButton();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  
  // Initial try
  setTimeout(injectButton, 1500);
})();
