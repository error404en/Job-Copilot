document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const btn = document.getElementById('analyzeBtn');
  const status = document.getElementById('status');
  const errDiv = document.getElementById('error');

  btn.disabled = true;
  btn.innerText = 'Extracting page text...';
  errDiv.style.display = 'none';
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
    btn.innerText = 'Sending to backend...';
    status.innerText = `Sending ${rawText.length} characters to JobCopilot AI...`;

    const response = await fetch('http://localhost:8000/api/jobs/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_jd: rawText,
        source: 'extension',
        url: url
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Backend error ${response.status}: ${errBody}`);
    }

    const data = await response.json();

    // Open the local dashboard in a new tab
    chrome.tabs.create({ url: `http://localhost:3000/jobs/${data.job_id}` });

    status.innerText = '✅ Analysis complete! Opening your JobCopilot dashboard...';
    btn.innerText = 'Done ✓';

  } catch (err) {
    let msg = err.message;
    if (msg.includes('Failed to fetch') || msg.includes('ERR_CONNECTION_REFUSED')) {
      msg = '❌ Cannot reach backend. Make sure uvicorn is running on port 8000:\n\ncd backend && uvicorn main:app --reload --port 8000';
    }
    errDiv.innerText = msg;
    errDiv.style.display = 'block';
    btn.disabled = false;
    btn.innerText = 'Try Again';
    status.innerText = 'Something went wrong.';
  }
});
