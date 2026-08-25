document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const btn = document.getElementById('analyzeBtn');
  const status = document.getElementById('status');
  const errDiv = document.getElementById('error');
  
  btn.disabled = true;
  btn.innerText = 'Extracting...';
  errDiv.style.display = 'none';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Inject script to extract text
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText,
    });

    const rawText = injectionResults[0].result;
    const url = tab.url;

    btn.innerText = 'Sending to AI...';

    // Send to local backend
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
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    
    // Open the local dashboard in a new tab
    chrome.tabs.create({ url: `http://localhost:3000/jobs/${data.job_id}` });
    
    status.innerText = 'Success! Opening dashboard...';
    btn.innerText = 'Done';
    
  } catch (err) {
    errDiv.innerText = `Error: ${err.message}. Make sure your JobCopilot backend is running on localhost:8000!`;
    errDiv.style.display = 'block';
    btn.disabled = false;
    btn.innerText = 'Try Again';
  }
});
