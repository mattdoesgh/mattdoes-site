// Arrays and big-o. The boards are in the HTML. The client only swaps
// classes, hidden, and text.

import { esc } from '../lib/safe-url.js';
import { relFor } from '../lib/safe-url.js';
import {
  DISTINCT_SAMPLE,
  DUPLICATE_SAMPLE,
  GROWTH_CHOICES,
  HINTS,
  SEARCH_HIT,
  SEARCH_MISS,
  appendFrames,
  binarySteps,
  duplicateActions,
  growthResult,
  linearSteps,
  searchData,
} from './model.js';
import { renderLearningDocument } from './shell.js';
import './arrays/arrays.js';

const REFERENCE = `class DynamicArray:
    """A tiny version of what Python's list does under the hood."""

    def __init__(self):
        self._capacity = 1
        self._size = 0
        self._slots = [None] * self._capacity

    def __len__(self):
        return self._size

    def get(self, i):                      # O(1): jump straight to slot i
        if not 0 <= i < self._size:
            raise IndexError("index out of range")
        return self._slots[i]

    def append(self, value):               # O(1) amortized
        if self._size == self._capacity:
            self._resize(self._capacity * 2)  # rare O(n) copy
        self._slots[self._size] = value
        self._size += 1

    def insert(self, i, value):            # O(n): shift everything after i
        if not 0 <= i <= self._size:
            raise IndexError("index out of range")
        if self._size == self._capacity:
            self._resize(self._capacity * 2)
        for j in range(self._size, i, -1):
            self._slots[j] = self._slots[j - 1]
        self._slots[i] = value
        self._size += 1

    def _resize(self, new_capacity):
        new_slots = [None] * new_capacity
        for j in range(self._size):
            new_slots[j] = self._slots[j]
        self._slots = new_slots
        self._capacity = new_capacity


def linear_search(items, target):          # O(n)
    for i, item in enumerate(items):
        if item == target:
            return i
    return -1


def binary_search(sorted_items, target):   # O(log n), input must be sorted
    lo, hi = 0, len(sorted_items) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if sorted_items[mid] == target:
            return mid
        if sorted_items[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`;

const BIG_O = [
  ['read or write by index', 'a[i], a[i] = x', 'o(1)'],
  ['append to the end', 'a.append(x)', 'o(1) amortized'],
  ['pop from the end', 'a.pop()', 'o(1)'],
  ['insert or delete at the front', 'a.insert(0, x), a.pop(0)', 'o(n)'],
  ['search an unsorted list', 'x in a, a.index(x)', 'o(n)'],
  ['binary search a sorted list', 'bisect.bisect_left(a, x)', 'o(log n)'],
  ['sort', 'a.sort(), sorted(a)', 'o(n log n)'],
];

const LEETCODE = 'https://leetcode.com/problems/contains-duplicate/';

/**
 * @param {number[]} values
 * @returns {string}
 */
function cells(values) {
  return values.map((value, index) => (
    `<li class="cell" data-index="${index}"><span class="cell-value">${value}</span><span class="cell-index">${index}</span></li>`
  )).join('\n              ');
}

/**
 * @param {number} count
 * @returns {string}
 */
function emptySlots(count) {
  const items = [];
  for (let index = 0; index < count; index += 1) {
    items.push(`<li class="slot"${index === 0 ? '' : ' hidden'} data-index="${index}"><span class="cell-value"></span><span class="cell-index">${index}</span></li>`);
  }
  return items.join('\n              ');
}

/**
 * @returns {string}
 */
function searchSummary() {
  const data = searchData();
  const hitIndex = data.indexOf(SEARCH_HIT);
  const linearHit = linearSteps(data, SEARCH_HIT).length;
  const binaryHit = binarySteps(data, SEARCH_HIT).length;
  const linearMiss = linearSteps(data, SEARCH_MISS).length;
  const binaryMiss = binarySteps(data, SEARCH_MISS).length;
  return `sorted data is range(0, 1000, 3): ${data.length} numbers. ${SEARCH_HIT} is at index ${hitIndex}. linear search reads ${linearHit} slots. binary search reads ${binaryHit}. ${SEARCH_MISS} is missing. linear search still reads ${linearMiss} slots. binary search stops after ${binaryMiss} halves.`;
}

