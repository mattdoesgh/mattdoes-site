// Client for /learning/arrays/. Visual state is classes, hidden, and text.
// This file does not write element styles.

import { SAMPLES, arrayFrames, duplicateActions, growthResult } from '../model.js';

const MARKS = '.is-i, .is-j, .is-hit, .is-write, .is-copy, .is-shift, .is-full';

/**
 * @param {ParentNode} scope
 * @returns {void}
 */
function clearMarks(scope) {
  for (const el of scope.querySelectorAll(MARKS)) {
    el.classList.remove('is-i');
    el.classList.remove('is-j');
    el.classList.remove('is-hit');
    el.classList.remove('is-write');
    el.classList.remove('is-copy');
    el.classList.remove('is-shift');
    el.classList.remove('is-full');
  }
}

/**
 * @param {EventTarget | null} target
 * @returns {Element | null}
 */
function asElement(target) {
  if (target && typeof target.closest === 'function') return target;
  if (target && target.parentElement) return target.parentElement;
  return null;
}

/**
 * @param {Element} slot
 * @param {number | null | undefined} value
 * @param {boolean} on
 * @returns {void}
 */
function paintSlot(slot, value, on) {
  slot.toggleAttribute('hidden', !on);
  const text = slot.querySelector('.cell-value');
  if (text) text.textContent = on && value != null ? String(value) : '';
}

/**
 * @param {Element | null} cell
 * @param {string} key
 * @param {string} text
 * @returns {void}
 */
function paintReadout(cell, key, text) {
  const value = cell?.querySelector(`[data-value="${key}"]`);
  if (value) value.textContent = text;
}

/**
 * @param {ParentNode} root
 * @returns {void}
 */
function bootDuplicate(root) {
  const board = root.querySelector('[data-board]');
  const seen = root.querySelector('[data-seen]');
  const seenLabel = root.querySelector('[data-seen-label]');
  const outcome = root.querySelector('[data-outcome]');
  const count = root.querySelector('[data-count]');
  if (!board || !seen || !seenLabel || !outcome || !count) return;
  const cells = [...board.querySelectorAll('.cell')];
  const slots = [...seen.querySelectorAll('.slot')];
  let approach = 'pairs';
  let sample = 'duplicate';
  let pos = 0;

  const paint = () => {
    const values = SAMPLES[sample];
    const actions = duplicateActions(sample, approach);
    if (pos > actions.length) pos = actions.length;
    clearMarks(board);
    clearMarks(seen);
    cells.forEach((cell, index) => {
      const value = cell.querySelector('.cell-value');
      const label = cell.querySelector('.cell-index');
      if (value) value.textContent = String(values[index]);
      if (label) label.textContent = String(index);
    });
    const action = pos === 0 ? null : actions[pos - 1];
    const showSeen = approach === 'set';
    seen.toggleAttribute('hidden', !showSeen);
    seenLabel.toggleAttribute('hidden', !showSeen);
    /** @type {number[]} */
    let filled = [];
    if (!action) {
      outcome.textContent = 'press step.';
    } else if (approach === 'set') {
      const hit = Boolean(action.hit);
      cells[action.i].classList.add(hit ? 'is-hit' : 'is-i');
      outcome.textContent = hit
        ? `${action.value} is already in seen. duplicate.`
        : `${action.value} is new. add it to seen.`;
      filled = action.seen.slice();
      if (!hit) filled.push(action.value);
    } else if (action.same) {
      cells[action.i].classList.add('is-hit');
      cells[action.j].classList.add('is-hit');
      outcome.textContent = `${action.left} equals ${action.right}. duplicate.`;
    } else {
      cells[action.i].classList.add('is-i');
      cells[action.j].classList.add('is-j');
      outcome.textContent = `${action.left} and ${action.right} differ.`;
    }
    slots.forEach((slot, index) => {
      const on = index < filled.length;
      paintSlot(slot, filled[index], on);
      if (on) slot.classList.add('is-full');
    });
    count.textContent = `${pos} checks`;
  };

  root.addEventListener('change', (event) => {
    const input = asElement(event.target);
    if (!input || input.tagName !== 'INPUT') return;
    if (input.name === 'dup-approach') approach = input.value === 'set' ? 'set' : 'pairs';
    if (input.name === 'dup-sample') sample = input.value === 'distinct' ? 'distinct' : 'duplicate';
    if (input.name === 'dup-approach' || input.name === 'dup-sample') {
      pos = 0;
      paint();
    }
  });
  root.addEventListener('click', (event) => {
    const hit = asElement(event.target);
    const button = hit?.closest('[data-act]');
    if (!button || !root.contains(button)) return;
    const actions = duplicateActions(sample, approach);
    const act = button.getAttribute('data-act');
    if (act === 'step' && pos < actions.length) pos += 1;
    if (act === 'back' && pos > 0) pos -= 1;
    if (act === 'reset') pos = 0;
    paint();
  });
  paint();
}

/**
 * @param {ParentNode} root
 * @returns {void}
 */
