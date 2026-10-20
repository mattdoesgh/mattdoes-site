/* Keyword layer for the Signal / Station preview.
   The trail does not need this file: redaction bars are native details. */
(function () {
  var phrase = 'lucia';
  var buffer = '';

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (typeof event.key !== 'string' || event.key.length !== 1) return;
    var el = event.target;
    if (el && typeof el.closest === 'function' && el.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }
    buffer = (buffer + event.key.toLowerCase()).slice(-phrase.length);
    if (buffer !== phrase) return;
    var root = document.body.getAttribute('data-root') || './';
    window.location.assign(root + 'frequency/');
  });
})();
