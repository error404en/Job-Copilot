chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchBackend') {
    (async () => {
      try {
        const cookie = await chrome.cookies.get({ url: 'http://localhost:3000', name: '__session' });
        if (!cookie) {
          throw new Error('You must be signed into the JobCopilot web dashboard (http://localhost:3000) first.');
        }

        const res = await fetch(request.url, {
          method: request.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cookie.value}`,
            ...(request.headers || {})
          },
          body: request.body ? JSON.stringify(request.body) : undefined
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Backend error ${res.status}: ${text}`);
        }

        const data = await res.json();
        sendResponse({ success: true, data });
      } catch (err) {
        let msg = err.message;
        if (msg.includes('Failed to fetch') || msg.includes('ERR_CONNECTION_REFUSED')) {
          msg = 'Cannot reach backend. Make sure uvicorn is running on port 8000.';
        }
        sendResponse({ success: false, error: msg });
      }
    })();
    return true; // Indicates we will respond asynchronously
  }
});