function bootArray(root) {
  const outcome = root.querySelector('[data-outcome]');
  const count = root.querySelector('[data-count]');
  const targetField = root.querySelector('[data-target]');
  if (!outcome || !count || !targetField) return;
  let mode = 'append';
  let target = 999;
  let pos = 0;

  const paint = () => {
    const frames = arrayFrames(mode, target);
    if (pos >= frames.length) pos = frames.length - 1;
    if (pos < 0) pos = 0;
    const frame = frames[pos];
    for (const panel of root.querySelectorAll('[data-panel]')) {
      const on = panel.getAttribute('data-panel') === mode;
      if (on) panel.classList.add('is-selected');
      else panel.classList.remove('is-selected');
    }
    const searching = mode === 'linear' || mode === 'binary';
    targetField.toggleAttribute('hidden', !searching);
    const panel = root.querySelector(`[data-panel="${mode}"]`);
    if (panel) clearMarks(panel);
    if (panel && (mode === 'append' || mode === 'insert')) {
      const slots = [...panel.querySelectorAll('.slot')];
      slots.forEach((slot, index) => {
        const on = index < frame.capacity;
        paintSlot(slot, frame.slots[index], on);
        if (!on) return;
        if (frame.kind === 'copy' && frame.slots[index] != null) slot.classList.add('is-copy');
        if (frame.kind === 'write' && index === frame.index) slot.classList.add('is-write');
        if (frame.kind === 'shift' && (index === frame.from || index === frame.to)) {
          slot.classList.add('is-shift');
        }
      });
      count.textContent = `capacity ${frame.capacity}`;
    }
    const reads = frame.kind === 'start' ? 0 : (frame.kind === 'miss' ? Math.max(0, pos - 1) : pos);
    if (panel && mode === 'linear') {
      const indexCell = panel.querySelector('[data-end="index"]');
      const valueCell = panel.querySelector('[data-end="value"]');
      const targetCell = panel.querySelector('[data-end="target"]');
      paintReadout(indexCell, 'index', frame.kind === 'read' ? String(frame.index) : '0');
      paintReadout(valueCell, 'value', frame.kind === 'read' ? String(frame.value) : '');
      paintReadout(targetCell, 'target', String(target));
      if (frame.kind === 'read' && indexCell) indexCell.classList.add('is-i');
      if (frame.kind === 'read' && valueCell) valueCell.classList.add(frame.found ? 'is-hit' : 'is-j');
      count.textContent = frame.kind === 'start' ? `${frame.total} slots` : `${reads} reads`;
    }
    if (panel && mode === 'binary') {
      const loCell = panel.querySelector('[data-end="lo"]');
      const midCell = panel.querySelector('[data-end="mid"]');
      const hiCell = panel.querySelector('[data-end="hi"]');
      paintReadout(loCell, 'lo', frame.lo == null ? '' : `${frame.lo} · ${frame.loValue}`);
      paintReadout(hiCell, 'hi', frame.hi == null ? '' : `${frame.hi} · ${frame.hiValue}`);
      paintReadout(midCell, 'mid', frame.mid == null ? '' : `${frame.mid} · ${frame.value}`);
      if (frame.kind === 'half' && loCell) loCell.classList.add('is-i');
      if (frame.kind === 'half' && hiCell) hiCell.classList.add('is-j');
      if (frame.kind === 'half' && midCell) midCell.classList.add(frame.next === 'found' ? 'is-hit' : 'is-write');
      count.textContent = frame.kind === 'start' ? `${frame.total} slots` : `${reads} reads`;
    }
    outcome.textContent = frame.note;
  };

  root.addEventListener('change', (event) => {
    const input = asElement(event.target);
    if (!input || input.tagName !== 'INPUT') return;
    if (input.name === 'array-mode') {
      mode = input.value;
      pos = 0;
      paint();
    }
    if (input.name === 'array-target') {
      target = Number(input.value);
      pos = 0;
      paint();
    }
  });
  root.addEventListener('click', (event) => {
    const hit = asElement(event.target);
    const button = hit?.closest('[data-act]');
    if (!button || !root.contains(button)) return;
    const frames = arrayFrames(mode, target);
    const act = button.getAttribute('data-act');
    if (act === 'step' && pos < frames.length - 1) pos += 1;
    if (act === 'back' && pos > 0) pos -= 1;
    if (act === 'reset') pos = 0;
    paint();
  });
  root.classList.add('is-live');
  paint();
}

/**
 * @param {ParentNode} root
 * @returns {void}
 */
function bootCoach(root) {
  const hints = [...root.querySelectorAll('[data-hint]')];
  const reveal = root.querySelector('[data-reveal]');
  const result = root.querySelector('[data-growth-result]');
  if (reveal) {
    reveal.addEventListener('click', () => {
      const next = hints.find((hint) => hint.hasAttribute('hidden'));
      if (next) next.removeAttribute('hidden');
      if (!hints.some((hint) => hint.hasAttribute('hidden'))) reveal.setAttribute('hidden', '');
    });
  }
  root.addEventListener('change', (event) => {
    const input = asElement(event.target);
    if (!input || input.tagName !== 'INPUT' || input.name !== 'growth' || !result) return;
    result.textContent = growthResult(input.value).text;
  });
}

/**
 * @param {Document | undefined} doc
 * @returns {void}
 */
export function bootLesson(doc = globalThis.document) {
  const root = doc?.querySelector?.('[data-lesson="arrays"]');
  if (!root || root.hasAttribute('data-ready')) return;
  root.setAttribute('data-ready', '');
  const duplicate = root.querySelector('[data-stepper="duplicate"]');
  const array = root.querySelector('[data-stepper="array"]');
  if (duplicate) bootDuplicate(duplicate);
  if (array) bootArray(array);
  bootCoach(root);
}

bootLesson();
