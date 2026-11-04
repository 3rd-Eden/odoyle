import { describe, it } from 'mocha';
import assume from 'assume';
import { readFileSync } from 'node:fs';
import Odoyle from '../index.js';
import { ops } from './fixtures/ops.js';

/** Load a JSON fixture ruleset. */
const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const odoyle = new Odoyle({ ops: {
  ...Object.fromEntries(Object.entries(ops).map(([k, fn]) => [k, { fn }])),
  count: { fn: (list) => list.length }
} });

/**
 * Compile a fixture. `id`, `options` and `report` are host keys: odoyle keeps
 * them out of the evaluation.
 */
const build = (name) => odoyle.compile(load(name), { vars: ['node', 'rec'], extra: ['id', 'options', 'report'] });

const node = (extra = {}) => ({ ...extra });

describe('template fixtures', function () {
  it('requiredAttribute: one match per missing attribute', function () {
    const run = build('requiredAttribute');
    const n = node({ attrs: { 'aria-label': 'x' } });
    const { matches } = run({ options: { attributes: ['aria-label', 'role', 'alt'] } }, { node: n });

    assume(matches.map((m) => m.bindings.name)).eqls(['role', 'alt']);
    assume(run({ options: { attributes: ['aria-label'] } }, { node: n }).pass).is.false();
  });

  it('forbiddenDescendants: one match per forbidden descendant', function () {
    const run = build('forbiddenDescendants');
    const a = { category: 'button' };
    const b = { category: 'text' };
    const c = { category: 'link' };
    const root = { children: [a, { children: [b, c] }] };
    const { matches } = run({ options: { forbidden: ['button', 'link'] } }, { node: root });

    assume(matches.map((m) => m.bindings.descendant)).eqls([a, c]);
    assume(run({ options: { forbidden: ['image'] } }, { node: root }).pass).is.false();
  });

  describe('textConstraint', function () {
    const run = build('textConstraint');
    const check = (text, options, extra = {}) => run({ options }, { node: { text, ...extra } }).pass;

    it('maxWords', function () {
      assume(check('one two three', { maxWords: 2 })).is.true();
      assume(check('one two', { maxWords: 2 })).is.false();
    });

    it('casing', function () {
      assume(check('Save Changes', { casing: 'sentence' })).is.true();
      assume(check('Save changes', { casing: 'sentence' })).is.false();
      assume(check('Save changes', { casing: 'title' })).is.true();
      assume(check('Save Changes', { casing: 'title' })).is.false();
    });

    it('forbidWords', function () {
      assume(check('Click here', { forbidWords: ['HERE'] })).is.true();
      assume(check('Continue', { forbidWords: ['here'] })).is.false();
    });

    it('forbidTrailingPunctuation', function () {
      assume(check('Done.', { forbidTrailingPunctuation: true })).is.true();
      assume(check('Done', { forbidTrailingPunctuation: true })).is.false();
    });

    it('skips dynamic text', function () {
      assume(check('way too many words here', { maxWords: 1 }, { dynamic: true })).is.false();
    });
  });

  describe('siblingOrder', function () {
    const run = build('siblingOrder');
    const group = (...patterns) => patterns.map((pattern) => ({ pattern }));
    const check = (patterns, options, unreliable = false) => {
      const g = group(...patterns);

      g.forEach((n) => { n.unreliable = unreliable; n.group = g; });

      return run({ options }, { node: g[0] });
    };

    it('reports when the order differs', function () {
      assume(check(['b', 'a'], { by: ['a', 'b'] }).pass).is.true();
      assume(check(['a', 'b'], { by: ['a', 'b'] }).pass).is.false();
      assume(check(['a', 'x', 'b'], { by: ['a', 'b'], order: ['a', 'b'] }).pass).is.false();
    });

    it('only the first matching member reports', function () {
      const g = group('x', 'b', 'a');
      g.forEach((n) => { n.group = g; });

      assume(run({ options: { by: ['a', 'b'] } }, { node: g[2] }).pass).is.false();
      assume(run({ options: { by: ['a', 'b'] } }, { node: g[1] }).pass).is.true();
    });
  });

  describe('contrastConstraint', function () {
    const run = build('contrastConstraint');
    const rec = { parts: {} };

    it('reports low contrast', function () {
      const n = { style: { color: '#777777', background: '#888888' } };
      const { matches } = run({ options: { ratio: 4.5 } }, { node: n, rec });

      assume(matches.length).equals(1);
      assume(matches[0].bindings.target).equals(n);
      assume(matches[0].bindings.threshold).equals(4.5);
    });

    it('passes high contrast', function () {
      const n = { style: { color: '#000000', background: '#ffffff' } };

      assume(run({ options: { ratio: 4.5 } }, { node: n, rec }).pass).is.false();
    });

    it('inherits the background from an ancestor', function () {
      const parent = { style: { background: '#888888' }, component: 'Card' };
      const n = { style: { color: '#777777' }, ancestors: [parent], component: 'Button' };
      const { matches } = run({ options: { ratio: 4.5 } }, { node: n, rec });

      assume(matches.length).equals(1);
      assume(matches[0].bindings.bg.node).equals(parent);
    });

    it('skips a node with no foreground or no background', function () {
      assume(run({ options: { ratio: 4.5 } }, { node: { style: { color: '#777777' } }, rec }).pass).is.false();
      assume(run({ options: { ratio: 4.5 } }, { node: { style: { background: '#777777' } }, rec }).pass).is.false();
    });

    it('uses the large text threshold', function () {
      const n = { style: { color: '#777777', background: '#ffffff' }, large: true };
      const options = { ratio: 4.5, largeTextRatio: 3 };

      assume(run({ options }, { node: n, rec }).pass).is.false();
      assume(run({ options }, { node: { ...n, large: false }, rec }).pass).is.true();
    });

    it('iterates the listed parts', function () {
      const a = { style: { color: '#777777', background: '#888888' } };
      const b = { style: { color: '#000000', background: '#ffffff' } };
      const { matches } = run({ options: { ratio: 4.5, parts: ['label', 'icon'] } }, { node: {}, rec: { parts: { label: [a], icon: [b] } } });

      assume(matches.map((m) => m.bindings.target)).eqls([a]);
    });
  });

  describe('cardinality', function () {
    const run = build('cardinality');
    const tree = { children: [{ category: 'item' }, { category: 'item' }, { category: 'other' }] };
    const check = (options, root = tree) => run({ options: { matcher: 'item', ...options } }, { node: root });

    it('max', function () {
      assume(check({ max: 1 }).pass).is.true();
      assume(check({ max: 2 }).pass).is.false();
    });

    it('min', function () {
      assume(check({ min: 3 }).pass).is.true();
      assume(check({ min: 2 }).pass).is.false();
    });

    it('exactly', function () {
      assume(check({ exactly: 1 }).pass).is.true();
      assume(check({ exactly: 2 }).pass).is.false();
    });

    it('unless', function () {
      assume(check({ max: 1, unless: 'other' }).pass).is.false();
      assume(check({ max: 1, unless: 'missing' }).pass).is.true();
    });

    it('exposes the dynamic count for the host to downgrade', function () {
      const root = { children: [{ category: 'item', dynamic: true }] };

      assume(check({ min: 2 }, root).matches[0].bindings.counted).eqls({ count: 1, dynamic: true });
    });
  });
});
