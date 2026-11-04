import { describe, it } from 'mocha';
import assume from 'assume';
import Odoyle, { OdoyleError, get } from '../index.js';

/** Capture the error that a function throws. */
const fail = (fn) => {
  try { fn(); } catch (e) { return e; }
  throw new Error('expected a throw');
};

describe('odoyle v2', function () {
  const odoyle = new Odoyle({
    ops: {
      double: { fn: (n) => n * 2, args: { type: 'array', minItems: 1, maxItems: 1, prefixItems: [{ type: 'number' }] } },
      add: (a, b) => a + b,
      boom() { throw new Error('kaboom'); },
      list: (...all) => all
    }
  });

  describe('construction', function () {
    it('accepts function and object ops', function () {
      assume(odoyle.ops.get('add').fn(1, 2)).equals(3);
      assume(odoyle.ops.get('double').args).is.a('object');
    });

    it('rejects an op that has no function', function () {
      assume(() => new Odoyle({ ops: { bad: {} } })).throws(/bad/);
    });

    it('works without options', function () {
      assume(new Odoyle().ops.size).is.above(8);
    });
  });

  describe('get', function () {
    it('reads paths and gives undefined for missing steps', function () {
      assume(get({ a: { b: 1 } }, 'a.b')).equals(1);
      assume(get({ a: null }, 'a.b')).is.undefined();
      assume(get({ a: [5] }, ['a', '0'])).equals(5);
    });
  });

  describe('#compile errors', function () {
    it('throws on an unknown op, with the path', function () {
      const e = fail(() => odoyle.compile({ every: [{ key: 'a', op: '=', value: 1 }, { when: { op: 'nope', args: [] } }] }));

      assume(e).is.instanceOf(OdoyleError);
      assume(e.message).includes('every[1].when.op');
      assume(e.message).includes('unknown op "nope"');
      assume(e.path).equals('every[1].when.op');
    });

    it('throws on an unknown op in for.each', function () {
      const e = fail(() => odoyle.compile({ every: [{ for: { each: { op: 'nope' }, as: 'x' } }] }));

      assume(e.message).includes('every[0].for.each.op');
    });

    it('throws when args fail the op schema (type)', function () {
      const e = fail(() => odoyle.compile({ every: [{ op: '>', args: [{ op: 'double', args: ['text'] }, 1] }] }));

      assume(e.message).includes('every[0].args[0].args');
      assume(e.message).includes('argument 0');
    });

    it('throws when args fail the op schema (count)', function () {
      assume(fail(() => odoyle.compile({ op: 'double', args: [1, 2] })).message).includes('at most 1');
      assume(fail(() => odoyle.compile({ op: 'double', args: [] })).message).includes('at least 1');
    });

    it('does not check dynamic args at compile time', function () {
      odoyle.compile({ op: '>', args: [{ op: 'double', args: [{ key: 'a' }] }, 1] });
    });

    it('throws on an unknown $var', function () {
      const e = fail(() => odoyle.compile({ for: { each: { key: 'xs' }, as: 'x' }, when: { op: '=', args: ['$y', 1] } }));

      assume(e.message).includes('when.args[0]');
      assume(e.message).includes('unknown variable "$y"');
    });

    it('does not leak a for variable outside its rule', function () {
      assume(() => odoyle.compile({ every: [
        { for: { each: { key: 'xs' }, as: 'x' } },
        { op: '=', args: ['$x', 1] }
      ] })).throws(/unknown variable "\$x"/);
    });

    it('accepts host variables that are declared', function () {
      odoyle.compile({ op: '=', args: ['$node', 1] }, { vars: ['node'] });
    });

    it('throws on a let that references itself', function () {
      const e = fail(() => odoyle.compile({ let: { a: { op: 'add', args: ['$a', 1] } } }));

      assume(e.message).includes('let.a.args[0]');
      assume(e.message).includes('references itself');
    });

    it('throws on a let that references a later binding', function () {
      assume(() => odoyle.compile({ let: { a: '$b', b: 1 } })).throws(/unknown variable "\$b"/);
    });

    it('lets a later binding use an earlier one', function () {
      const run = odoyle.compile({ let: { a: 2, b: { op: 'double', args: ['$a'] } }, when: { op: '=', args: ['$b', 4] } });

      assume(run({}).matches).eqls([{ bindings: { a: 2, b: 4 } }]);
    });

    it('throws on unknown properties, bad for, bad let, bad names', function () {
      assume(() => odoyle.compile({ nope: 1 })).throws(/unknown property "nope"/);
      assume(() => odoyle.compile({ for: { each: 1 } })).throws(/for must be/);
      assume(() => odoyle.compile({ for: 'x' })).throws(/for must be/);
      assume(() => odoyle.compile({ let: [] })).throws(/let must be/);
      assume(() => odoyle.compile({ let: { '1x': 1 } })).throws(/not a valid name/);
      assume(() => odoyle.compile({ every: 1 })).throws(/every must be an array/);
      assume(() => odoyle.compile({ op: 3 })).throws(/op must be a string/);
      assume(() => odoyle.compile({ op: '=', args: 3 })).throws(/args must be an array/);
      assume(() => odoyle.compile({ key: '' })).throws(/non-empty/);
      assume(() => odoyle.compile({ op: '=', key: 'a', args: [1] })).throws(/not both/);
      assume(() => odoyle.compile({ literal: 1, key: 'a' })).throws(/literal/);
    });

    it('ignores declared extra keys', function () {
      odoyle.compile({ id: 'x', report: { at: '$nothing' }, op: '=', args: [1, 1] }, { extra: ['id', 'report'] });
    });
  });

  describe('operands', function () {
    const check = (rule, data = {}, vars = {}) => odoyle.compile(rule, { vars: Object.keys(vars) })(data, vars).pass;

    it('reads literals, keys, variables and op results', function () {
      assume(check({ op: '=', args: [{ key: 'a.b' }, 3] }, { a: { b: 3 } })).is.true();
      assume(check({ op: '=', args: ['$v.x', 4] }, {}, { v: { x: 4 } })).is.true();
      assume(check({ op: '=', args: [{ op: 'double', args: [2] }, 4] })).is.true();
    });

    it('composes value ops: the result is another op\'s argument', function () {
      assume(check({ op: '=', args: [{ op: 'double', args: [{ op: 'add', args: [1, { op: 'double', args: [1] }] }] }, 6] })).is.true();
    });

    it('treats a missing key as undefined', function () {
      assume(check({ op: '=', args: [{ key: 'nope' }, { op: 'list' }] })).is.false();
      assume(check({ op: 'exists', args: [{ key: 'nope' }] })).is.false();
      assume(check({ op: 'exists', args: [{ key: 'a' }] }, { a: 0 })).is.true();
    });

    it('supports { literal } to escape $ strings and keep objects as is', function () {
      assume(check({ op: '=', args: [{ literal: '$a' }, { literal: '$a' }] })).is.true();
      assume(check({ op: 'exists', args: [{ literal: { op: 'x' } }] })).is.true();
    });

    it('treats a plain object without key or op as a literal', function () {
      assume(check({ op: 'exists', args: [{ a: 1 }] })).is.true();
    });

    it('builds arrays from nested operands', function () {
      assume(check({ op: 'in', args: [2, [1, { op: 'double', args: [1] }]] })).is.true();
    });

    it('does not turn a plain string into a variable', function () {
      assume(check({ op: '=', args: ['a $b', 'a $b'] })).is.true();
    });

    it('supports the v1 key/op/value form', function () {
      assume(check({ key: 'a', op: '>', value: 1 }, { a: 2 })).is.true();
      assume(check({ key: 'a', value: 2 }, { a: 2 })).is.true();
    });

    it('supports in, string ops on non-strings, and bare operand rules', function () {
      assume(check({ op: 'in', args: ['a', ['a', 'b']] })).is.true();
      assume(check({ op: '^', args: [5, 'a'] })).is.false();
      assume(check({ op: '$', args: [5, 'a'] })).is.false();
      assume(check({ op: '~', args: [null, 'a'] })).is.false();
      assume(check({ op: 'in', args: ['a', 5] })).is.false();
      assume(check(true)).is.true();
      assume(check({ every: [false] })).is.false();
      assume(check([{ op: '=', args: [1, 1] }, { op: '=', args: [2, 2] }])).is.true();
    });
  });

  describe('composition and results', function () {
    it('returns pass and matches with no bindings for plain rules', function () {
      assume(odoyle.compile({ op: '=', args: [1, 1] })({})).eqls({ pass: true, matches: [{ bindings: {} }] });
      assume(odoyle.compile({ op: '=', args: [1, 2] })({})).eqls({ pass: false, matches: [] });
    });

    it('for over an empty or missing collection gives no matches', function () {
      const run = odoyle.compile({ for: { each: { key: 'xs' }, as: 'x' } });

      assume(run({ xs: [] })).eqls({ pass: false, matches: [] });
      assume(run({})).eqls({ pass: false, matches: [] });
    });

    it('for over N items with a when gives one match per passing item, in order', function () {
      const run = odoyle.compile({
        for: { each: { key: 'xs' }, as: 'x' },
        when: { op: '>', args: ['$x.n', 1] }
      });
      const xs = [{ n: 1 }, { n: 5 }, { n: 0 }, { n: 3 }];
      const { pass, matches } = run({ xs });

      assume(pass).is.true();
      assume(matches).eqls([{ bindings: { x: xs[1] } }, { bindings: { x: xs[3] } }]);
      assume(run({ xs })).eqls({ pass, matches });
    });

    it('for accepts iterables and rejects other values with the path', function () {
      const run = odoyle.compile({ for: { each: { key: 'xs' }, as: 'x' } });

      assume(run({ xs: new Set([1, 2]) }).matches.length).equals(2);
      assume(() => run({ xs: 5 })).throws(/for\.each/);
      assume(() => run({ xs: 'ab' })).throws(/for\.each/);
    });

    it('let bindings are visible in when and in bindings', function () {
      const run = odoyle.compile({
        for: { each: { key: 'xs' }, as: 'x' },
        let: { d: { op: 'double', args: ['$x'] } },
        when: { op: '>', args: ['$d', 4] }
      });

      assume(run({ xs: [1, 2, 3, 4] }).matches).eqls([{ bindings: { x: 3, d: 6 } }, { bindings: { x: 4, d: 8 } }]);
    });

    it('nested for scopes shadow outer scopes', function () {
      const run = odoyle.compile({
        for: { each: { key: 'xs' }, as: 'x' },
        every: [{
          for: { each: { key: 'ys' }, as: 'x' },
          when: { op: '>', args: ['$x', 10] }
        }]
      });
      const { matches } = run({ xs: [1, 2], ys: [5, 20, 30] });

      assume(matches).eqls([
        { bindings: { x: 20 } },
        { bindings: { x: 30 } },
        { bindings: { x: 20 } },
        { bindings: { x: 30 } }
      ]);
    });

    it('an inner for sees outer variables, and the outer scope is restored', function () {
      const run = odoyle.compile({
        for: { each: { key: 'xs' }, as: 'x' },
        when: {
          for: { each: { key: 'ys' }, as: 'y' },
          when: { op: '=', args: ['$x', '$y'] }
        }
      });

      assume(run({ xs: [1, 2, 3], ys: [2, 3] }).matches).eqls([{ bindings: { x: 2 } }, { bindings: { x: 3 } }]);
    });

    it('some stops at the first rule that holds and keeps its bindings', function () {
      const run = odoyle.compile({ some: [
        { for: { each: { key: 'xs' }, as: 'a' }, when: { op: '>', args: ['$a', 5] } },
        { for: { each: { key: 'xs' }, as: 'b' } }
      ] });

      assume(run({ xs: [1, 9] }).matches).eqls([{ bindings: { a: 9 } }]);
      assume(run({ xs: [1] }).matches).eqls([{ bindings: { b: 1 } }]);
    });

    it('every combines the matches of its rules', function () {
      const run = odoyle.compile({ every: [
        { for: { each: { key: 'xs' }, as: 'a' } },
        { for: { each: { key: 'ys' }, as: 'b' } }
      ] });

      assume(run({ xs: [1, 2], ys: ['p'] }).matches.length).equals(2);
      assume(run({ xs: [1], ys: [] }).pass).is.false();
    });

    it('not inverts, and when guards', function () {
      const run = odoyle.compile({ when: { op: '=', args: [{ key: 'a' }, 1] }, not: { op: '=', args: [{ key: 'b' }, 2] } });

      assume(run({ a: 1, b: 3 }).pass).is.true();
      assume(run({ a: 1, b: 2 }).pass).is.false();
      assume(run({ a: 0, b: 3 }).pass).is.false();
    });

    it('gives host bindings to the rules', function () {
      const run = odoyle.compile({ op: '=', args: ['$v', 1] }, { vars: ['v'] });

      assume(run({}, { v: 1 }).pass).is.true();
      assume(run({}, { v: 2 }).pass).is.false();
    });

    it('does not change the host bindings object', function () {
      const run = odoyle.compile({ for: { each: [1], as: 'x' } }, { vars: ['v'] });
      const host = { v: 1 };

      run({}, host);
      assume(host).eqls({ v: 1 });
    });
  });

  describe('runtime errors', function () {
    it('an op that throws makes evaluate throw, with the path', function () {
      const run = odoyle.compile({ every: [{ op: '=', args: [1, 1] }, { when: { op: 'boom', args: [] } }] });
      const e = fail(() => run({}));

      assume(e).is.instanceOf(OdoyleError);
      assume(e.message).includes('every[1].when.op');
      assume(e.message).includes('kaboom');
      assume(e.cause.message).equals('kaboom');
    });

    it('a throw inside not is not swallowed', function () {
      assume(() => odoyle.compile({ not: { op: 'boom', args: [] } })({})).throws(/kaboom/);
    });

    it('an OdoyleError from a nested evaluation is not wrapped twice', function () {
      const run = odoyle.compile({ for: { each: { key: 'xs' }, as: 'x' }, when: { op: '=', args: [{ op: 'boom', args: [] }, 1] } });
      const e = fail(() => run({ xs: [1] }));

      assume(e.message.match(/kaboom/g).length).equals(1);
    });

    it('rules() catches errors before applying not (v1 behavior)', function () {
      assume(odoyle.rules({}, { op: 'boom', args: [] })).is.false();
      assume(odoyle.rules({}, { not: { op: 'boom', args: [] } })).is.true();
    });

    it('rules() keeps working when the ruleset is invalid', function () {
      assume(odoyle.rules({}, { nope: 1 })).is.true();
      assume(odoyle.rules({}, { every: 1 })).is.false();
    });
  });

  describe('#schema', function () {
    it('limits op names and adds args schemas', function () {
      const doc = odoyle.schema({ extra: { report: { type: 'object' } } });

      assume(doc.$defs.opName.enum).includes('double');
      assume(doc.$defs.node.properties.report).eqls({ type: 'object' });
      assume(doc.$defs.node.allOf.some((c) => c.if.properties.op.const === 'double')).is.true();
    });

    it('describes valid and invalid rulesets', async function () {
      const { default: Ajv } = await import('ajv/dist/2020.js');
      const validate = new Ajv({ strict: false }).compile(odoyle.schema());

      assume(validate({ for: { each: { key: 'xs' }, as: 'x' }, when: { op: 'double', args: [2] } })).is.true();
      assume(validate({ op: 'nope' })).is.false();
      assume(validate({ op: 'double', args: ['text'] })).is.false();
      assume(validate({ for: { each: 1 } })).is.false();
    });
  });
});
