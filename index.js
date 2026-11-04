import Ajv from 'ajv/dist/2020.js';
import SCHEMA from './schema.json' with { type: 'json' };

/**
 * O'Doyle Rules!
 *
 * A small rules engine. A ruleset is plain data (a parsed JSON or YAML
 * object). `compile()` checks it once and returns an evaluator.
 */

const ajv = new Ajv({ strict: false, allErrors: true });

/** Keys that start a rule node: they bind, iterate, guard, or combine. */
const STRUCTURE = ['let', 'for', 'when', 'every', 'some', 'not'];

/** Every key that a rule object may have. */
const KEYS = new Set([...STRUCTURE, 'key', 'op', 'args', 'value', 'literal']);

/** A name that can be bound with `let` or `for.as`. */
const NAME = /^[A-Za-z_]\w*$/;

/** A `$name` or `$name.path.to.value` reference. */
const REF = /^\$([A-Za-z_]\w*)((?:\.[^.\s]+)*)$/;

/**
 * Error for a bad ruleset (at compile time) or a failed op (at evaluate time).
 * The message starts with the path of the rule, for example `every[1].when.op`.
 */
export class OdoyleError extends Error {
  /**
   * @param {String} path Location of the rule in the ruleset.
   * @param {String} message What went wrong.
   * @param {Error} [cause] The error that an op threw, if any.
   */
  constructor(path, message, cause) {
    super(`${path || '(root)'}: ${message}`, cause ? { cause } : undefined);
    this.name = 'OdoyleError';
    this.path = path;
  }
}

/**
 * Read a dot-separated path. A missing step gives `undefined`, never an error.
 *
 * @param {*} source Value to read from.
 * @param {String|Array<String>} path Dot notation string or list of steps.
 * @returns {*} The value, or `undefined`.
 */
export function get(source, path) {
  const steps = Array.isArray(path) ? path : String(path).split('.');
  let value = source;

  for (const step of steps) {
    if (value === undefined || value === null) return undefined;
    value = value[step];
  }

  return value;
}

/** Schema for ops that take exactly two arguments. */
const PAIR = { type: 'array', minItems: 2, maxItems: 2 };

/** The ops that every instance has. Hosts can override them. */
const DEFAULTS = {
  '=': { fn: (input, value) => input == value, args: PAIR },
  '!=': { fn: (input, value) => input !== value, args: PAIR },
  '>': { fn: (input, value) => input > value, args: PAIR },
  '>=': { fn: (input, value) => input >= value, args: PAIR },
  '<': { fn: (input, value) => input < value, args: PAIR },
  '<=': { fn: (input, value) => input <= value, args: PAIR },
  '~': { fn: (input, value) => hasMethod(input, 'includes') && input.includes(value), args: PAIR },
  '^': { fn: (input, value) => typeof input === 'string' && input.startsWith(value), args: PAIR },
  '$': { fn: (input, value) => typeof input === 'string' && input.endsWith(value), args: PAIR },
  in: { fn: (value, list) => hasMethod(list, 'includes') && list.includes(value), args: PAIR },
  exists: { fn: (value) => value !== undefined && value !== null, args: { type: 'array', minItems: 1, maxItems: 1 } }
};

/**
 * Check that a value has a method. Used so that string ops give `false`
 * for missing data instead of throwing.
 *
 * @param {*} value Value to test.
 * @param {String} name Method name.
 * @returns {Boolean} True when the method exists.
 */
function hasMethod(value, name) {
  return value !== undefined && value !== null && typeof value[name] === 'function';
}

/**
 * Turn an op definition into its full shape.
 *
 * @param {String} name Op name, used in error messages.
 * @param {Function|Object} def A function or `{ fn, args?, version? }`.
 * @returns {{ fn: Function, args: ?Object, version: ?*}} The normal form.
 */
function normalize(name, def) {
  const op = typeof def === 'function' ? { fn: def } : def;

  if (!op || typeof op.fn !== 'function') {
    throw new TypeError(`op "${name}" must be a function or an object with an "fn" function`);
  }

  return { fn: op.fn, args: op.args || null, version: op.version };
}

