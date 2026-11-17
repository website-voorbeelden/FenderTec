(() => {
  if (window.Shopify?.designMode) return;

  const attributionKey = 'ft_yokohama_quote_attribution';
  const fields = {
    gclid: 'GCLID',
    gbraid: 'GBRAID',
    wbraid: 'WBRAID',
    utm_source: 'UTM Bron',
    utm_medium: 'UTM Medium',
    utm_campaign: 'UTM Campagne',
    utm_term: 'UTM Term',
    utm_content: 'UTM Content',
    utm_id: 'UTM ID',
  };
  const landing = new URL(location.href);
  const pageUrl = landing.origin + landing.pathname;
  const incoming = Object.fromEntries(
    Object.keys(fields)
      .filter((key) => landing.searchParams.get(key))
      .map((key) => [key, landing.searchParams.get(key).slice(0, 512)])
  );
  const hasIncoming = Object.keys(incoming).length > 0;
  const allowed = () => window.Shopify?.customerPrivacy?.marketingAllowed?.() === true;

  function rememberAttribution() {
    try {
      if (!allowed()) sessionStorage.removeItem(attributionKey);
      else if (hasIncoming) sessionStorage.setItem(attributionKey, JSON.stringify(incoming));
    } catch {
      // The native form also works when storage is unavailable.
    }
  }

  function attribution() {
    if (!allowed()) return {};
    if (hasIncoming) return incoming;
    try {
      return JSON.parse(sessionStorage.getItem(attributionKey) || '{}') || {};
    } catch {
      return {};
    }
  }

  const forms = [...document.querySelectorAll('form[data-ft-contact], form[data-ft-quote-theme-role]')];
  const quotes = forms.filter((form) => form.hasAttribute('data-ft-quote-theme-role'));
  const pendingKey = (form) => 'ft_yokohama_quote_pending:' + form.id;

  for (const form of forms) {
    const picker = form.querySelector('select[data-ft-contact-variant]');
    const variantField = form.querySelector('[data-ft-contact-variant-id]');
    const variantId = () => picker?.selectedOptions[0]?.dataset.variantId;
    if (variantField) {
      const syncVariant = () => {
        const id = variantId();
        variantField.value = id || '';
        variantField.disabled = !id;
      };
      picker?.addEventListener('change', syncVariant);
      syncVariant();
    }

    form.addEventListener('formdata', ({ formData }) => {
      const id = variantId();
      if (id) formData.set('contact[Variant ID]', id);
      formData.set('contact[Pagina]', pageUrl);
      const data = attribution();
      for (const [key, label] of Object.entries(fields)) {
        if (typeof data[key] === 'string' && data[key]) formData.set('contact[' + label + ']', data[key]);
      }
    });
  }

  for (const form of quotes) {
    form.addEventListener('submit', () => {
      try {
        if (allowed()) sessionStorage.setItem(pendingKey(form), String(Date.now()));
        else sessionStorage.removeItem(pendingKey(form));
      } catch {
        // Never block Shopify's native submission.
      }
    }, true);
  }

  const originalMailLinks = new WeakMap();
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href^="mailto:"]');
    if (!link || link.dataset.noTrack === 'true') return;
    if (!originalMailLinks.has(link)) originalMailLinks.set(link, link.getAttribute('href'));

    const url = new URL(originalMailLinks.get(link));
    url.searchParams.delete('subject');
    const body = url.searchParams.get('body') || '';
    if (!body.includes('Page: ')) {
      const tail = ['---', 'Page: ' + pageUrl];
      const data = attribution();
      for (const [key, label] of Object.entries(fields)) {
        if (typeof data[key] === 'string' && data[key]) tail.push(label + ': ' + data[key]);
      }
      url.searchParams.set('body', [body.trim(), tail.join('\n')].filter(Boolean).join('\n\n'));
    }
    link.href = url;
  }, true);

  function privacyReady() {
    rememberAttribution();
    // Only a Shopify success response for a recent submission in this tab counts.
    for (const form of quotes) {
      if (!form.querySelector('[data-ft-quote-success]')) continue;
      try {
        const pending = Number(sessionStorage.getItem(pendingKey(form)));
        sessionStorage.removeItem(pendingKey(form));
        const age = Date.now() - pending;
        if (!allowed() || pending <= 0 || age < 0 || age >= 30 * 60 * 1000) continue;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: 'fendertec_yokohama_quote_success',
          form_id: form.id,
          quote_theme_role: form.dataset.ftQuoteThemeRole,
        });
      } catch {
        // Tracking errors cannot affect Shopify's success message.
      }
    }
  }

  document.addEventListener('visitorConsentCollected', rememberAttribution);
  if (window.Shopify?.customerPrivacy) privacyReady();
  else window.Shopify?.loadFeatures?.([{ name: 'consent-tracking-api', version: '0.2' }], (error) => {
    if (!error) privacyReady();
  });
})();
