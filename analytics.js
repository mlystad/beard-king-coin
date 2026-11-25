/* Google Analytics 4 with Consent Mode v2.
 *
 * Loaded only when the page carries <meta name="ga-id">. Storage starts
 * denied; a small notice asks once and remembers the answer in localStorage.
 * Until the visitor allows it, GA receives only cookieless pings (Consent Mode).
 * Shared by itsthebeard.com and originalbeardking.com; keep the copies identical.
 */
(function () {
  var idMeta = document.querySelector('meta[name="ga-id"]');
  var id = idMeta && idMeta.content;
  if (!id) { return; }
  var linkerMeta = document.querySelector('meta[name="ga-linker"]');
  var KEY = 'consent.analytics';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: stored() === 'granted' ? 'granted' : 'denied'
  });
  gtag('js', new Date());
  gtag('config', id, linkerMeta ? { linker: { domains: linkerMeta.content.split(',') } } : {});

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);

  window.itbTrack = function (name, params) {
    var clean = {};
    for (var k in params) { if (params[k] !== undefined && params[k] !== '') { clean[k] = params[k]; } }
    gtag('event', name, clean);
  };

  /* ── Consent notice ── */
  var css = '.consent{position:fixed;z-index:2000;left:16px;right:16px;bottom:16px;max-width:520px;margin:0 auto;' +
    'background:var(--consent-bg,#15120d);color:var(--consent-fg,#e9e3d6);border:1px solid var(--consent-accent,#c8882a);' +
    'border-radius:4px;padding:16px 18px;font:15px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)}' +
    '.consent p{margin:0 0 12px}.consent a{color:inherit;text-decoration:underline;text-underline-offset:3px}.consent .row{display:flex;gap:10px;flex-wrap:wrap}' +
    '.consent button{font:600 14px/1 system-ui,-apple-system,sans-serif;min-height:44px;padding:0 18px;border-radius:3px;cursor:pointer;' +
    'border:1px solid var(--consent-accent,#c8882a);background:transparent;color:inherit}' +
    '.consent button.yes{background:var(--consent-accent,#c8882a);color:var(--consent-on-accent,#0e0b07)}' +
    '.consent button:focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
    /* While the notice is up, reserve its height so it never covers the page's last lines or a focused control. */
    'html.consent-open{scroll-padding-bottom:calc(var(--consent-h,0px) + 32px)}' +
    'html.consent-open body{padding-bottom:calc(var(--consent-h,0px) + 32px)}';

  var observer = null;
  var reopenedFrom = null;

  function reserveSpace(box) {
    var root = document.documentElement;
    function measure() { root.style.setProperty('--consent-h', box.offsetHeight + 'px'); }
    root.classList.add('consent-open');
    measure();
    if (window.ResizeObserver) { observer = new ResizeObserver(measure); observer.observe(box); }
  }

  function releaseSpace() {
    if (observer) { observer.disconnect(); observer = null; }
    document.documentElement.classList.remove('consent-open');
    document.documentElement.style.removeProperty('--consent-h');
  }

  function choose(v, box) {
    store(v);
    gtag('consent', 'update', { analytics_storage: v });
    if (box) { box.remove(); }
    releaseSpace();
    /* Reopened from the footer: hand focus back to the button that asked. */
    if (reopenedFrom && document.contains(reopenedFrom)) { reopenedFrom.focus(); }
    reopenedFrom = null;
  }

  /* The notice sits at the start of the page (straight after a skip link, if
     the page has one), so keyboard and screen-reader users reach it first even
     though it is positioned at the foot of the screen. */
  function showNotice(opener) {
    if (document.getElementById('consent')) { return; }
    if (!document.getElementById('consent-css')) {
      var st = document.createElement('style'); st.id = 'consent-css'; st.textContent = css; document.head.appendChild(st);
    }
    var box = document.createElement('section');
    box.id = 'consent'; box.className = 'consent';
    box.setAttribute('aria-label', 'Analytics choice');
    box.innerHTML = '<p>May we count your visit with Google Analytics? It sets cookies. ' +
      '<a href="/privacy">Privacy notice</a>.</p>' +
      '<div class="row"><button type="button" class="yes">Allow</button><button type="button" class="no">Decline</button></div>';
    box.querySelector('.yes').addEventListener('click', function () { choose('granted', box); });
    box.querySelector('.no').addEventListener('click', function () { choose('denied', box); });
    var skip = document.querySelector('body > .skip-link');
    if (skip) { skip.insertAdjacentElement('afterend', box); } else { document.body.insertBefore(box, document.body.firstChild); }
    reserveSpace(box);
    if (opener) { reopenedFrom = opener; box.querySelector('.yes').focus(); }
  }

  function ready() {
    if (!stored()) { showNotice(); }
    var openers = document.querySelectorAll('[data-consent-open], [data-consent-open-sep]');
    for (var i = 0; i < openers.length; i++) { openers[i].hidden = false; }
    document.addEventListener('click', function (e) {
      var opener = e.target.closest && e.target.closest('[data-consent-open]');
      if (opener) { showNotice(opener); }
    });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
}());
