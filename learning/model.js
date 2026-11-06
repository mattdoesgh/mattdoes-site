// Step lists for the arrays lesson. The page renders these. It does not
// ship a solution for the practice problem.

export const DUPLICATE_SAMPLE = [3, 8, 4, 1, 5, 9, 2, 1];
export const DISTINCT_SAMPLE = [3, 8, 4, 6, 5, 9, 2, 7];

export const SAMPLES = {
  duplicate: DUPLICATE_SAMPLE,
  distinct: DISTINCT_SAMPLE,
};

export const APPEND_VALUES = [10, 20, 40, 80, 160];
export const INSERT_AT = 2;
export const INSERT_VALUE = 30;
export const SEARCH_HIT = 999;
export const SEARCH_MISS = 1000;

export const HINTS = [
  'if you compare every pair, how many comparisons is that for n items? it is n * (n - 1) / 2.',
  'after sorting, where do two equal numbers sit?',
  'which structure spends o(n) extra memory so a lookup is o(1)?',
];

export const GROWTH_CHOICES = [
  { value: '10-10', label: 'a does 10× the work. b does 10×.' },
  { value: '10-100', label: 'a does 10× the work. b does 100×.' },
  { value: '100-100', label: 'a does 100× the work. b does 100×.' },
  { value: '100-1000', label: 'a does 100× the work. b does 1,000×.' },
];

const GROWTH_TEXT = 'n grew from 1,000 to 10,000, which is 10 times. o(n) grows with n, so a does about 10 times the work. o(n²) grows with n times n, so b does about 100 times the work.';

/**
 * @param {string} value
 * @returns {{ right: boolean, text: string }}
 */
export function growthResult(value) {
  const right = value === '10-100';
  return { right, text: `${right ? 'right.' : 'not quite.'} ${GROWTH_TEXT}` };
}

/**
 * @param {number[]} values
 * @returns {{ i: number, j: number, left: number, right: number, same: boolean }[]}
 */
export function pairSteps(values) {
  const steps = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const same = values[i] === values[j];
      steps.push({ i, j, left: values[i], right: values[j], same });
      if (same) return steps;
    }
  }
  return steps;
}

/**
 * @param {number[]} values
 * @returns {{ i: number, value: number, hit: boolean, seen: number[] }[]}
 */
export function setSteps(values) {
  const steps = [];
  const seen = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const hit = seen.includes(value);
    steps.push({ i, value, hit, seen: seen.slice() });
    if (hit) return steps;
    seen.push(value);
  }
  return steps;
}

/**
 * @param {keyof typeof SAMPLES} sample
 * @param {'pairs' | 'set'} approach
 * @returns {{ i: number, j?: number, left?: number, right?: number, same?: boolean, value?: number, hit?: boolean, seen?: number[] }[]}
 */
export function duplicateActions(sample, approach) {
  const values = SAMPLES[sample];
  if (!values) throw new Error(`unknown sample "${sample}"`);
  return approach === 'set' ? setSteps(values) : pairSteps(values);
}

/**
 * @returns {number[]}
 */
export function searchData() {
  const data = [];
  for (let n = 0; n < 1000; n += 3) data.push(n);
  return data;
}

/**
 * @param {number[]} items
 * @param {number} target
 * @returns {{ index: number, value: number, found: boolean }[]}
 */
export function linearSteps(items, target) {
  const steps = [];
  for (let index = 0; index < items.length; index += 1) {
    const value = items[index];
    const found = value === target;
    steps.push({ index, value, found });
    if (found) return steps;
  }
  return steps;
}

/**
 * @param {number[]} sorted
 * @param {number} target
 * @returns {{ lo: number, hi: number, mid: number, value: number, loValue: number, hiValue: number, next: 'found' | 'left' | 'right' }[]}
 */
export function binarySteps(sorted, target) {
  const steps = [];
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const value = sorted[mid];
    let next = 'found';
    if (value < target) next = 'right';
    else if (value > target) next = 'left';
    steps.push({
      lo,
      hi,
      mid,
      value,
      loValue: sorted[lo],
      hiValue: sorted[hi],
      next,
    });
    if (next === 'found') return steps;
    if (next === 'right') lo = mid + 1;
    else hi = mid - 1;
  }
  return steps;
}

/**
 * @returns {object[]}
 */
