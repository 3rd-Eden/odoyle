import { describe, it, before } from 'mocha';
import Odoyle from '../index.js';
import assume from 'assume';

describe('odoyle', function () {
  let odoyle;

  before(function () {
    odoyle = new Odoyle();
  });

  it('has an `ops` property with the default ops', function () {
    assume(odoyle.ops).is.a('map');
    assume(odoyle.ops.has('>=')).is.true();
  });

  describe('#rules', function () {
    it('is a function', function () {
      assume(odoyle.rules).is.a('function');
    });

    it('sees a thrown error as a failed rule (v1 behavior)', function () {
      const another = new Odoyle({ ops: { error() { throw new Error('Booom'); } } });

      assume(another.rules({ foo: 'bar' }, { key: 'foo', op: 'error', value: 30 })).is.false();
    });

    it('falls back to = for an unknown op (v1 behavior)', function () {
      assume(odoyle.rules({ foo: 30 }, { key: 'foo', op: 'nope', value: 30 })).is.true();
    });

    it('accepts the v1 README examples', function () {
      assume(odoyle.rules({ foo: 90 }, { key: 'foo', op: '>=', value: 30 })).is.true();
      assume(odoyle.rules({ clicks: 25 }, { key: 'clicks', op: '>=', value: 20 })).is.true();
    });

    it('runs the large README example', function () {
      const rules = {
        every: [
          { some: [
            { key: 'clicks', op: '=', value: 300 },
            { every: [{ key: 'clicks', op: '=', value: 19 }, { key: 'another', op: '=', value: 77 }] }
          ] },
          { key: 'clicks', op: '<', value: 20 },
          { key: 'clicks', op: '>', value: 10 }
        ],
        some: [
          { key: 'another', op: '>', value: 10 },
          { key: 'another', op: '<', value: 10 }
        ]
      };

      assume(odoyle.rules({ clicks: 19, another: 77 }, rules)).is.true();
      assume(odoyle.rules({ clicks: 19, another: 10 }, rules)).is.false();
    });

    [
      {
        eq: true,
        desc: 'Defaults to (=) operator when no `op` key is given (sane default)',
        data: { clicks: 40 },
        rules: { key: 'clicks', value: 40 }
      },
      {
        eq: false,
        desc: 'Fails when a non-existing key is requested',
        data: { clicks: 40 },
        rules: { key: 'should-not-exist', value: 40 }
      },
      {
        eq: true,
        desc: 'Passes the (=) operator',
        data: { clicks: 40 },
        rules: { key: 'clicks', op: '=', value: 40 }
      },
      {
        eq: false,
        desc: 'Fails the (=) operator',
        data: { clicks: 41 },
        rules: { key: 'clicks', op: '=', value: 40 }
      },
      {
        eq: true,
        desc: 'Passes the (!=) operator',
        data: { clicks: 41 },
        rules: { key: 'clicks', op: '!=', value: 40 }
      },
      {
        eq: false,
        desc: 'Fails the (!=) operator',
        data: { clicks: 40 },
        rules: { key: 'clicks', op: '!=', value: 40 }
      },
      {
        eq: true,
        desc: 'Passes the (>) operator',
        data: { clicks: 42 },
        rules: { key: 'clicks', op: '>', value: 40 }
      },
      {
        eq: false,
        desc: 'Fails the (>) operator',
        data: { clicks: 12 },
        rules: { key: 'clicks', op: '>', value: 40 }
      },
      {
        eq: true,
        desc: 'Passes the (>=) operator',
        data: { clicks: 40 },
        rules: { key: 'clicks', op: '>=', value: 40 }
      },
      {
        eq: true,
        desc: 'Passes the (>=) operator',
        data: { clicks: 439 },
        rules: { key: 'clicks', op: '>=', value: 40 }
      },
      {
        eq: false,
        desc: 'Fails the (>=) operator',
        data: { clicks: 12 },
        rules: { key: 'clicks', op: '>=', value: 40 }
      },
      {
        eq: true,
        desc: 'Passes the (<) operator',
        data: { clicks: 7 },
        rules: { key: 'clicks', op: '<', value: 40 }
      },
      {
        eq: false,
        desc: 'Fails the (<) operator',
        data: { clicks: 42 },
        rules: { key: 'clicks', op: '<', value: 40 }
      },
      {
        eq: true,
        desc: 'Passes the (<=) operator',
        data: { clicks: 40 },
        rules: { key: 'clicks', op: '<=', value: 40 }
      },
      {
        eq: true,
        desc: 'Passes the (<=) operator',
        data: { clicks: 39 },
        rules: { key: 'clicks', op: '<=', value: 40 }
      },
      {
        eq: false,
        desc: 'Fails the (>=) operator',
        data: { clicks: 1224 },
        rules: { key: 'clicks', op: '<=', value: 40 }
      },
      {
        eq: true,
        desc: 'Passes the (~) operator',
        data: { example: 'this is amazing' },
        rules: { key: 'example', op: '~', value: 'is' }
      },
      {
        eq: false,
        desc: 'Fails the (~) operator',
        data: { example: 'this is amazing' },
        rules: { key: 'example', op: '~', value: 'what' }
      },
      {
        eq: true,
        desc: 'Passes the (^) operator',
        data: { example: 'this is amazing' },
        rules: { key: 'example', op: '^', value: 'this' }
      },
      {
        eq: false,
        desc: 'Fails the (^) operator',
        data: { example: 'this is amazing' },
        rules: { key: 'example', op: '^', value: 'amazing' }
      },
      {
        eq: true,
        desc: 'Passes the ($) operator',
        data: { example: 'this is amazing' },
        rules: { key: 'example', op: '$', value: 'amazing' }
      },
      {
        eq: false,
        desc: 'Fails the ($) operator',
        data: { example: 'this is amazing' },
        rules: { key: 'example', op: '$', value: 'this' }
      },
      {
        eq: true,
        desc: 'Can access deeply nested data using dot notation',
        data: {
          example: {
            of: {
              nested: 'content'
            }
          }
        },
        rules: { key: 'example.of.nested', op: '=', value: 'content' }
      },
      {
        eq: true,
        desc: 'Supports arrays with multiple rules',
        data: { example: 'this is amazing' },
        rules: [
          { key: 'example', op: '$', value: 'amazing' },
          { key: 'example', op: '$', value: 'amazing' }
        ]
      },
      {
        eq: false,
        desc: 'Fails when a single rule in the array results into false',
        data: { example: 'this is amazing' },
        rules: [
          { key: 'example', op: '$', value: 'amazing' },
          { key: 'example', op: '$', value: 'amazing' },
          { key: 'example', op: '$', value: 'this' }
        ]
      },
      {
        eq: true,
        desc: 'Supports a `not` condition',
        data: { clicks: 39, another: 'foo' },
        rules: {
          not: [
            { key: 'foo', op: '=', value: 'bar' },
            { key: 'clicks', op: '<', value: 10 }
          ]
        }
      },
      {
        eq: true,
        desc: 'Only one rule of an `some` condition needs to pass',
        data: { clicks: 39 },
        rules: {
          some: [
            { key: 'clicks', op: '>', value: 10 },
            { key: 'clicks', op: '<', value: 10 }
          ]
        }
      },
      {
        eq: false,
        desc: 'Fails if all `some` conditions fails',
        data: { clicks: 39 },
        rules: {
          some: [
            { key: 'clicks', op: '<', value: 10 },
            { key: 'clicks', op: '<', value: 10 }
          ]
        }
      },
      {
        eq: true,
        desc: 'Passes if all `every` conditions passes',
        data: { clicks: 9 },
        rules: {
          every: [
            { key: 'clicks', op: '<', value: 10 },
            { key: 'clicks', op: '<', value: 10 }
          ]
        }
      },
      {
        eq: false,
        desc: 'Fails if one in the `every` conditions fails',
        data: { clicks: 9 },
        rules: {
          every: [
            { key: 'clicks', op: '<', value: 10 },
            { key: 'clicks', op: '<', value: 8 }
          ]
        }
      },
      {
        eq: true,
        desc: 'Run both `every` and `some` conditions successfully',
        data: { clicks: 2, another: 77 },
        rules: {
          every: [
            { key: 'clicks', op: '<', value: 10 },
            { key: 'clicks', op: '<', value: 8 }
          ],
          some: [
            { key: 'another', op: '>', value: 10 },
            { key: 'another', op: '>', value: 10 }
          ]
        }
      },
      {
        eq: false,
        desc: 'Run both `every` and `some` conditions, but some fails the some',
        data: { clicks: 12, another: 77 },
        rules: {
          every: [
            { key: 'clicks', op: '<', value: 10 },
            { key: 'clicks', op: '<', value: 8 }
          ],
          some: [
            { key: 'another', op: '<', value: 10 },
            { key: 'another', op: '<', value: 10 }
          ]
        }
      },
      {
        eq: false,
        desc: 'Run both `every` and `some` conditions, but some fails the every',
        data: { clicks: 19, another: 77 },
        rules: {
          every: [
            { key: 'clicks', op: '<', value: 10 },
            { key: 'clicks', op: '<', value: 8 }
          ],
          some: [
            { key: 'another', op: '>', value: 10 },
            { key: 'another', op: '>', value: 10 }
          ]
        }
      },
      {
        eq: true,
        desc: 'Run nested queries',
        data: { clicks: 19, another: 77 },
        rules: {
          some: [
            { key: 'clicks', op: '=', value: 300 },
            {
              every: [
                { key: 'clicks', op: '=', value: 19 },
                { key: 'another', op: '=', value: 77 }
              ]
            }
          ]
        }
      },
      {
        eq: true,
        desc: 'Runs complex queries',
        data: { visits: 6, clicks: 40 },
        rules: {
          some: [
            {
              every: [
                { key: 'clicks', op: '=', value: 40 },
                { key: 'visits', op: '>=', value: 5 }
              ]
            }, {
              every: [
                { key: 'clicks', op: '=', value: 48 },
                { key: 'visits', op: '>=', value: 6 }
              ]
            }
          ]
        }
      }
    ].forEach(function each({ desc, eq, data, rules }) {
      it(desc, function () {
        assume(odoyle.rules(data, rules)).equals(eq);
      });
    });
  });
});
