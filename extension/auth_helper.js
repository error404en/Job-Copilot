/**
 * Shared authentication & endpoint resolver for JobCopilot extension.
 * Supports both live cloud deployment (Vercel & Render) and local dev.
 */

const CLOUD_CONFIG = {
  backendUrl: "https://job-copilot-ci8e.onrender.com",
  dashboardUrl: "https://job-copilot-gold.vercel.app"
};

const LOCAL_CONFIG = {
  backendUrl: "http://localhost:8000",
  dashboardUrl: "http://localhost:3000"
};

/**
 * Checks if a JWT token is expired.
 */
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Consider expired if less than 10 seconds remaining
    return (payload.exp * 1000) <= (Date.now() + 10000);
  } catch (e) {
    return true;
  }
}

/**
 * Resolves a fresh, valid Clerk token and active backend/dashboard URLs.
 * 1. Checks open JobCopilot tabs (Cloud or Local) and asks window.Clerk for a fresh token.
 * 2. Checks cookies and verifies expiration before returning.
 */
async function getAuthSession() {
  const tabs = await chrome.tabs.query({});

  // 1. Try Cloud tab first
  const cloudTab = tabs.find(t => t.url && t.url.includes("job-copilot-gold.vercel.app"));
  if (cloudTab && cloudTab.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: cloudTab.id },
        func: async () => {
          if (window.Clerk && window.Clerk.session) {
            return await window.Clerk.session.getToken();
          }
          return null;
        }
      });
      const token = results?.[0]?.result;
      if (token && !isTokenExpired(token)) {
        return {
          token,
          backendUrl: CLOUD_CONFIG.backendUrl,
          dashboardUrl: CLOUD_CONFIG.dashboardUrl
        };
      }
    } catch (e) {
      console.warn("Could not get token from Cloud tab:", e);
    }
  }

  // 2. Try Local tab
  const localTab = tabs.find(t => t.url && t.url.includes("localhost:3000"));
  if (localTab && localTab.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: localTab.id },
        func: async () => {
          if (window.Clerk && window.Clerk.session) {
            return await window.Clerk.session.getToken();
          }
          return null;
        }
      });
      const token = results?.[0]?.result;
      if (token && !isTokenExpired(token)) {
        return {
          token,
          backendUrl: LOCAL_CONFIG.backendUrl,
          dashboardUrl: LOCAL_CONFIG.dashboardUrl
        };
      }
    } catch (e) {
      console.warn("Could not get token from Local tab:", e);
    }
  }

  // 3. Check cookies if no open tab could provide a fresh token
  const origins = [
    { url: CLOUD_CONFIG.dashboardUrl, backendUrl: CLOUD_CONFIG.backendUrl },
    { url: LOCAL_CONFIG.dashboardUrl, backendUrl: LOCAL_CONFIG.backendUrl }
  ];

  for (const origin of origins) {
    const cookie = await chrome.cookies.get({ url: origin.url, name: '__session' });
    if (cookie && cookie.value && !isTokenExpired(cookie.value)) {
      return {
        token: cookie.value,
        backendUrl: origin.backendUrl,
        dashboardUrl: origin.url
      };
    }
  }

  return null;
}