export function appendFrames() {
  let capacity = 1;
  let size = 0;
  /** @type {(number|null)[]} */
  let slots = [null];
  const frames = [{
    kind: 'start',
    capacity,
    size,
    slots: slots.slice(),
    note: 'capacity 1. append writes one slot, which is o(1). a full block copies into double the space. that copy is rare, so append is amortized o(1).',
  }];
  for (const value of APPEND_VALUES) {
    if (size === capacity) {
      const next = capacity * 2;
      const copied = Array(next).fill(null);
      for (let j = 0; j < size; j += 1) copied[j] = slots[j];
      slots = copied;
      capacity = next;
      frames.push({
        kind: 'copy',
        capacity,
        size,
        slots: slots.slice(),
        note: `the block is full. copy every item into capacity ${capacity}. that copy is o(n).`,
      });
    }
    const index = size;
    slots = slots.slice();
    slots[index] = value;
    size += 1;
    frames.push({
      kind: 'write',
      capacity,
      size,
      index,
      value,
      slots: slots.slice(),
      note: `write ${value} at slot ${index}. one slot write is o(1).`,
    });
  }
  return frames;
}

/**
 * @returns {object[]}
 */
export function insertFrames() {
  let capacity = 4;
  let size = 3;
  /** @type {(number|null)[]} */
  let slots = [10, 20, 40, null];
  const frames = [{
    kind: 'start',
    capacity,
    size,
    slots: slots.slice(),
    note: 'insert 30 at index 2. every later slot shifts right. that shift is o(n).',
  }];
  for (let j = size; j > INSERT_AT; j -= 1) {
    slots = slots.slice();
    slots[j] = slots[j - 1];
    frames.push({
      kind: 'shift',
      capacity,
      size,
      from: j - 1,
      to: j,
      slots: slots.slice(),
      note: `shift slot ${j - 1} to slot ${j}.`,
    });
  }
  slots = slots.slice();
  slots[INSERT_AT] = INSERT_VALUE;
  size += 1;
  frames.push({
    kind: 'write',
    capacity,
    size,
    index: INSERT_AT,
    value: INSERT_VALUE,
    slots: slots.slice(),
    note: 'write 30 at index 2. the row is 10, 20, 30, 40.',
  });
  return frames;
}

/**
 * @param {number} target
 * @returns {object[]}
 */
export function linearFrames(target) {
  const data = searchData();
  const steps = linearSteps(data, target);
  const frames = [{
    kind: 'start',
    target,
    note: `linear search for ${target} starts at index 0 and walks forward. that is o(n).`,
  }];
  for (const step of steps) {
    frames.push({
      kind: 'read',
      ...step,
      target,
      note: step.found
        ? `${step.value} equals ${target} at index ${step.index}.`
        : `index ${step.index} holds ${step.value}. that is not ${target}.`,
    });
  }
  if (!steps.some((step) => step.found)) {
    frames.push({
      kind: 'miss',
      target,
      note: `${target} is not in the list. linear search read every slot.`,
    });
  }
  return frames;
}

/**
 * @param {number} target
 * @returns {object[]}
 */
export function binaryFrames(target) {
  const data = searchData();
  const steps = binarySteps(data, target);
  const frames = [{
    kind: 'start',
    target,
    lo: 0,
    hi: data.length - 1,
    loValue: data[0],
    hiValue: data[data.length - 1],
    note: `binary search for ${target} keeps a sorted range and checks the middle. each step cuts the range in half. that is o(log n). the list has to be sorted.`,
  }];
  for (const step of steps) {
    let note = `${step.value} equals ${target} at index ${step.mid}.`;
    if (step.next === 'right') note = `${step.value} is less than ${target}. keep the right half.`;
    if (step.next === 'left') note = `${step.value} is greater than ${target}. keep the left half.`;
    frames.push({ kind: 'half', ...step, target, note });
  }
  if (!steps.some((step) => step.next === 'found')) {
    frames.push({
      kind: 'miss',
      target,
      note: `${target} is not in the list. the range is empty.`,
    });
  }
  return frames;
}

/**
 * @param {'append' | 'insert' | 'linear' | 'binary'} mode
 * @param {number} target
 * @returns {object[]}
 */
export function arrayFrames(mode, target) {
  if (mode === 'append') return appendFrames();
  if (mode === 'insert') return insertFrames();
  if (mode === 'linear') return linearFrames(target);
  if (mode === 'binary') return binaryFrames(target);
  throw new Error(`unknown mode "${mode}"`);
}
