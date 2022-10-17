# O'Doyle Rules!

Odoyle is the core of Rules Engine. It's sole purpose is to execute your
defined rules against a given set data and return if the given rules are
satisfied or not.

> **Trivia** This package is named Family O'Doyle (bullies) from the movie Billy
> Madison (1995) where would say O'Doyle Rules after pulling a "prank" on Billy.

## Installation

The package is published to the npm registry and can be installed by running
the following command in your CLI:

```
npm install --save odoyle
```

## Usage

The `Odoyle` class accepts a single, optional, argument:

- `ops` An `Object` that contains all operators that your rules can use. See
  [Custom operators](#custom-operators) for more detailed information.

```js
const Odoyle = require('odoyle');
const odoyle = new Odoyle();
```

### `odoyle.rules`

The `rules` method executes the given rules, against the given dataset and
returns a `boolean` that indicates if the rules pass or not. The method
accepts the following arguments:

- `data` An `Object` that contains data that the rules can reference using the
  `key` property in the rules definition.
- `ruleset` An `Array` or `Object` that represents the rule(s) that needs to
  be executed against the dataset. See [Defining rules](#defining-rules) to
  learn how to create the rules.

```js
const data = { foo: 90 };
const rules = { key: 'foo', op: '>=', value: 30 };

odoyle.rules(data, rules); // True as 90 >= 30
```

## Defining rules

A rule is represented as single `Object` that has the following keys:

- `key` Which data it should use as input value. The key can use a dot notation
  e.g. `foo.bar` to reach into deeply nested structures of the dataset to select
  the data point.
- `value` Expected value used by the operator.
- `op` The [operator](#operators) that should be ran against the input and value.

If we want to create a rule that only triggers when `clicks >= 20` we would
describe it in such a manner:

```js
{
  key: 'clicks',
  op: '>=',
  value: 20
}
```

When rules are wrapped in an `Array` we automatically assume that **every** rule
in the array needs to be pass. You can alter this behavior by using an object
that specifies the in which condition the rule needs to be executed. We
support the following conditions:

- `every` All rules should be satisfied.
- `some` Only one rule needs to be satisfied.
- `not` None of the rules should be satisfied.

```js
{
  every: [
    {
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
    { key: 'clicks', op: '<', value: 20 },
    { key: 'clicks', op: '>', value: 10 }
  ],
  some: [
    { key: 'another', op: '>', value: 10 },
    { key: 'another', op: '<', value: 10 }
  ]
}
```

> Note that you can nest conditions as deeply as you want and combine it with
> other conditions even to create complex rules that might need to react to
> multiple data points.

### Operators

There are various of operators that your rule can use to determine if it
satisfied the rule or not. Note that all `>/<` based operators only function
correctly when it's given a numeric value, while the `=/~/$/^` function

- `=` `input == value`
- `!=` `input !== value`
- `>` `input > value`
- `>=` `input >= value`
- `<` `input < value`
- `<=` `input <= value`
- `~` `input.contains(value)`
- `^` `input.startsWith(value)`
- `$` `input.endsWith(value)`

> We've opted to use symbols/operators instead of fully named words such as
> `lessThanInclusive` to reduce the potential size of your rulesets if you
> where to store them as JSON objects in databases etc.

### Custom operators

In addition to the default [operators](#operators), you can create your own
operators. The first argument of the `Odoyle` class accepts an `Object`
where the key is the `operator`, and the value a `function` that executes
the requested operation. Thee function receives 2 arguments:

- `input` The value that is read from the given dataset.
- `value` The `value` that is defined in the rule.

```js
const odoyle = new Odoyle({
  '=': (input, value) => input === value,
  '>=': (input, value) => input >== value,
})
```

In addition to overriding the default set, you can also directly manipulate the
`ops` property of the class to add, remove, or override operators. The `ops`
property is the `Map()` instance that stores the defined operators.

```js
const odoyle = new Odoyle();

odoyle.ops.set('===', (input, value) => input === value);
```

Note that we still assume the operator as first argument, and the function that
executes the operation as second argument.

# Debugging

The project uses [diagnostics](https://github.com/3rd-Eden/diagnostics) to add
debugging information to the project. Start your application with:

```
DEBUG=odoyle
```

To get information why certain rules failed. E.g. you supplied a `key` but we
couldn't extract the data, or the provided `op` doesn't exist. Maybe a JS
was caused during the execution.

# License

[MIT](./LICENSE)