/**
 * @param {number} pairCount
 * @param {number} setCount
 * @returns {string}
 */
function duplicateSummary(pairCount, setCount) {
  const distinctPairs = duplicateActions('distinct', 'pairs').length;
  const distinctSet = duplicateActions('distinct', 'set').length;
  return `duplicate ${formatList(DUPLICATE_SAMPLE)}: ${pairCount} pair checks, ${setCount} set checks. all distinct ${formatList(DISTINCT_SAMPLE)}: ${distinctPairs} pair checks, ${distinctSet} set checks.`;
}

/**
 * @param {number[]} values
 * @returns {string}
 */
function formatList(values) {
  return `[${values.join(', ')}]`;
}

/**
 * @param {string} [siteUrl]
 * @returns {string}
 */
export function renderArraysDocument(siteUrl) {
  const pairCount = duplicateActions('duplicate', 'pairs').length;
  const setCount = duplicateActions('duplicate', 'set').length;
  const appendEnd = appendFrames().at(-1);
  const hints = HINTS.map((hint, index) => (
    `<p class="hint" data-hint${index === 0 ? '' : ' hidden'}>${esc(hint)}</p>`
  )).join('\n            ');
  const noscriptHints = HINTS.map((hint) => `<p>${esc(hint)}</p>`).join('\n          ');
  const growth = GROWTH_CHOICES.map((choice) => (
    `<label class="choice"><input type="radio" name="growth" value="${esc(choice.value)}"> ${esc(choice.label)}</label>`
  )).join('\n            ');
  const rows = BIG_O.map(([op, python, cost]) => (
    `<tr><td>${esc(op)}</td><td>${esc(python)}</td><td>${esc(cost)}</td></tr>`
  )).join('\n              ');
  const startSlots = appendEnd ? appendEnd.capacity : 8;
  return renderLearningDocument({
    siteUrl,
    path: '/learning/arrays/',
    cssHref: '/learning/learning.css',
    scriptHref: './arrays.js',
    title: 'arrays & big-o · mattdoes.online',
    description: 'arrays and big-o.',
    main: `      <div class="mast">
        <a class="home" href="/learning/">learning</a>
        <h1 class="sign"><a href="/">arrays &amp; big-o</a></h1>
      </div>
      <p class="deck">big-o is how the work grows as n grows. constants drop out: 3n + 5 is o(n). an array stores items side by side, so a[i] is o(1). a python list is a dynamic array. when it fills, it copies into a bigger block. that copy is o(n), and it is rare enough that append averages to o(1). that average is amortized o(1). insert away from the end shifts later items, so it is o(n). binary search needs sorted data and halves the range, so it is o(log n).</p>
      <p class="deck">reading: grokking algorithms, chapter 1, and the memory and arrays parts of chapter 2.</p>

      <section class="lesson-block" data-lesson="arrays">
        <h2>contains duplicate</h2>
        <p class="deck">${esc(duplicateSummary(pairCount, setCount))}</p>
        <div class="stepper" data-stepper="duplicate">
          <fieldset>
            <legend>approach</legend>
            <label class="choice"><input type="radio" name="dup-approach" value="pairs" checked> compare every pair · o(n²)</label>
            <label class="choice"><input type="radio" name="dup-approach" value="set"> one pass + set · o(n)</label>
          </fieldset>
          <fieldset>
            <legend>sample</legend>
            <label class="choice"><input type="radio" name="dup-sample" value="duplicate" checked> duplicate</label>
            <label class="choice"><input type="radio" name="dup-sample" value="distinct"> all distinct</label>
          </fieldset>
          <ol class="board" data-board>
            ${cells(DUPLICATE_SAMPLE)}
          </ol>
          <p class="seen-label" data-seen-label hidden>seen</p>
          <ul class="seen" data-seen hidden>
            ${emptySlots(DUPLICATE_SAMPLE.length)}
          </ul>
          <p class="outcome" data-outcome role="status">press step.</p>
          <p class="count-line" data-count>0 checks</p>
          <div class="controls">
            <button type="button" class="control" data-act="back">back</button>
            <button type="button" class="control" data-act="step">step</button>
            <button type="button" class="control" data-act="reset">reset</button>
          </div>
        </div>

        <h2>dynamic array and search</h2>
        <div class="stepper" data-stepper="array">
          <fieldset>
            <legend>mode</legend>
            <label class="choice"><input type="radio" name="array-mode" value="append" checked> append</label>
            <label class="choice"><input type="radio" name="array-mode" value="insert"> insert</label>
            <label class="choice"><input type="radio" name="array-mode" value="linear"> linear search</label>
            <label class="choice"><input type="radio" name="array-mode" value="binary"> binary search</label>
          </fieldset>
          <fieldset data-target>
            <legend>target</legend>
            <label class="choice"><input type="radio" name="array-target" value="${SEARCH_HIT}" checked> ${SEARCH_HIT}</label>
            <label class="choice"><input type="radio" name="array-target" value="${SEARCH_MISS}"> missing ${SEARCH_MISS}</label>
          </fieldset>
          <p class="deck">${esc(searchSummary())}</p>
          <div class="panel is-selected" data-panel="append">
            <ol class="slots" data-slots>
              ${emptySlots(startSlots)}
            </ol>
          </div>
          <div class="panel" data-panel="insert">
            <ol class="slots" data-slots>
              <li class="slot" data-index="0"><span class="cell-value">10</span><span class="cell-index">0</span></li>
              <li class="slot" data-index="1"><span class="cell-value">20</span><span class="cell-index">1</span></li>
              <li class="slot" data-index="2"><span class="cell-value">40</span><span class="cell-index">2</span></li>
              <li class="slot" data-index="3"><span class="cell-value"></span><span class="cell-index">3</span></li>
            </ol>
          </div>
          <div class="panel" data-panel="linear">
            <ol class="board" data-range>
              <li class="cell" data-end="index"><span class="cell-index">index</span><span class="cell-value" data-value="index">0</span></li>
              <li class="cell" data-end="value"><span class="cell-index">value</span><span class="cell-value" data-value="value"></span></li>
              <li class="cell" data-end="target"><span class="cell-index">target</span><span class="cell-value" data-value="target">${SEARCH_HIT}</span></li>
            </ol>
          </div>
          <div class="panel" data-panel="binary">
            <ol class="board" data-range>
              <li class="cell" data-end="lo"><span class="cell-index">lo</span><span class="cell-value" data-value="lo">0</span></li>
              <li class="cell" data-end="mid"><span class="cell-index">mid</span><span class="cell-value" data-value="mid"></span></li>
              <li class="cell" data-end="hi"><span class="cell-index">hi</span><span class="cell-value" data-value="hi"></span></li>
            </ol>
          </div>
          <p class="outcome" data-outcome role="status">capacity 1. press step.</p>
          <p class="count-line" data-count>capacity 1</p>
          <div class="controls">
            <button type="button" class="control" data-act="back">back</button>
            <button type="button" class="control" data-act="step">step</button>
            <button type="button" class="control" data-act="reset">reset</button>
          </div>
        </div>

        <h2>reference</h2>
        <pre class="code-block"><code>${esc(REFERENCE)}</code></pre>
        <table class="bigo">
          <caption>python list operations</caption>
          <thead>
            <tr><th scope="col">operation</th><th scope="col">python</th><th scope="col">big-o</th></tr>
          </thead>
          <tbody>
              ${rows}
          </tbody>
        </table>

        <h2 id="coach">coach</h2>
        <p class="deck">solve <a href="${esc(LEETCODE)}"${relFor(LEETCODE)}>contains duplicate</a> two ways, a slow one and a fast one. write the time and the space big-o for each.</p>
        <div class="hints">
            ${hints}
        </div>
        <button type="button" class="control" data-reveal>reveal hint</button>
        <fieldset>
          <legend>growth</legend>
          <p class="deck">a is o(n). b is o(n²). n grows from 1,000 to 10,000. how many times more work does each one do?</p>
            ${growth}
        </fieldset>
        <p class="outcome" data-growth-result role="status">pick one.</p>
        <noscript>
          ${noscriptHints}
          <p>${esc(growthResult('10-100').text)}</p>
        </noscript>
      </section>`,
  });
}
