const get = require('propget');

/**
 * O'Doyle Rules!
 *
 * A simple business rules engine.
 */
class Odoyle {
  /**
   * Create a new Odoyle instance.
   *
   * @param {Object} ops Supported operations.
   * @public
   */
  constructor(ops) {
    this.ops = new Map(Object.entries(ops || {
      '=': (input, value) => input == value,
      '!=': (input, value) => input !== value,
      '>': (input, value) => input > value,
      '>=': (input, value) => input >= value,
      '<': (input, value) => input < value,
      '<=': (input, value) => input <= value,
      '~': (input, value) => input.includes(value),
      '^': (input, value) => input.startsWith(value),
      '$': (input, value) => input.endsWith(value)
    }));
  }

  /**
   * Parses the query and checks if there is a match with the value.
   *
   * @param {Object} data The data that can be referenced by the rules.
   * @param {Object} meta The rule specification.
   * @param {String} meta.op The operator to execute.
   * @param {Number|String} meta.value Value it should match.
   * @param {String} meta.key The key of the dataset it matches against.
   * @returns {Boolean} If the query is satisfied.
   * @private
   */
  exec(data, rule = {}) {
    //
    // We need to determine if we are dealing with a set of rules before we
    // continue as this means we need to start a new odoyle operation.
    //
    if (('some' in rule || 'every' in rule)) {
      return this.rules(data, rule);
    }

    const input = get(data, rule.key);
    if (input === void 0) return false;

    return (this.ops.get(rule.op) || this.ops.get('='))(input, rule.value);
  }

  /**
   * Runs the data against a given set of rules to see if satisfied them.
   *
   * @param {Object} data Data that is referenced by the rules using it's `key` prop.
   * @param {Array<>Object} rules The rules that need to be executed.
   * @returns {Boolean} Indication of the rules are satisfied.
   * @public
   */
  rules(data = {}, ruleset = {}) {
    const exec = this.exec.bind(this, data);

    return (Array.isArray(ruleset) ? ruleset : [ ruleset ]).every((rule) => {
      let result = true;

      try {
        if (result && 'every' in rule) result = rule.every.every(exec);
        if (result && 'some' in rule) result = rule.some.some(exec);
        if (result && 'not' in rule) result = !this.rules(data, rule.not);
        if (result && 'value' in rule && 'key' in rule) result = exec(rule);
      } catch (e) {
        result = false;
      }

      return result;
    });
  }
}

module.exports = Odoyle;
