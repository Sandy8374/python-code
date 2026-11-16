export interface InterviewPrepSeed {
  id: string;
  topic: string;
  topic_order: number;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  answer: string;
  key_points: string[];
  follow_up: string;
  linked_problem_slug: string | null;
}

export const INTERVIEW_PREP_ITEMS: InterviewPrepSeed[] = [
  // 1. Python Fundamentals
  {
    id: 'ip-fund-is-vs-eq',
    topic: 'Python Fundamentals',
    topic_order: 1,
    question: 'What is the difference between `is` and `==` in Python, and why do small integers sometimes make `is` appear to work?',
    difficulty: 'Easy',
    answer:
      '`==` checks value equality by calling `__eq__`, whereas `is` checks object identity (`id(a) == id(b)`). CPython interns small integers (typically -5 to 256) and some compile-time string literals, so two separate evaluations can point to the same cached object, masking bugs until larger values or runtime strings are used.',
    key_points: [
      'Use `is` / `is not` only for singletons like `None`, `True`, `False`, or sentinel objects.',
      'Always use `==` for numeric, string, and container value comparison.',
      'Custom classes inherit identity-based `__eq__` from `object` unless overridden.',
    ],
    follow_up: 'If a class implements `__eq__` without `__hash__`, what happens when you put an instance into a `set` or `dict`?',
    linked_problem_slug: 'reference-cycle-and-interning',
  },
  {
    id: 'ip-fund-mutability-binding',
    topic: 'Python Fundamentals',
    topic_order: 1,
    question: 'Explain Python’s pass-by-object-reference model and how mutable vs immutable objects behave inside functions.',
    difficulty: 'Easy',
    answer:
      'Python passes object references by value (sometimes called call-by-sharing). Rebinding a parameter name inside a function only changes the local reference; however, calling mutating methods (like `.append()` or item assignment) on a mutable argument modifies the shared object seen by the caller.',
    key_points: [
      'Immutable types: `int`, `float`, `str`, `tuple`, `frozenset`, `bytes`.',
      'Mutable types: `list`, `dict`, `set`, `bytearray`, standard class instances.',
      'Augmented assignment `+=` mutates lists in place (`__iadd__`) but rebinds tuples/ints.',
    ],
    follow_up: 'Why can `t = ([1],); t[0] += [2]` mutate `t[0]` while still raising `TypeError`?',
    linked_problem_slug: 'debug-mutable-default-bucket',
  },

  // 2. Strings & Collections
  {
    id: 'ip-str-interning-join',
    topic: 'Strings & Collections',
    topic_order: 2,
    question: 'Why is `"".join(parts)` preferred over repeated `+=` string concatenation inside loops?',
    difficulty: 'Easy',
    answer:
      'Because Python strings are immutable, repeated `s += chunk` inside a loop can allocate new string buffers repeatedly if the object has extra references. `"".join(parts)` calculates the total output byte length in a single pass and allocates the final string buffer once in O(N) time.',
    key_points: [
      'Pre-calculate buffer size once with `str.join`.',
      'F-strings (`f"{a}:{b}"`) are compiled directly to `FORMAT_VALUE` / `BUILD_STRING` bytecode, making them faster than `%` or `.format()`.',
      'Use `io.StringIO` when streaming incremental text builders.',
    ],
    follow_up: 'When does CPython optimize `s += chunk` in place, and why shouldn’t you rely on it?',
    linked_problem_slug: 'url-slug-sanitizer',
  },
  {
    id: 'ip-col-dict-internals',
    topic: 'Strings & Collections',
    topic_order: 2,
    question: 'How does Python’s `dict` preserve insertion order since Python 3.7 while keeping O(1) average lookup?',
    difficulty: 'Medium',
    answer:
      'CPython splits `dict` storage into a compact dense array of `(hash, key, value)` entries appended in insertion order, plus a sparse hash index table holding array indices. Deletions leave dummy markers in the index table and entries compact on resize, reducing memory overhead by ~20% while guaranteeing insertion-order iteration.',
    key_points: [
      'Keys must be hashable (`__hash__` consistent with `__eq__`).',
      'Average lookup/insert/delete is O(1); worst-case hash collision is mitigated by randomized SipHash.',
      'Prefer `collections.Counter`, `defaultdict`, or `dict.setdefault` carefully (`defaultdict[k]` mutates on read).',
    ],
    follow_up: 'What happens if you mutate a dictionary’s keys while iterating over `.items()`?',
    linked_problem_slug: 'lru-ordereddict-cache-sim',
  },

  // 3. Functions
  {
    id: 'ip-fn-args-kwargs',
    topic: 'Functions',
    topic_order: 3,
    question: 'Explain positional-only (`/`), standard, and keyword-only (`*`) parameters in Python function signatures.',
    difficulty: 'Medium',
    answer:
      'Parameters before `/` can only be passed positionally, letting library authors rename parameters freely without breaking callers or avoid collisions with `**kwargs` keys. Parameters after `*` must be passed by keyword, making boolean flags and optional configuration explicit and self-documenting.',
    key_points: [
      'Signature order: `(pos_only, /, standard, *args, kw_only, **kwargs)`.',
      'Keyword-only parameters prevent silent argument-order mistakes at call sites.',
      '`functools.partial` freezes leading positional or keyword arguments cleanly.',
    ],
    follow_up: 'How does `functools.singledispatch` choose which implementation to run at call time?',
    linked_problem_slug: 'positional-only-and-keyword-only-api',
  },
  {
    id: 'ip-fn-closures-nonlocal',
    topic: 'Functions',
    topic_order: 3,
    question: 'How does Python’s LEGB lookup rule work, and when do you need `nonlocal` vs `global`?',
    difficulty: 'Medium',
    answer:
      'Python resolves names in Local -> Enclosing -> Global -> Built-in order. Reading an enclosing variable works automatically, but assigning to it creates a new local shadow unless `nonlocal` is declared (binding to the nearest enclosing function cell variable) or `global` (binding to module scope).',
    key_points: [
      'UnboundLocalError occurs when a function assigns to a variable anywhere in its body before reading it.',
      'Closures store cell objects in `__closure__` so enclosing state survives after the outer function returns.',
      'Use default parameter binding (`i=i`) inside loops to avoid late-binding bugs.',
    ],
    follow_up: 'Why does `nonlocal` fail if the target variable only exists at module level?',
    linked_problem_slug: 'nonlocal-running-counter-factory',
  },

  // 4. OOP
  {
    id: 'ip-oop-mro-super',
    topic: 'OOP',
    topic_order: 4,
    question: 'How does `super()` work with multiple inheritance and C3 Linearization (MRO)?',
    difficulty: 'Hard',
    answer:
      '`super()` does not simply mean "parent class"—it resolves the next class in the runtime instance’s Method Resolution Order (`type(self).__mro__`). C3 Linearization preserves local parent declaration order and ensures every ancestor appears only once after all its subclasses.',
    key_points: [
      'Inspect linearization with `ClassName.__mro__` or `ClassName.mro()`.',
      'Cooperative mixins must consistently call `super()` and accept `**kwargs` if signatures vary.',
      'TypeError is raised at class creation if inheritance creates an inconsistent C3 hierarchy.',
    ],
    follow_up: 'Why is composition often preferred over deep mixin hierarchies in backend services?',
    linked_problem_slug: 'diamond-mro-c3-linearization',
  },
  {
    id: 'ip-oop-classmethod-property',
    topic: 'OOP',
    topic_order: 4,
    question: 'Compare `@staticmethod`, `@classmethod`, and `@property`, and give real production use cases for each.',
    difficulty: 'Easy',
    answer:
      '`@classmethod` receives `cls` and is ideal for alternative constructors (`User.from_dict(...)`) that work cleanly with subclasses. `@staticmethod` receives no implicit first argument and groups pure utility helpers inside a class namespace. `@property` turns getter/setter methods into validated attribute access.',
    key_points: [
      '`@classmethod` respects subclassing (`cls(...)` constructs the subclass, not the base).',
      'Properties let you add validation or lazy computation later without changing attribute syntax.',
      'Keep `@property` fast and side-effect free so callers aren’t surprised by attribute reads.',
    ],
    follow_up: 'How does `@property` relate to Python’s descriptor protocol (`__get__`/`__set__`)?',
    linked_problem_slug: 'oop-classmethod-alternative-constructors',
  },

  // 5. Advanced Python
  {
    id: 'ip-adv-slots-dataclasses',
    topic: 'Advanced Python',
    topic_order: 5,
    question: 'What does `__slots__` do under the hood, and when should you combine it with `@dataclass(slots=True)`?',
    difficulty: 'Medium',
    answer:
      'By default every Python instance allocates a per-object `__dict__` hash map. Defining `__slots__` allocates fixed descriptor offsets directly on the object struct, cutting per-instance memory significantly and slightly speeding attribute access—useful when holding hundreds of thousands of small DTO/record objects.',
    key_points: [
      'Instances with `__slots__` reject arbitrary dynamic attributes unless `"__dict__"` is included.',
      'Subclasses must define their own `__slots__` or they re-introduce `__dict__`.',
      'Python 3.10+ supports `@dataclass(slots=True, frozen=True)` for compact immutable value objects.',
    ],
    follow_up: 'Why can’t a class with `__slots__` (without `"__weakref__"`) be referenced by `weakref.ref()`?',
    linked_problem_slug: 'slots-memory-efficient-point',
  },
  {
    id: 'ip-adv-descriptors-protocols',
    topic: 'Advanced Python',
    topic_order: 5,
    question: 'Distinguish data descriptors vs non-data descriptors and structural `Protocol` typing.',
    difficulty: 'Hard',
    answer:
      'A descriptor implements `__get__`, `__set__`, or `__delete__` on a class attribute. Data descriptors (implementing `__set__` or `__delete__`) take precedence over instance `__dict__`, whereas non-data descriptors (only `__get__`, like functions/methods) are shadowed by instance `__dict__`. `typing.Protocol` enables static duck typing without nominal inheritance.',
    key_points: [
      'Attribute lookup priority: data descriptor -> instance `__dict__` -> non-data descriptor -> class/MRO -> `__getattr__`.',
      'ORMs, `@property`, `@classmethod`, and Pydantic fields rely on descriptors.',
      '`@runtime_checkable` allows `isinstance()` checks against `Protocol` method presence.',
    ],
    follow_up: 'How do Python functions become bound methods when accessed on an instance (`obj.method`)?',
    linked_problem_slug: 'data-descriptor-positive-number',
  },

  // 6. Decorators
  {
    id: 'ip-dec-functools-wraps',
    topic: 'Decorators',
    topic_order: 6,
    question: 'Why must production decorators always use `@functools.wraps(func)`?',
    difficulty: 'Easy',
    answer:
      'Without `@functools.wraps(func)`, the returned wrapper replaces `__name__`, `__doc__`, `__qualname__`, `__annotations__`, and `__wrapped__` with the wrapper’s metadata. This breaks FastAPI route inspection, pytest fixtures, help docs, logging names, and `inspect.signature` reflection.',
    key_points: [
      '`@functools.wraps` copies metadata and sets `__wrapped__ = func` so `inspect.signature` unwraps properly.',
      'Parameterized decorators add an outer factory layer: `def retry(times): def deco(fn): ...`.',
      'Remember stacked decorators apply bottom-up at import/definition time.',
    ],
    follow_up: 'How do you write a single decorator that works both as `@deco` and `@deco(level=2)`?',
    linked_problem_slug: 'functools-wraps-call-counter-decorator',
  },
  {
    id: 'ip-dec-stateful-context',
    topic: 'Decorators',
    topic_order: 6,
    question: 'How do class-based decorators and `@contextlib.contextmanager` complement each other?',
    difficulty: 'Medium',
    answer:
      'Class-based decorators implement `__init__(self, func)` and `__call__(self, *args, **kwargs)`, cleanly encapsulating mutable state like rate limits or hit counters. `@contextmanager` turns a single-`yield` generator into a `with`-statement resource manager where code before `yield` runs in `__enter__` and code in `finally` runs in `__exit__`.',
    key_points: [
      'If decorating methods with a class decorator, implement `__get__` (descriptor) so `self` binds properly.',
      'Always wrap `yield` in `try ... finally` inside `@contextmanager` to guarantee cleanup on exceptions.',
      '`contextlib.ExitStack` manages dynamic numbers of context managers cleanly.',
    ],
    follow_up: 'What must `__exit__` return if you want to suppress an exception vs propagate it?',
    linked_problem_slug: 'parameterized-retry-decorator',
  },

  // 7. Generators
  {
    id: 'ip-gen-yield-from',
    topic: 'Generators',
    topic_order: 7,
    question: 'How do generators save memory in data/ETL pipelines, and what does `yield from` solve?',
    difficulty: 'Medium',
    answer:
      'Generators suspend stack frames between `yield` points and compute one item at a time in O(1) memory instead of materializing huge intermediate lists. `yield from subgen` delegates directly to a sub-generator, forwarding values, `.send()`, `.throw()`, and capturing the sub-generator’s `return` value.',
    key_points: [
      'Generators are single-pass iterators; once `StopIteration` is raised they remain empty.',
      'Pipeline stages (`parse -> filter -> transform`) compose lazily with zero intermediate lists.',
      '`yield from` simplifies recursive traversal (nested dicts/trees) cleanly.',
    ],
    follow_up: 'What happens if you pass a generator expression to both `any()` and `len()`?',
    linked_problem_slug: 'yield-from-nested-tree-flatten',
  },
  {
    id: 'ip-gen-send-close',
    topic: 'Generators',
    topic_order: 7,
    question: 'How does bidirectional communication work with generator `.send()` and `.close()`?',
    difficulty: 'Hard',
    answer:
      'A generator expression `val = yield output` pauses after emitting `output`; calling `gen.send(val)` resumes execution with `val` assigned to the `yield` expression. Before sending a non-`None` value, the generator must be primed with `next(gen)`. Calling `gen.close()` injects `GeneratorExit` so `finally` blocks clean up resources.',
    key_points: [
      'First step must be `next(gen)` or `gen.send(None)` to advance to the first `yield`.',
      'Catching `GeneratorExit` and yielding another value raises `RuntimeError`.',
      'Modern Python uses `async def` / `await` for async coroutines while keeping `yield` for streaming generators.',
    ],
    follow_up: 'Why is `try ... finally` safe for cleanup inside generator functions?',
    linked_problem_slug: 'generator-coroutine-running-average',
  },

  // 8. Iterators
  {
    id: 'ip-iter-protocol',
    topic: 'Iterators',
    topic_order: 8,
    question: 'What is the difference between an Iterable and an Iterator in Python?',
    difficulty: 'Easy',
    answer:
      'An **Iterable** implements `__iter__()` (or legacy `__getitem__`) and returns a fresh Iterator on each traversal (e.g. `list`, `dict`, `range`). An **Iterator** implements both `__iter__()` (returning `self`) and `__next__()` (returning the next item or raising `StopIteration`), representing a stateful single-pass cursor.',
    key_points: [
      '`iter(obj)` invokes `__iter__`; `next(it)` invokes `__next__`.',
      'Returning `self` from an iterable’s `__iter__` makes it single-use (often a design bug for containers!).',
      'Separate container classes (`__iter__` returning a new iterator object) support nested loops safely.',
    ],
    follow_up: 'How does `iter(callable, sentinel)` work without defining a custom class?',
    linked_problem_slug: 'reusable-iterable-vs-exhausted-iterator',
  },
  {
    id: 'ip-iter-itertools',
    topic: 'Iterators',
    topic_order: 8,
    question: 'Which `itertools` functions do you rely on for memory-bounded backend streaming, and what is the `groupby` gotcha?',
    difficulty: 'Medium',
    answer:
      '`itertools.islice`, `chain.from_iterable`, `batched` (3.12+), and `accumulate` process unbounded streams in constant memory. The classic `itertools.groupby(data, key)` gotcha is that it only groups **consecutive** equal keys—unsorted inputs must be sorted by the exact same `key` first, and group iterators must be consumed before advancing.',
    key_points: [
      '`islice(stream, n)` slices any iterator without converting to a `list`.',
      '`itertools.tee` buffers elements in memory when iterators drift apart.',
      'Always materialize `list(group)` inside `groupby` if you store groups.',
    ],
    follow_up: 'Why can `itertools.chain.from_iterable(streams)` avoid eagerly evaluating the outer iterable of streams?',
    linked_problem_slug: 'itertools-islice-batch-stream',
  },

  // 9. Multithreading
  {
    id: 'ip-thr-gil-io',
    topic: 'Multithreading',
    topic_order: 9,
    question: 'What is the GIL in CPython, and why does `threading` still dramatically speed up I/O-bound workloads?',
    difficulty: 'Medium',
    answer:
      'The Global Interpreter Lock (GIL) ensures only one thread executes Python bytecode at a time in standard CPython to protect interpreter reference counts. However, threads release the GIL whenever blocking on network sockets, disk I/O, `time.sleep`, or C extensions like NumPy/zlib, enabling high concurrency for I/O-bound API calls and database queries.',
    key_points: [
      'Use `concurrent.futures.ThreadPoolExecutor` for I/O-bound concurrency.',
      'The GIL does NOT eliminate race conditions—non-atomic compound operations (`x += 1`) still require `threading.Lock` or `RLock`.',
      '`queue.Queue` provides thread-safe producer-consumer coordination out of the box.',
    ],
    follow_up: 'When does acquiring two locks cause a deadlock, and how do you prevent it?',
    linked_problem_slug: 'thread-safe-counter-with-lock',
  },
  {
    id: 'ip-thr-sync-primitives',
    topic: 'Multithreading',
    topic_order: 9,
    question: 'Compare `Lock`, `RLock`, `Semaphore`, `Event`, and `Condition` in Python’s `threading` module.',
    difficulty: 'Medium',
    answer:
      '`Lock` is a basic mutex (re-acquiring on the same thread deadlocks), while `RLock` allows re-entry by the owning thread (tracked by acquisition depth). `Semaphore(n)` caps concurrent access to `n` slots, `Event` broadcasts a boolean signal across threads, and `Condition` pairs a lock with wait/notify queues for bounded buffers.',
    key_points: [
      'Always use `with lock:` context managers so exceptions cannot leak held locks.',
      '`threading.local()` isolates per-thread context such as request IDs.',
      'Check conditions in a `while` loop (`while len(buf) == cap: cond.wait()`) to guard against spurious wakeups.',
    ],
    follow_up: 'Why is `ThreadPoolExecutor.as_completed()` useful for streaming partial results?',
    linked_problem_slug: 'rlock-reentrant-account-transfer',
  },

  // 10. Multiprocessing
  {
    id: 'ip-mp-cpu-pickling',
    topic: 'Multiprocessing',
    topic_order: 10,
    question: 'When should you choose `multiprocessing` / `ProcessPoolExecutor` over `threading`, and what are its serialization constraints?',
    difficulty: 'Medium',
    answer:
      'For CPU-bound Python work (parsing, image math, cryptography, heavy loops), separate OS processes bypass the GIL across multiple CPU cores. Because processes have isolated memory spaces, arguments, worker callables, and return values must be picklable (`pickle`), and `if __name__ == "__main__":` guards are mandatory on Windows/macOS (`spawn`).',
    key_points: [
      'Lambdas, nested closures, and open file/socket handles cannot be pickled across processes.',
      'Chunk small tasks (`chunksize`) to amortize IPC pickling overhead.',
      'Prefer `multiprocessing.shared_memory` for large numeric arrays instead of copying via queues.',
    ],
    follow_up: 'Compare `fork` vs `spawn` start methods and why `fork` can deadlock with multithreaded libraries.',
    linked_problem_slug: 'pickleable-top-level-worker-check',
  },
  {
    id: 'ip-mp-hybrid',
    topic: 'Multiprocessing',
    topic_order: 10,
    question: 'How do you combine FastAPI / asyncio services with CPU-bound Python tasks without blocking the event loop?',
    difficulty: 'Hard',
    answer:
      'Never run heavy CPU work directly inside an `async def` handler—it freezes the single-threaded event loop for all concurrent requests. Offload synchronous blocking I/O with `asyncio.to_thread()` (ThreadPool) or CPU-heavy work via `loop.run_in_executor(process_pool, fn, *args)` or an external task queue.',
    key_points: [
      '`asyncio.to_thread` releases the loop during sync SDK/file calls.',
      'Keep `ProcessPoolExecutor` worker count aligned with `os.cpu_count()`.',
      'Pass lightweight primitive IDs/bytes rather than giant ORM objects to worker processes.',
    ],
    follow_up: 'How can `concurrent.futures.Future` timeouts mislead you if the underlying worker thread doesn’t cancel?',
    linked_problem_slug: 'process-vs-thread-cpu-task-chunking',
  },

  // 11. Async Python
  {
    id: 'ip-async-event-loop',
    topic: 'Async Python',
    topic_order: 11,
    question: 'How does the `asyncio` event loop schedule coroutines, Tasks, and `await` suspension points?',
    difficulty: 'Medium',
    answer:
      'Calling an `async def` function returns a coroutine object without running it. Wrapping it in `asyncio.create_task()` or `asyncio.gather()` schedules it on the single-threaded cooperative event loop. Execution runs until an `await` suspends on an I/O Future, yielding control back to the loop to drive other ready tasks.',
    key_points: [
      'Cooperative multitasking: a CPU loop or `time.sleep()` without `await` stalls every other coroutine.',
      'Always keep references to background `create_task()` handles to avoid premature garbage collection.',
      'Use `asyncio.gather(..., return_exceptions=True)` or Python 3.11+ `TaskGroup` for structured error handling.',
    ],
    follow_up: 'Why does forgetting `await` produce a coroutine object silently instead of raising an immediate syntax error?',
    linked_problem_slug: 'asyncio-gather-concurrent-calls',
  },
  {
    id: 'ip-async-cancellation-sem',
    topic: 'Async Python',
    topic_order: 11,
    question: 'How do `asyncio.wait_for`, `CancelledError`, and `asyncio.Semaphore` protect production GenAI / API clients?',
    difficulty: 'Hard',
    answer:
      '`asyncio.Semaphore(limit)` caps in-flight concurrent LLM/HTTP requests so downstream services aren’t overwhelmed. `asyncio.wait_for(coro, timeout)` cancels runaway calls by injecting `asyncio.CancelledError` at the next `await`. Critical cleanup must live in `finally:` blocks—and if catching `CancelledError` for cleanup, always re-raise it unless intentionally handling cancellation.',
    key_points: [
      'Swallowing `asyncio.CancelledError` breaks structured cancellation and timeouts.',
      'Use `asyncio.shield()` when an inner write/commit must finish even if the caller times out.',
      'Combine `Semaphore` + exponential backoff retries for resilient external API fan-out.',
    ],
    follow_up: 'What is the difference between `asyncio.Lock` and `threading.Lock` inside an async function?',
    linked_problem_slug: 'asyncio-semaphore-rate-limiter',
  },

  // 12. Practical Backend Coding
  {
    id: 'ip-be-di-config',
    topic: 'Practical Backend Coding',
    topic_order: 12,
    question: 'How should Python backend services structure configuration, secret redaction, and dependency injection for testability?',
    difficulty: 'Medium',
    answer:
      'Validate environment variables at startup into typed immutable settings objects (`@dataclass(frozen=True)` or Pydantic `BaseSettings`), redact secrets in `__repr__`/logs, and inject repositories/clients as `Protocol` interfaces rather than hardcoding global singletons inside business logic.',
    key_points: [
      'Fail fast on missing required env vars at boot rather than mid-request.',
      'Mask tokens/passwords in structured JSON logging filters.',
      'Use dependency injection containers or FastAPI `Depends()` so unit tests can swap real clients for fakes.',
    ],
    follow_up: 'Why is `unittest.mock.patch(..., autospec=True)` safer than un-specced `MagicMock`?',
    linked_problem_slug: 'dependency-injection-container',
  },
  {
    id: 'ip-be-testing-profiling',
    topic: 'Practical Backend Coding',
    topic_order: 12,
    question: 'How do you isolate flaky tests, benchmark slow Python code, and generate tool schemas for GenAI agents?',
    difficulty: 'Hard',
    answer:
      'Inject clocks/RNGs and use `unittest.mock` with `autospec=True` to preserve signature checks; profile CPU hotspots with `cProfile`/`pstats` and micro-benchmarks with `timeit` before optimizing; and inspect type annotations + docstrings via `inspect.signature` + `typing.get_type_hints` to auto-generate strict JSON schemas for Agentic AI tool calling.',
    key_points: [
      'Measure with `cProfile` before rewriting—I/O and O(N²) loops dominate most slowdowns.',
      'Use `logging` with structured JSON formatters instead of `print()` in production services.',
      'Use `typing.get_type_hints` and `inspect.signature` for runtime contract validation and tool schemas.',
    ],
    follow_up: 'What subtle bug does `assert` have if Python is started with `-O` (optimize flag)?',
    linked_problem_slug: 'json-schema-tool-spec-from-signature',
  },
];
