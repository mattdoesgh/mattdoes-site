// Say-hi page: copy email button + AJAX contact submit.
(() => {
  const copyBtn = document.getElementById('copy');
  const addrEl  = document.getElementById('addr');
  if (copyBtn && addrEl) {
    const addr = addrEl.textContent.trim();
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(addr);
        copyBtn.textContent = 'copied ✓';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = 'copy address';
          copyBtn.classList.remove('copied');
        }, 1800);
      } catch (e) {
        copyBtn.textContent = addr;
      }
    });
  }

  const form = document.querySelector('form.note');
  const thanks = document.getElementById('thanks');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'sending…';
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        form.style.display = 'none';
        thanks?.classList.add('on');
      } else {
        btn.textContent = 'try again?';
        btn.disabled = false;
      }
    } catch (err) {
      btn.textContent = 'try again?';
      btn.disabled = false;
    }
  });
})();