/**
 * Check literal arguments of an op call against the `args` schema of the op.
 * Dynamic arguments (keys, variables, op calls) have no value at compile time,
 * so only their count is checked, and literals are checked one by one.
 *
 * @param {Object} schema The op's JSON Schema for its argument list.
 * @param {Array<{ literal: Boolean, value: * }>} args Compiled operands.
 * @returns {?String} A description of the problem, or `undefined`.
 */
function checkArgs(schema, args) {
  const { minItems = 0, maxItems = Infinity } = isObject(schema) ? schema : {};

  if (args.length < minItems) return `expected at least ${minItems} arguments, got ${args.length}`;
  if (args.length > maxItems) return `expected at most ${maxItems} arguments, got ${args.length}`;

  const validate = ajv.compile(schema);
  const values = args.map((arg) => arg.literal ? arg.value : undefined);

  if (validate(values)) return;

  const errors = args.every((arg) => arg.literal) ? validate.errors : validate.errors.filter((error) => {
    if (error.keyword === 'minItems' || error.keyword === 'maxItems' || error.keyword === 'false schema') return true;

    const match = /^\/(\d+)(?:\/|$)/.exec(error.instancePath);

    return match && args[Number(match[1])]?.literal;
  });

  if (!errors.length) return;

  const index = /^\/(\d+)(?:\/|$)/.exec(errors[0].instancePath)?.[1];

  return `${index === undefined ? 'arguments' : `argument ${index}`} ${ajv.errorsText(errors, { dataVar: 'args' })}`;
}

/**
 * Build a child compile context that has one more variable in scope.
 *
 * @param {Object} cx Parent context.
 * @param {String} name The new variable.
 * @returns {Object} The child context. It is no longer inside a `let` value.
 */
function child(cx, name) {
  return { ...cx, names: new Set(cx.names).add(name), self: null };
}

/**
 * Run rules one after the other. All of them must hold. When a rule has
 * several matches (it has a `for`), the result is every combination, and the
 * bindings of later rules shadow those of earlier ones.
 *
 * @param {Array<Object>} start The matches so far.
 * @param {Array<Function>} runs Rule runners.
 * @param {*} data The data.
 * @param {Object} scope The variables in scope.
 * @returns {?Array<Object>} The combined matches, or `null` when a rule fails.
 */
function join(start, runs, data, scope) {
  let found = start;

  for (const run of runs) {
    const next = run(data, scope);

    if (!next.length) return null;

    found = found.flatMap((a) => next.map((b) => ({ ...a, ...b })));
  }

  return found;
}

/**
 * Is this a plain object (not an array, not null)?
 *
 * @param {*} value Value to test.
 * @returns {Boolean} True for plain objects.
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build a list of values from the result of a `for.each` operand.
 *
 * @param {*} value The collection.
 * @param {String} path Path for the error message.
 * @returns {Array} The items. Missing data gives an empty list.
 */
function items(value, path) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' && typeof value[Symbol.iterator] === 'function') return [...value];

  throw new OdoyleError(path, 'for.each must give an array or an iterable');
}

/**
 * The rules engine.
 */
export default class Odoyle {
  /**
   * @param {Object} [options] Instance options.
   * @param {Object<String, Function|{fn: Function, args?: Object, version?: *}>} [options.ops]
   *   Ops to add to the default ops. An op with the same name replaces the default.
   */
  constructor({ ops = {} } = {}) {
    this.ops = new Map();

    for (const [name, def] of Object.entries({ ...DEFAULTS, ...ops })) {
      this.ops.set(name, normalize(name, def));
    }
  }

  /**
   * Check a ruleset and return an evaluator for it. Throws an `OdoyleError`
   * with the rule path when the ruleset is not valid.
   *
   * @param {Object|Array} ruleset The rules. An array means `every`.
   * @param {Object} [options] Compile options.
   * @param {Array<String>} [options.vars] Names of variables that the host gives to `evaluate()`.
   * @param {Array<String>} [options.extra] Extra keys the host keeps in rule objects (for example `report`). They are ignored.
   * @param {Boolean} [options.legacy] Use the version 1 behavior (see `rules()`).
   * @returns {function(Object, Object=): {pass: Boolean, matches: Array<{bindings: Object}>}}
   *   `evaluate(data, bindings)`.
   * @public
   */
  compile(ruleset, { vars = [], extra = [], legacy = false } = {}) {
    const cx = { names: new Set(vars), self: null, extra: new Set(extra), legacy };
    const run = this.rule(ruleset, '', cx);

    return function evaluate(data = {}, bindings = {}) {
      const scope = Object.assign(Object.create(null), bindings);
      const matches = run(data, scope).map((found) => ({ bindings: found }));

      return { pass: matches.length > 0, matches };
    };
  }

