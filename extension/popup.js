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

    btn.innerText = 'Sending to AI...';
    status.innerText = `Sending ${rawText.length} characters to JobCopilot AI...`;

    const response = await fetch(`${session.backendUrl}/api/jobs/parse`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({
        raw_jd: rawText,
        source: 'extension',
        url: url
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      if (response.status === 401) {
        dashBtn.onclick = () => {
          chrome.tabs.create({ url: session.dashboardUrl });
        };
        dashBtn.style.display = 'block';
        throw new Error('Session token expired. Please click below to refresh your dashboard tab.');
      }
      throw new Error(`Backend error ${response.status}: ${errBody}`);
    }

    const data = await response.json();

    // Open the dashboard in a new tab
    chrome.tabs.create({ url: `${session.dashboardUrl}/jobs/${data.job_id}` });

    status.innerText = '✅ Analysis complete! Opening your JobCopilot dashboard...';
    btn.innerText = 'Done ✓';

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
