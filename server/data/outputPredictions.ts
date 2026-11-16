export interface OutputPredictionSeed {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  concept: string;
  code: string;
  expected_output: string;
  execution_order: string[];
  variable_changes: string[];
  explanation: string;
}

export const OUTPUT_PREDICTION_SNIPPETS: OutputPredictionSeed[] = [
  {
    id: 'op-mutable-default-list',
    title: 'Shared Mutable Default Argument',
    difficulty: 'Medium',
    concept: 'Functions & Default Arguments',
    code: `def add_item(item, bucket=[]):
    bucket.append(item)
    return bucket

a = add_item("x")
b = add_item("y")
print(a, b, a is b)`,
    expected_output: "['x', 'y'] ['x', 'y'] True",
    execution_order: [
      'Line 1: Python evaluates default value bucket=[] once when def add_item is defined.',
      'Line 5: add_item("x") appends "x" to that default list and binds a to it.',
      'Line 6: add_item("y") reuses the exact same default list, appending "y", and binds b to it.',
      'Line 7: Both a and b point to the same list object, so a is b is True.',
    ],
    variable_changes: [
      'def time: add_item.__defaults__ = ([],)',
      'after line 5: a -> ["x"]',
      'after line 6: a -> ["x", "y"], b -> ["x", "y"]',
    ],
    explanation:
      'Default argument expressions are evaluated once when the function is defined, not on each call. Always default to None and initialize a fresh list inside the function.',
  },
  {
    id: 'op-bool-subclass-int',
    title: 'Booleans as Integer Subclasses',
    difficulty: 'Easy',
    concept: 'Data Types & Truthiness',
    code: `values = [True, False, True, 3]
print(sum(values), isinstance(True, int))`,
    expected_output: '5 True',
    execution_order: [
      'Line 1: Creates list [True, False, True, 3].',
      'Line 2: sum() treats True as 1 and False as 0 because bool subclasses int.',
      'Line 2: isinstance(True, int) returns True.',
    ],
    variable_changes: ['values = [True, False, True, 3]', '1 + 0 + 1 + 3 = 5'],
    explanation:
      'In Python, bool is a subclass of int where True == 1 and False == 0. Use `not isinstance(x, bool)` when filtering strictly for numeric ints.',
  },
  {
    id: 'op-legb-unbound-local',
    title: 'LEGB Scope & Closure Late Binding',
    difficulty: 'Medium',
    concept: 'Closures & LEGB Scope',
    code: `funcs = [lambda x: x + i for i in range(3)]
print([f(10) for f in funcs])`,
    expected_output: '[12, 12, 12]',
    execution_order: [
      'Line 1: List comprehension creates 3 lambda functions sharing the loop variable i.',
      'Line 1: After loop completes, i == 2.',
      'Line 2: Calling each lambda looks up i dynamically at call time -> 10 + 2 = 12.',
    ],
    variable_changes: ['i = 0 -> 1 -> 2 (final)', 'f(10) evaluates 10 + 2 three times'],
    explanation:
      'Python closures bind free variables by name, not by value at creation time. To capture each iteration’s value eagerly, pass `i=i` as a default argument.',
  },
  {
    id: 'op-list-aliasing-slice',
    title: 'List Aliasing vs Slice Copy',
    difficulty: 'Easy',
    concept: 'References & Shallow Copying',
    code: `a = [1, 2, 3]
b = a
c = a[:]
b.append(4)
c.append(5)
print(a, c)`,
    expected_output: '[1, 2, 3, 4] [1, 2, 3, 5]',
    execution_order: [
      'Line 1: Allocates list [1, 2, 3] and binds a.',
      'Line 2: b aliases the exact same list as a.',
      'Line 3: c creates a shallow slice copy.',
      'Line 4: b.append(4) mutates the shared object visible through a.',
      'Line 5: c.append(5) mutates only c.',
    ],
    variable_changes: ['a & b -> [1, 2, 3, 4]', 'c -> [1, 2, 3, 5]'],
    explanation:
      'Assignment creates a new name pointing to the same object; slicing (`a[:]`) or `.copy()` creates a new outer list.',
  },
  {
    id: 'op-finally-override',
    title: 'Finally Block Overrides Return',
    difficulty: 'Medium',
    concept: 'Exception Handling',
    code: `def compute():
    try:
        return "try"
    finally:
        return "finally"

print(compute())`,
    expected_output: 'finally',
    execution_order: [
      'Line 2-3: Evaluates return "try", pauses return to run finally.',
      'Line 4-5: finally executes return "finally", discarding the pending "try" return value.',
    ],
    variable_changes: ['pending return "try" -> replaced by "finally"'],
    explanation:
      'A return statement inside a finally block always executes before the function exits and supersedes any return or exception from try/except.',
  },
  {
    id: 'op-chained-comparison',
    title: 'Chained Comparisons & Precedence',
    difficulty: 'Medium',
    concept: 'Operators & Comparisons',
    code: `print(1 < 2 == True, 1 < 2 < 3)`,
    expected_output: 'False True',
    execution_order: [
      'Evaluates `1 < 2 == True` as `(1 < 2) and (2 == True)`.',
      '1 < 2 is True, 2 == True is False -> False.',
      'Evaluates `1 < 2 < 3` as `(1 < 2) and (2 < 3)` -> True.',
    ],
    variable_changes: ['2 == True -> False (since True is 1)'],
    explanation:
      'Python chains comparison operators implicitly (`a op1 b op2 c` becomes `a op1 b and b op2 c`). Since `2 != 1`, `2 == True` evaluates to False.',
  },
  {
    id: 'op-dict-bool-key-collision',
    title: 'Dictionary Key Hash Collision (1, True, 1.0)',
    difficulty: 'Medium',
    concept: 'Dictionaries & Hashing',
    code: `d = {}
d[1] = "int"
d[True] = "bool"
d[1.0] = "float"
print(len(d), d[1])`,
    expected_output: '1 float',
    execution_order: [
      'Line 2: Inserts key 1 -> "int".',
      'Line 3: True == 1 and hash(True) == hash(1), so d[True] overwrites key 1’s value with "bool" while keeping key 1.',
      'Line 4: 1.0 == 1 and hash(1.0) == hash(1), so d[1.0] updates the same entry to "float".',
    ],
    variable_changes: ['d = {1: "int"} -> {1: "bool"} -> {1: "float"}'],
    explanation:
      'Python dictionary keys match when `a == b` and `hash(a) == hash(b)`. Because `1 == True == 1.0` and all share hash `1`, they map to the same slot.',
  },
  {
    id: 'op-tuple-augmented-assign',
    title: 'Tuple Augmented Assignment Trap',
    difficulty: 'Hard',
    concept: 'Immutability & Operators',
    code: `t = ([1, 2], "ok")
try:
    t[0] += [3]
except TypeError as e:
    print("err", t[0])`,
    expected_output: 'err [1, 2, 3]',
    execution_order: [
      'Line 3: `t[0] += [3]` calls `list.__iadd__`, mutating `t[0]` in-place to `[1, 2, 3]` and returning the list.',
      'Line 3: Python then attempts to assign `t[0] = <result>` on the immutable tuple, raising TypeError.',
      'Line 4-5: Caught by except, printing "err" and the already-mutated `t[0]`.',
    ],
    variable_changes: ['t[0] mutated to [1, 2, 3] BEFORE tuple item assignment raises TypeError'],
    explanation:
      'Augmented assignment on a sequence element (`+=`) both mutates a mutable item in place and attempts re-assignment to the parent tuple, causing both mutation and TypeError.',
  },
  {
    id: 'op-generator-exhaustion',
    title: 'Single-Pass Generator Consumption',
    difficulty: 'Easy',
    concept: 'Generators & Iterators',
    code: `gen = (x * 2 for x in range(3))
print(list(gen))
print(list(gen))`,
    expected_output: '[0, 2, 4]\n[]',
    execution_order: [
      'Line 1: Creates lazy generator object without running loop.',
      'Line 2: Consumes all 3 items -> [0, 2, 4].',
      'Line 3: Generator is already exhausted -> [].',
    ],
    variable_changes: ['gen exhausted after line 2'],
    explanation:
      'Generators yield values lazily once and raise StopIteration thereafter. Convert to a list or tuple if multiple passes are needed.',
  },
  {
    id: 'op-mro-super',
    title: 'Diamond Inheritance & C3 MRO',
    difficulty: 'Hard',
    concept: 'OOP & Inheritance',
    code: `class A:
    def who(self):
        return ["A"]

class B(A):
    def who(self):
        return ["B"] + super().who()

class C(A):
    def who(self):
        return ["C"] + super().who()

class D(B, C):
    def who(self):
        return ["D"] + super().who()

print("->".join(D().who()))`,
    expected_output: 'D->B->C->A',
    execution_order: [
      'D.mro() is [D, B, C, A, object].',
      'D.who() calls super().who() -> B.who().',
      'B.who() calls super().who() -> C.who() (NOT A yet!).',
      'C.who() calls super().who() -> A.who().',
    ],
    variable_changes: ['Call chain follows C3 linearization: D -> B -> C -> A'],
    explanation:
      '`super()` delegates to the next class in `type(self).__mro__` (C3 linearization), ensuring `A.who()` runs once after both `B` and `C`.',
  },
  {
    id: 'op-short-circuit-or-and',
    title: 'Boolean Short-Circuit Return Values',
    difficulty: 'Easy',
    concept: 'Truthiness & Logic',
    code: `print("" or "fallback" and "final")`,
    expected_output: 'final',
    execution_order: [
      '`and` has higher precedence than `or`, so this parses as `"" or ("fallback" and "final")`.',
      '`"fallback"` is truthy, so `"fallback" and "final"` returns `"final"`.',
      '`""` is falsy, so `"" or "final"` returns `"final"`.',
    ],
    variable_changes: ['"" or "final" -> "final"'],
    explanation:
      'Python `and`/`or` return one of the actual operand values rather than forcing a bool, with `and` binding tighter than `or`.',
  },
  {
    id: 'op-starred-unpacking',
    title: 'Extended Iterable Unpacking',
    difficulty: 'Easy',
    concept: 'Tuples & Unpacking',
    code: `first, *mid, last = [10, 20]
print(first, mid, last)`,
    expected_output: '10 [] 20',
    execution_order: [
      'Line 1: first gets 10, last gets 20, *mid captures zero remaining elements as an empty list [].',
      'Line 2: Prints 10 [] 20.',
    ],
    variable_changes: ['first = 10', 'mid = []', 'last = 20'],
    explanation:
      'The starred target in iterable unpacking always produces a `list`, even when 0 or 1 elements match it.',
  },
  {
    id: 'op-slice-out-of-bounds',
    title: 'Slicing Past Bounds & Negative Step',
    difficulty: 'Easy',
    concept: 'Strings & Slicing',
    code: `s = "python"
print(s[10:20], s[::-2])`,
    expected_output: ' nhy',
    execution_order: [
      's[10:20] safely clamps out-of-range slice bounds and returns empty string "".',
      's[::-2] steps backward by 2 from index 5 ("n", "h", "y") -> "nhy".',
      'print("", "nhy") separates arguments with a single space -> " nhy".',
    ],
    variable_changes: ['s[10:20] = ""', 's[::-2] = "nhy"'],
    explanation:
      'Unlike indexing (`s[10]`, which raises IndexError), slicing gracefully clamps bounds. Negative steps traverse from right to left.',
  },
  {
    id: 'op-class-vs-instance-attr',
    title: 'Class Attribute Shadowing',
    difficulty: 'Medium',
    concept: 'OOP & Attribute Lookup',
    code: `class Counter:
    count = 0

a = Counter()
b = Counter()
a.count += 1
Counter.count += 10
print(a.count, b.count)`,
    expected_output: '1 10',
    execution_order: [
      'a.count += 1 reads Counter.count (0), adds 1, and binds an instance attribute a.count = 1.',
      'Counter.count += 10 updates the class attribute to 10.',
      'a.count reads its instance attribute (1); b.count falls back to Counter.count (10).',
    ],
    variable_changes: ['a.__dict__ = {"count": 1}', 'b.__dict__ = {}', 'Counter.count = 10'],
    explanation:
      'Assigning to `self.attr` creates an instance-level attribute that shadows the class attribute without changing the class attribute for other instances.',
  },
  {
    id: 'op-nested-comprehension-order',
    title: 'Nested Comprehension Evaluation Order',
    difficulty: 'Medium',
    concept: 'Comprehensions',
    code: `matrix = [[1, 2], [3, 4]]
flat = [val for row in matrix for val in row if val % 2 == 1]
print(flat)`,
    expected_output: '[1, 3]',
    execution_order: [
      'Outer loop: for row in [[1, 2], [3, 4]].',
      'Inner loop: for val in row.',
      'Filter: keeps only odd val (1 and 3).',
    ],
    variable_changes: ['flat = [1, 3]'],
    explanation:
      'Multiple `for` clauses inside a single comprehension execute left-to-right in the exact same nesting order as standard `for` loops.',
  },
  {
    id: 'op-decorator-order',
    title: 'Stacked Decorator Execution Order',
    difficulty: 'Hard',
    concept: 'Decorators',
    code: `def tag(label):
    def deco(fn):
        def wrapper():
            return f"<{label}>{fn()}</{label}>"
        return wrapper
    return deco

@tag("b")
@tag("i")
def text():
    return "hi"

print(text())`,
    expected_output: '<b><i>hi</i></b>',
    execution_order: [
      '@tag("i") wraps text first -> returns "<i>hi</i>".',
      '@tag("b") wraps that wrapper -> wraps result with "<b>...</b>".',
      'Calling text() outputs "<b><i>hi</i></b>".',
    ],
    variable_changes: ['text = tag("b")(tag("i")(text))'],
    explanation:
      'Stacked decorators apply bottom-up at definition time (`b(i(fn))`), so the top decorator runs outermost on invocation.',
  },
  {
    id: 'op-walrus-comprehension',
    title: 'Walrus Operator Leaking Scope',
    difficulty: 'Medium',
    concept: 'Modern Python Syntax',
    code: `nums = [1, 4, 2, 5]
out = [y for x in nums if (y := x * 2) > 5]
print(out, y)`,
    expected_output: '[8, 10] 10',
    execution_order: [
      'Evaluates y := x * 2 for 1 (2), 4 (8), 2 (4), 5 (10).',
      'Keeps values > 5: [8, 10].',
      'Walrus target `y` binds in the enclosing scope, retaining final value 10.',
    ],
    variable_changes: ['out = [8, 10]', 'y = 10'],
    explanation:
      'Unlike comprehension loop variables, assignment expressions (`:=`) bind in the enclosing function/module scope.',
  },
  {
    id: 'op-shallow-matrix-mult',
    title: 'Grid Multiplication Aliasing',
    difficulty: 'Easy',
    concept: 'Lists & Memory Model',
    code: `grid = [[0] * 2] * 3
grid[0][1] = 7
print(grid)`,
    expected_output: '[[0, 7], [0, 7], [0, 7]]',
    execution_order: [
      '[[0] * 2] * 3 creates 3 references to the same inner 2-element list.',
      'grid[0][1] = 7 mutates that single shared inner list.',
      'All 3 rows reflect [0, 7].',
    ],
    variable_changes: ['grid[0] is grid[1] is grid[2] == True'],
    explanation:
      'Sequence multiplication duplicates element references, not deep copies. Use `[[0] * 2 for _ in range(3)]` for independent rows.',
  },
  {
    id: 'op-try-else-finally',
    title: 'Try / Except / Else Flow',
    difficulty: 'Easy',
    concept: 'Exception Handling',
    code: `log = []
try:
    x = int("42")
except ValueError:
    log.append("err")
else:
    log.append("ok")
finally:
    log.append("done")
print("-".join(log))`,
    expected_output: 'ok-done',
    execution_order: [
      'try succeeds: int("42") = 42.',
      'except skipped; else runs and appends "ok".',
      'finally always runs and appends "done".',
    ],
    variable_changes: ['log = ["ok", "done"]'],
    explanation:
      'The `else` clause after `try/except` runs only when the `try` block completes without raising an exception, right before `finally`.',
  },
  {
    id: 'op-defaultdict-missing',
    title: 'Defaultdict Read Side Effect',
    difficulty: 'Medium',
    concept: 'Collections Module',
    code: `from collections import defaultdict
d = defaultdict(list)
_ = d["missing"]
print(len(d), "missing" in d)`,
    expected_output: '1 True',
    execution_order: [
      'Accessing d["missing"] invokes __missing__, inserting key "missing" with [].',
      'len(d) is now 1 and "missing" in d is True.',
    ],
    variable_changes: ['d = defaultdict(list, {"missing": []})'],
    explanation:
      'Subscripting a `defaultdict` with `d[key]` mutates the dictionary by inserting the factory default! Use `d.get(key)` to inspect without insertion.',
  },
  {
    id: 'op-set-order-dedup',
    title: 'Dictionary Key Preservation vs Set',
    difficulty: 'Easy',
    concept: 'Dictionaries & Sets',
    code: `items = ["b", "a", "b", "c", "a"]
unique = list(dict.fromkeys(items))
print(unique)`,
    expected_output: "['b', 'a', 'c']",
    execution_order: [
      'dict.fromkeys inserts keys in first-seen order ("b", "a", "c"), ignoring duplicates.',
      'list(...) extracts those keys preserving insertion order.',
    ],
    variable_changes: ['unique = ["b", "a", "c"]'],
    explanation:
      'Since Python 3.7, `dict` guarantees insertion order, making `list(dict.fromkeys(seq))` the fastest idiomatic way to deduplicate while keeping order.',
  },
  {
    id: 'op-async-gather-order',
    title: 'Async Gather Preserves Input Order',
    difficulty: 'Hard',
    concept: 'Asynchronous Python',
    code: `import asyncio

async def job(name, delay):
    await asyncio.sleep(delay)
    return name

async def main():
    res = await asyncio.gather(job("slow", 0.03), job("fast", 0.005))
    print(res)

asyncio.run(main())`,
    expected_output: "['slow', 'fast']",
    execution_order: [
      'Both coroutines run concurrently; "fast" finishes in 5ms, "slow" in 30ms.',
      'asyncio.gather returns results ordered by argument position, not completion time.',
    ],
    variable_changes: ['res = ["slow", "fast"]'],
    explanation:
      'Even though `"fast"` completes sooner, `asyncio.gather` preserves the exact positional order of the passed awaitables.',
  },
];