  /**
   * Version 1 compatible check. Returns only a boolean. Missing data, unknown
   * ops and thrown errors all give `false`, as in version 1.
   *
   * @param {Object} data Data that the rules read with `key`.
   * @param {Object|Array} ruleset The rules.
   * @returns {Boolean} True when the rules match.
   * @public
   */
  rules(data = {}, ruleset = {}) {
    try {
      return this.compile(ruleset, { legacy: true })(data).pass;
    } catch {
      return false;
    }
  }

  /**
   * Compile a rule. A rule gives a list of matches: one entry (the bindings
   * made by the rule) for every iteration that holds. An empty list means
   * the rule does not hold.
   *
   * @param {*} rule An array (every), an object, or an operand.
   * @param {String} path Location for error messages.
   * @param {Object} cx Compile context.
   * @returns {function(*, Object): Array<Object>} Runner `(data, scope) => matches`.
   * @private
   */
  rule(rule, path, cx) {
    if (Array.isArray(rule)) {
      return this.protect(this.group('every', rule, path, cx), cx);
    }

    if (!isObject(rule)) {
      const operand = this.operand(rule, path, cx);

      return this.protect((data, scope) => operand.run(data, scope) ? [{}] : [], cx);
    }

    for (const key of Object.keys(rule)) {
      if (!KEYS.has(key) && !cx.extra.has(key) && !cx.legacy) {
        throw new OdoyleError(`${path}${path ? '.' : ''}${key}`, `unknown property "${key}"`);
      }
    }

    const at = (key) => `${path}${path ? '.' : ''}${key}`;
    let inner = cx;
    let loop;

    if ('for' in rule) {
      const { each, as, ...rest } = isObject(rule.for) ? rule.for : {};

      if (typeof as !== 'string' || !NAME.test(as) || each === undefined || Object.keys(rest).length) {
        throw new OdoyleError(at('for'), 'for must be { each, as } and "as" must be a name');
      }

      loop = { as, each: this.operand(each, at('for.each'), cx), path: at('for.each') };
      inner = child(cx, as);
    }

    const lets = [];

    if ('let' in rule) {
      if (!isObject(rule.let)) throw new OdoyleError(at('let'), 'let must be an object of name: operand');

      for (const [name, expr] of Object.entries(rule.let)) {
        if (!NAME.test(name)) throw new OdoyleError(at(`let.${name}`), `"${name}" is not a valid name`);

        lets.push({ name, operand: this.operand(expr, at(`let.${name}`), { ...inner, self: name }) });
        inner = child(inner, name);
      }
    }

    const guard = 'when' in rule ? this.rule(rule.when, at('when'), inner) : null;
    const checks = [];

    if ('every' in rule) checks.push(this.group('every', rule.every, at('every'), inner));
    if ('some' in rule) checks.push(this.group('some', rule.some, at('some'), inner));

    if ('not' in rule) {
      const body = this.rule(rule.not, at('not'), inner);

      checks.push((data, scope) => body(data, scope).length ? [] : [{}]);
    }

    if ('op' in rule || 'key' in rule || 'literal' in rule) {
      const operand = this.operand(rule, path, inner, true);

      checks.push((data, scope) => operand.run(data, scope) ? [{}] : []);
    }

    const run = (data, scope) => {
      const found = [];
      const rounds = loop ? items(loop.each.run(data, scope), loop.path) : [undefined];

      for (const item of rounds) {
        const frame = Object.assign(Object.create(null), scope);
        const local = {};

        if (loop) {
          frame[loop.as] = item;
          Object.defineProperty(local, loop.as, { value: item, enumerable: true, configurable: true, writable: true });
        }

        for (const { name, operand } of lets) {
          const value = operand.run(data, frame);

          frame[name] = value;
          Object.defineProperty(local, name, { value, enumerable: true, configurable: true, writable: true });
        }

        if (guard && !guard(data, frame).length) continue;

        const merged = join([local], checks, data, frame);

        if (merged) found.push(...merged);
      }

      return found;
    };

    return this.protect(run, cx);
  }

