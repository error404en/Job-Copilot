importScripts('auth_helper.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchBackend') {
    (async () => {
      try {
        const session = await getAuthSession();
        if (!session || !session.token) {
          throw new Error('You must be signed into the JobCopilot web dashboard first.');
        }

        // Automatically route to resolved backend (Cloud or Local)
        let targetUrl = request.url;
        if (targetUrl.startsWith('/')) {
          targetUrl = `${session.backendUrl}${targetUrl}`;
        } else if (targetUrl.startsWith('http://localhost:8000')) {
          targetUrl = targetUrl.replace('http://localhost:8000', session.backendUrl);
        }

        const res = await fetch(targetUrl, {
          method: request.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`,
            ...(request.headers || {})
          },
          body: request.body ? JSON.stringify(request.body) : undefined
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Backend error ${res.status}: ${text}`);
        }

        const data = await res.json();
        sendResponse({ success: true, data, dashboardUrl: session.dashboardUrl });
      } catch (err) {
        let msg = err.message;
        if (msg.includes('Failed to fetch') || msg.includes('ERR_CONNECTION_REFUSED')) {
          msg = 'Cannot reach backend server. Please make sure the service is running or awake.';
        }
        sendResponse({ success: false, error: msg });
      }
    })();
    return true; // Indicates we will respond asynchronously
  }
});
