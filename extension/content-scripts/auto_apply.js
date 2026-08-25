/**
 * JobCopilot Auto-Apply Module
 * Strictly limited to Greenhouse and Lever career pages.
 * Explicitly blocks execution on any bulk job boards.
 * NEVER auto-submits forms.
 */

(async () => {
  // 1. Guardrail: Ensure we are NOT on a banned domain (LinkedIn, Indeed, etc.)
  const bannedDomains = ['linkedin.com', 'indeed.com', 'glassdoor.com', 'naukri.com'];
  if (bannedDomains.some(domain => window.location.hostname.includes(domain))) {
    console.log("JobCopilot Auto-Apply: Explicitly blocked on this domain.");
    return;
  }

  console.log("JobCopilot Auto-Apply: Checking for profile data...");

  try {
    // 2. Fetch User Profile Data & Cover Letter Draft
    const res = await fetch(`http://localhost:8000/api/auto-apply/data?url=${encodeURIComponent(window.location.href)}`);
    if (!res.ok) {
      console.log("JobCopilot Auto-Apply: Could not fetch data (backend may be down).");
      return;
    }
    
    const data = await res.json();
    if (!data.enabled) {
      console.log("JobCopilot Auto-Apply: Module is disabled in settings.");
      return;
    }

    console.log("JobCopilot Auto-Apply: Data found. Attempting to auto-fill...");

    // 3. Define Field Mappings (Greenhouse & Lever)
    const mappings = [
      {
        value: data.first_name,
        selectors: [
          'input[name="job_application[first_name]"]', // Greenhouse
        ]
      },
      {
        value: data.last_name,
        selectors: [
          'input[name="job_application[last_name]"]', // Greenhouse
        ]
      },
      {
        value: `${data.first_name} ${data.last_name}`.trim(),
        selectors: [
          'input[name="name"]', // Lever (usually full name)
        ]
      },
      {
        value: data.email,
        selectors: [
          'input[name="job_application[email]"]', // Greenhouse
          'input[name="email"]', // Lever
        ]
      },
      {
        value: data.phone,
        selectors: [
          'input[name="job_application[phone]"]', // Greenhouse
          'input[name="phone"]', // Lever
        ]
      },
      {
        value: data.linkedin_url,
        selectors: [
          'input[name="urls[LinkedIn]"]', // Lever
          'input[autocomplete="custom-question-linkedin-profile"]' // Greenhouse common custom
        ]
      },
      {
        value: data.github_url,
        selectors: [
          'input[name="urls[GitHub]"]' // Lever
        ]
      },
      {
        value: data.portfolio_url,
        selectors: [
          'input[name="urls[Portfolio]"]' // Lever
        ]
      },
    ];

    // Helper to simulate React/Vue input events
    const setNativeValue = (element, value) => {
      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      
      if (valueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else {
        valueSetter.call(element, value);
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // 4. Execute Fill
    mappings.forEach(mapObj => {
      if (!mapObj.value) return; // Skip if no data
      for (const selector of mapObj.selectors) {
        const el = document.querySelector(selector);
        if (el && !el.value) { // Don't overwrite if already filled
          setNativeValue(el, mapObj.value);
          el.style.backgroundColor = '#e0f2fe'; // Highlight auto-filled fields
        }
      }
    });

    // 5. Advanced Fill: Cover Letter & Custom Fields
    if (data.cover_letter) {
      // Find textareas that might be cover letters
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach(ta => {
        // Find label text
        let labelText = '';
        if (ta.id) {
          const label = document.querySelector(`label[for="${ta.id}"]`);
          if (label) labelText = label.innerText.toLowerCase();
        }
        const nameAttr = ta.name ? ta.name.toLowerCase() : '';
        
        if (labelText.includes('cover letter') || nameAttr.includes('cover') || nameAttr.includes('comments')) {
          if (!ta.value) {
            setNativeValue(ta, data.cover_letter);
            ta.style.backgroundColor = '#e0f2fe';
          }
        }
      });
    }
    
    console.log("JobCopilot Auto-Apply: Fill complete. Waiting for manual submission.");

  } catch (err) {
    console.error("JobCopilot Auto-Apply Error:", err);
  }
})();