  /**
   * In legacy mode, errors make a rule fail. Wraps each rule runner.
   *
   * @param {Function} run A rule runner.
   * @param {Object} cx Compile context.
   * @returns {Function} The same runner, or a wrapped one.
   * @private
   */
  protect(run, cx) {
    if (!cx.legacy) return run;

    return (data, scope) => {
      try {
        return run(data, scope);
      } catch {
        return [];
      }
    };
  }

  /**
   * Compile `every` or `some`. Both stop at the first rule that decides it.
   *
   * @param {'every'|'some'} kind Which one.
   * @param {Array} list The rules.
   * @param {String} path Location for error messages.
   * @param {Object} cx Compile context.
   * @returns {Function} Runner.
   * @private
   */
  group(kind, list, path, cx) {
    if (!Array.isArray(list)) throw new OdoyleError(path, `${kind} must be an array of rules`);

    const runs = list.map((rule, i) => this.rule(rule, `${path}[${i}]`, cx));

    return kind === 'some'
      ? (data, scope) => {
        for (const run of runs) {
          const found = run(data, scope);

          if (found.length) return found;
        }

        return [];
      }
      : (data, scope) => join([{}], runs, data, scope) || [];
  }

  /**
   * Compile an operand: a literal, `$name`, `{ key }`, `{ op, args }`, or a
   * rule (which gives a boolean).
   *
   * @param {*} value The operand.
   * @param {String} path Location for error messages.
   * @param {Object} cx Compile context.
   * @param {Boolean} [call] The object is already known to be a key/op call.
   * @returns {{ run: Function, literal: Boolean, value: * }} Compiled operand.
   * @private
   */
  operand(value, path, cx, call = false) {
    if (typeof value === 'string') {
      const ref = REF.exec(value);

      return ref ? this.variable(ref, path, cx) : { literal: true, value, run: () => value };
    }

    if (Array.isArray(value)) {
      const parts = value.map((part, i) => this.operand(part, `${path}[${i}]`, cx));
      const literal = parts.every((part) => part.literal);

      return {
        literal,
        value: literal ? parts.map((part) => part.value) : undefined,
        run: (data, scope) => parts.map((part) => part.run(data, scope))
      };
    }

    if (!isObject(value)) return { literal: true, value, run: () => value };

    if (!call && STRUCTURE.some((key) => key in value)) {
      const run = this.rule(value, path, cx);

      return { literal: false, run: (data, scope) => run(data, scope).length > 0 };
    }

    if (!cx.legacy && ('op' in value || 'key' in value)) {
      for (const key of Object.keys(value)) {
        if (!KEYS.has(key) && !cx.extra.has(key)) {
          throw new OdoyleError(`${path}${path ? '.' : ''}${key}`, `unknown property "${key}"`);
        }
      }
    }

    if ('literal' in value) {
      if (Object.keys(value).length > 1) throw new OdoyleError(path, '"literal" cannot be used with other properties');

      return { literal: true, value: value.literal, run: () => value.literal };
    }

    if ('op' in value || ('key' in value && 'value' in value)) return this.call(value, path, cx);

    if ('key' in value) {
      const key = this.key(value, path);

      return { literal: false, run: (data) => get(data, key) };
    }

    return { literal: true, value, run: () => value };
  }

  /**
   * Check and return the `key` of a data reference.
   *
   * @param {Object} value The `{ key }` object.
   * @param {String} path Location for error messages.
   * @returns {Array<String>} The steps of the path.
   * @private
   */
  key(value, path) {
    if (typeof value.key !== 'string' || !value.key) throw new OdoyleError(`${path}.key`, 'key must be a non-empty string');

    return value.key.split('.');
  }

