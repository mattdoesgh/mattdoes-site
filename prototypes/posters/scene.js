/* Full-screen film scene for the poster studies.
   Open is instant, a 120ms fade, or a 160ms scale of the whole panel,
   chosen by the layout. Close is always instant.
   Leave by the close button, a tap on the black around the panel,
   Esc, or history back. Forward reopens the same film. */
(function () {
  'use strict';

  var dataEl = document.getElementById('film-data');
  var dialog = document.getElementById('scene');
  var feed = document.querySelector('.feed');
  if (!dataEl || !dialog || !feed) return;

  var films = JSON.parse(dataEl.textContent);
  var closeBtn = dialog.querySelector('.scene-close');
  var titleEl = document.getElementById('scene-title');
  var yearEl = document.getElementById('scene-year');
  var rateEl = document.getElementById('scene-rate');
  var reviewEl = document.getElementById('scene-review');
  var linkEl = document.getElementById('scene-link');
  var imgEl = document.getElementById('scene-img');
  var restoreEl = null;
  var currentId = '';
  var STAR = '\u2605';
  var HALF = '\u00bd';

  function findButton(id) {
    return feed.querySelector('[data-scene="' + CSS.escape(String(id)) + '"]');
  }

  function starsNode(stars, rating) {
    var value = String(stars || '');
    var half = value.endsWith(HALF);
    var full = half ? value.slice(0, -HALF.length) : value;
    if (!full && !half) return null;
    if ([].some.call(full, function (ch) { return ch !== STAR; })) return null;
    var span = document.createElement('span');
    span.className = 'stars';
    span.setAttribute('role', 'img');
    if (rating) span.setAttribute('aria-label', String(rating) + ' out of 5 stars');
    span.append(document.createTextNode(full));
    if (half) {
      var outer = document.createElement('span');
      outer.className = 'star-half';
      var glyph = document.createElement('span');
      glyph.className = 'star-glyph';
      glyph.textContent = STAR;
      outer.append(glyph);
      span.append(outer);
    }
    return span;
  }

  function paint(film) {
    var reviewed = Boolean(film.review);
    dialog.classList.toggle('is-review', reviewed);
    dialog.classList.toggle('is-still', !reviewed);
    titleEl.textContent = film.title || 'Untitled';
    yearEl.textContent = film.year || '';
    yearEl.hidden = !reviewed || !film.year;
    reviewEl.textContent = film.review || '';
    reviewEl.hidden = !reviewed;
    if (reviewed) dialog.setAttribute('aria-describedby', 'scene-review');
    else dialog.removeAttribute('aria-describedby');

    rateEl.replaceChildren();
    var stars = starsNode(film.stars, film.rating);
    if (stars) rateEl.append(stars);
    if (film.rewatch) {
      var flag = document.createElement('span');
      flag.className = 'flag';
      flag.textContent = 'rewatch';
      rateEl.append(flag);
    }
    rateEl.hidden = rateEl.childNodes.length === 0;

    var source = linkEl.parentElement;
    if (film.link) {
      linkEl.href = film.link;
      linkEl.rel = 'noopener noreferrer';
      source.hidden = false;
    } else {
      linkEl.removeAttribute('href');
      source.hidden = true;
    }

    if (imgEl.getAttribute('src') !== film.full) {
      imgEl.src = film.full;
    }
    imgEl.width = film.fullWidth || 960;
    imgEl.height = film.fullHeight || 1440;
    imgEl.alt = '';
  }

  function lock() {
    if (document.documentElement.classList.contains('is-locked')) return;
    var y = window.scrollY || window.pageYOffset || 0;
    document.body.dataset.scrollY = String(y);
    document.documentElement.classList.add('is-locked');
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + y + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlock() {
    if (!document.documentElement.classList.contains('is-locked')) return;
    var y = Number(document.body.dataset.scrollY || '0');
    document.documentElement.classList.remove('is-locked');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, y);
  }

  function setExpanded(id) {
    var buttons = feed.querySelectorAll('[data-scene]');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].setAttribute('aria-expanded', buttons[i].getAttribute('data-scene') === String(id) ? 'true' : 'false');
    }
  }

  function focusables() {
    return [].filter.call(dialog.querySelectorAll('button, a[href]'), function (el) {
      if (el.hidden || el.closest('[hidden]')) return false;
      var style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function openScene(button, push) {
    var film = films[Number(button.getAttribute('data-scene'))];
    if (!film) return;
    paint(film);
    restoreEl = button;
    currentId = String(film.id);
    setExpanded(currentId);
    lock();
    if (!dialog.open) dialog.showModal();
    closeBtn.focus();
    if (push) history.pushState({ scene: currentId }, '');
  }

  function finishClose(fromPop) {
    if (dialog.open) dialog.close();
    unlock();
    setExpanded('');
    currentId = '';
    var backTo = restoreEl;
    restoreEl = null;
    if (backTo) backTo.focus();
    if (!fromPop && history.state && history.state.scene) history.back();
  }

  feed.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-scene]');
    if (!button) return;
    openScene(button, true);
  });

  closeBtn.addEventListener('click', function () {
    finishClose(false);
  });

  dialog.addEventListener('click', function (event) {
    if (event.target.closest('.scene-panel, .scene-close')) return;
    finishClose(false);
  });

  dialog.addEventListener('cancel', function (event) {
    event.preventDefault();
    finishClose(false);
  });

  dialog.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    var items = focusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('popstate', function () {
    var id = history.state && history.state.scene;
    if (id) {
      var button = findButton(id);
      if (button) openScene(button, false);
      return;
    }
    if (dialog.open) finishClose(true);
  });

  if (history.state && history.state.scene) {
    var initial = findButton(history.state.scene);
    if (initial) openScene(initial, false);
  }
})();