  /**
   * Compile a `$name.path` reference.
   *
   * @param {Array<String>} ref The result of the `REF` expression.
   * @param {String} path Location for error messages.
   * @param {Object} cx Compile context.
   * @returns {Object} Compiled operand.
   * @private
   */
  variable(ref, path, cx) {
    const [, name, rest] = ref;
    const steps = rest ? rest.slice(1).split('.') : [];

    if (cx.self === name) throw new OdoyleError(path, `let binding "${name}" references itself`);
    if (!cx.names.has(name)) throw new OdoyleError(path, `unknown variable "$${name}"`);

    return { literal: false, run: (data, scope) => steps.length ? get(scope[name], steps) : scope[name] };
  }

  /**
   * Compile an op call: `{ op, args }`, or the version 1 form `{ key, op, value }`.
   *
   * @param {Object} node The call object.
   * @param {String} path Location for error messages.
   * @param {Object} cx Compile context.
   * @returns {Object} Compiled operand that gives the value of the op.
   * @private
   */
  call(node, path, cx) {
    const at = (key) => `${path}${path ? '.' : ''}${key}`;
    const form = 'key' in node && !('args' in node);
    const name = 'op' in node ? node.op : '=';
    let op = typeof name === 'string' ? this.ops.get(name) : undefined;

    if (!op && cx.legacy && form) op = this.ops.get('=');
    if (!op) throw new OdoyleError(at('op'), typeof name === 'string' ? `unknown op "${name}"` : 'op must be a string');
    if ('args' in node && 'key' in node) throw new OdoyleError(at('args'), 'use either "args" or "key" and "value", not both');

    let args;

    if ('args' in node) {
      if (!Array.isArray(node.args)) throw new OdoyleError(at('args'), 'args must be an array');

      args = node.args.map((arg, i) => this.operand(arg, at(`args[${i}]`), cx));
    } else if (form) {
      args = [
        this.operand({ key: node.key }, at('key'), cx),
        cx.legacy ? { literal: true, value: node.value, run: () => node.value } : this.operand(node.value, at('value'), cx)
      ];
    } else {
      args = [];
    }

    const problem = op.args && checkArgs(op.args, args);

    if (problem) throw new OdoyleError(at('args'), `op "${name}": ${problem}`);

    const legacyMiss = cx.legacy && form;

    return {
      literal: false,
      run: (data, scope) => {
        const input = args.map((arg) => arg.run(data, scope));

        if (legacyMiss && input[0] === undefined) return false;

        try {
          return op.fn(...input);
        } catch (error) {
          if (error instanceof OdoyleError) throw error;

          throw new OdoyleError(at('op'), `op "${name}" threw: ${error && error.message}`, error);
        }
      }
    };
  }

  /**
   * Build the JSON Schema for rulesets that this instance accepts. It starts
   * from `odoyle/schema.json`, limits `op` to the names of the ops, and adds
   * the `args` schema of every op that has one.
   *
   * @param {Object} [options] Schema options.
   * @param {Object<String, Object>} [options.extra] Schemas of extra rule keys (see `compile()`).
   * @param {Object} base The base schema (default: `schema.json`).
   * @returns {Object} A new JSON Schema document.
   * @public
   */
  schema({ extra = {}, base } = {}) {
    const doc = structuredClone(base || SCHEMA);
    const names = [...this.ops.keys()];

    doc.$id ||= SCHEMA.$id;
    doc.$defs.dynamicOperand ||= SCHEMA.$defs.dynamicOperand;
    doc.$defs.node.properties = { ...doc.$defs.node.properties, ...extra };
    doc.$defs.opName = { enum: names };
    doc.$defs.node.allOf = [...this.ops].filter(([, op]) => op.args).map(([name, op], i) => {
      const args = isObject(op.args) ? structuredClone(op.args) : op.args;

      if (isObject(args)) {
        args.$id ||= `${doc.$id}/op-args/${i}`;

        const operand = (schema) => ({
          anyOf: [
            schema,
            { $ref: `${doc.$id}#/$defs/dynamicOperand` },
            {
              type: 'object',
              required: ['literal'],
              properties: { literal: schema },
              additionalProperties: false
            }
          ]
        });

        if (Array.isArray(args.prefixItems)) args.prefixItems = args.prefixItems.map(operand);
        if ('items' in args) args.items = operand(args.items);
      }

      return {
        if: { required: ['op'], properties: { op: { const: name } } },
        then: { properties: { args } }
      };
    });

    return doc;
  }
}
