export const MAX_SOURCE_BYTES = 65536;

export const PYTHON_HARNESS_SCRIPT = `
import ast
import io
import json
import math
import platform
import re
import sys
import time
import tokenize
import traceback
import types
from contextlib import redirect_stderr, redirect_stdout

MAX_OUTPUT_CHARS = 65536
MAX_TRACE_STEPS = 250


def _truncate_output(text: str) -> str:
    if len(text) <= MAX_OUTPUT_CHARS:
        return text
    return text[:MAX_OUTPUT_CHARS] + "\\n...[output truncated]"


def normalize_text(s: str) -> str:
    lines = [line.rstrip() for line in s.replace("\\r\\n", "\\n").strip().split("\\n")]
    return "\\n".join(lines)


def deep_equal(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(float(a), float(b), rel_tol=1e-6, abs_tol=1e-6)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(deep_equal(x, y) for x, y in zip(a, b))
    if isinstance(a, tuple) and isinstance(b, tuple):
        return len(a) == len(b) and all(deep_equal(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(deep_equal(a[k], b[k]) for k in a)
    return a == b


def serialize_result(val):
    if isinstance(val, tuple):
        return [serialize_result(x) for x in val]
    if isinstance(val, set):
        return sorted([serialize_result(x) for x in val], key=lambda x: str(x))
    if isinstance(val, list):
        return [serialize_result(x) for x in val]
    if isinstance(val, dict):
        return {str(k): serialize_result(v) for k, v in val.items()}
    return val


def _pymastery_evaluate(payload_json: str) -> str:
    payload = json.loads(payload_json)
    source_code = payload["source_code"]
    mode = payload["mode"]
    function_name = payload.get("function_name")
    input_data = payload.get("input_data", "")
    expected_output = payload.get("expected_output", "")
    is_custom = bool(payload.get("is_custom", False))

    start = time.perf_counter()
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()

    try:
        ast.parse(source_code, mode="exec")
    except SyntaxError as e:
        elapsed = int((time.perf_counter() - start) * 1000)
        line_info = f" (line {e.lineno})" if e.lineno is not None else ""
        return json.dumps({
            "status": "Runtime Error",
            "passed": False,
            "actual_output": "",
            "error": f"SyntaxError: {e.msg}{line_info}",
            "execution_time_ms": elapsed,
        })

    user_mod = types.ModuleType("__main__")
    user_ns = user_mod.__dict__
    old_main = sys.modules.get("__main__")
    sys.modules["__main__"] = user_mod
    old_stdin = sys.stdin

    try:
        if mode == "stdout":
            sys.stdin = io.StringIO(input_data)
            with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
                exec(compile(source_code, "<solution>", "exec"), user_ns)
            actual = _truncate_output(normalize_text(stdout_buf.getvalue()))
            stderr_text = _truncate_output(stderr_buf.getvalue().strip())
            elapsed = int((time.perf_counter() - start) * 1000)
            if is_custom:
                return json.dumps({
                    "status": "Accepted",
                    "passed": True,
                    "actual_output": actual,
                    "error": stderr_text,
                    "execution_time_ms": elapsed,
                })
            expected = normalize_text(expected_output)
            passed = actual == expected
            return json.dumps({
                "status": "Accepted" if passed else "Wrong Answer",
                "passed": passed,
                "actual_output": actual,
                "error": stderr_text,
                "execution_time_ms": elapsed,
            })

        elif mode == "function":
            with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
                exec(compile(source_code, "<solution>", "exec"), user_ns)

            if not function_name or function_name not in user_ns or not callable(user_ns[function_name]):
                elapsed = int((time.perf_counter() - start) * 1000)
                return json.dumps({
                    "status": "Runtime Error",
                    "passed": False,
                    "actual_output": _truncate_output(stdout_buf.getvalue().strip()),
                    "error": f"Function '{function_name}' is not defined or not callable.",
                    "execution_time_ms": elapsed,
                })

            fn = user_ns[function_name]
            try:
                parsed_input = json.loads(input_data) if input_data.strip() else []
            except json.JSONDecodeError as je:
                elapsed = int((time.perf_counter() - start) * 1000)
                return json.dumps({
                    "status": "Runtime Error",
                    "passed": False,
                    "actual_output": "",
                    "error": f"Invalid JSON test arguments: {je.msg}. Expected JSON array e.g. [10, 25].",
                    "execution_time_ms": elapsed,
                })

            with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
                if isinstance(parsed_input, dict) and parsed_input.get("__kw__") is True:
                    args = parsed_input.get("args", [])
                    kwargs = parsed_input.get("kwargs", {})
                    result = fn(*args, **kwargs)
                elif isinstance(parsed_input, list):
                    result = fn(*parsed_input)
                else:
                    result = fn(parsed_input)

            elapsed = int((time.perf_counter() - start) * 1000)
            norm_result = serialize_result(result)
            try:
                actual_str = json.dumps(norm_result)
            except TypeError:
                actual_str = repr(result)
            actual_str = _truncate_output(actual_str)
            stderr_text = _truncate_output(stderr_buf.getvalue().strip())

            if is_custom:
                printed = _truncate_output(stdout_buf.getvalue().strip())
                combined = actual_str if not printed else f"{actual_str}\\n[stdout]\\n{printed}"
                return json.dumps({
                    "status": "Accepted",
                    "passed": True,
                    "actual_output": combined,
                    "error": stderr_text,
                    "execution_time_ms": elapsed,
                })

            try:
                expected_val = json.loads(expected_output)
                passed = deep_equal(norm_result, expected_val)
            except Exception:
                passed = normalize_text(str(result)) == normalize_text(expected_output)

            return json.dumps({
                "status": "Accepted" if passed else "Wrong Answer",
                "passed": passed,
                "actual_output": actual_str,
                "error": stderr_text,
                "execution_time_ms": elapsed,
            })

        else:
            with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
                exec(compile(source_code, "<solution>", "exec"), user_ns)
                if input_data.strip():
                    exec(compile(input_data, "<test_harness>", "exec"), user_ns)
            actual = _truncate_output(normalize_text(stdout_buf.getvalue()))
            stderr_text = _truncate_output(stderr_buf.getvalue().strip())
            elapsed = int((time.perf_counter() - start) * 1000)
            if is_custom:
                return json.dumps({
                    "status": "Accepted",
                    "passed": True,
                    "actual_output": actual,
                    "error": stderr_text,
                    "execution_time_ms": elapsed,
                })
            expected = normalize_text(expected_output)
            passed = actual == expected
            return json.dumps({
                "status": "Accepted" if passed else "Wrong Answer",
                "passed": passed,
                "actual_output": actual,
                "error": stderr_text,
                "execution_time_ms": elapsed,
            })

    except MemoryError:
        elapsed = int((time.perf_counter() - start) * 1000)
        return json.dumps({
            "status": "Memory Limit Exceeded",
            "passed": False,
            "actual_output": _truncate_output(stdout_buf.getvalue().strip()),
            "error": "MemoryError: Execution exceeded WebAssembly memory limit.",
            "execution_time_ms": elapsed,
        })
    except Exception:
        elapsed = int((time.perf_counter() - start) * 1000)
        tb = traceback.format_exc(limit=6)
        stderr_extra = stderr_buf.getvalue().strip()
        err_msg = tb.strip() if not stderr_extra else f"{stderr_extra}\\n{tb.strip()}"
        return json.dumps({
            "status": "Runtime Error",
            "passed": False,
            "actual_output": _truncate_output(stdout_buf.getvalue().strip()),
            "error": _truncate_output(err_msg),
            "execution_time_ms": elapsed,
        })
    finally:
        sys.stdin = old_stdin
        if old_main is not None:
            sys.modules["__main__"] = old_main


class _TraceLimitExceeded(BaseException):
    pass


def _safe_repr(val, max_len: int = 120) -> str:
    try:
        r = repr(val)
    except Exception:
        r = f"<{type(val).__name__}>"
    if len(r) > max_len:
        return r[:max_len - 3] + "..."
    return r


def _snapshot_locals(frame_locals: dict) -> list[dict]:
    items = []
    for k, v in frame_locals.items():
        if k.startswith("__") and k.endswith("__"):
            continue
        if isinstance(v, types.ModuleType):
            continue
        items.append({
            "name": str(k),
            "value": _safe_repr(v),
            "type": type(v).__name__,
        })
    return items[:40]


def _build_call_stack(frame) -> list[str]:
    stack = []
    cur = frame
    while cur is not None:
        if cur.f_code.co_filename == "<solution>":
            name = cur.f_code.co_name
            stack.append("<module>" if name == "<module>" else f"{name}()")
        cur = cur.f_back
    stack.reverse()
    return stack


def _pymastery_trace(payload_json: str) -> str:
    payload = json.loads(payload_json)
    source_code = payload["source_code"]
    mode = payload.get("mode", "script")
    function_name = payload.get("function_name")
    input_data = payload.get("input_data", "")

    start = time.perf_counter()
    try:
        ast.parse(source_code, mode="exec")
    except SyntaxError as e:
        line_info = f" (line {e.lineno})" if e.lineno is not None else ""
        return json.dumps({
            "ok": False,
            "error": f"SyntaxError: {e.msg}{line_info}",
            "steps": [],
            "truncated": False,
            "final_stdout": "",
            "return_value": None,
            "execution_time_ms": 0,
        })

    source_lines = source_code.splitlines()
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    steps: list[dict] = []
    truncated = False

    def tracer(frame, event, arg):
        nonlocal truncated
        if frame.f_code.co_filename != "<solution>":
            return None
        if event not in ("call", "line", "return", "exception"):
            return tracer
        if len(steps) >= MAX_TRACE_STEPS:
            truncated = True
            raise _TraceLimitExceeded()

        lineno = frame.f_lineno
        line_code = source_lines[lineno - 1].rstrip() if 1 <= lineno <= len(source_lines) else ""
        fn_name = frame.f_code.co_name

        # Skip noisy module-level definition call/return frames in function mode
        ret_str = None
        if event == "return":
            ret_str = _safe_repr(arg)
        elif event == "exception" and isinstance(arg, tuple) and len(arg) >= 2:
            ret_str = f"{arg[0].__name__}: {arg[1]}"

        steps.append({
            "step_index": len(steps) + 1,
            "event": event,
            "line_number": lineno,
            "line_code": line_code,
            "function_name": fn_name,
            "call_stack": _build_call_stack(frame),
            "variables": _snapshot_locals(frame.f_locals),
            "return_value": ret_str,
            "stdout": _truncate_output(stdout_buf.getvalue()),
        })
        return tracer

    user_mod = types.ModuleType("__main__")
    user_ns = user_mod.__dict__
    old_main = sys.modules.get("__main__")
    sys.modules["__main__"] = user_mod
    old_stdin = sys.stdin
    old_trace = sys.gettrace()
    final_return = None
    error_msg = ""

    try:
        if mode == "function" and function_name:
            with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
                exec(compile(source_code, "<solution>", "exec"), user_ns)
            if function_name not in user_ns or not callable(user_ns[function_name]):
                return json.dumps({
                    "ok": False,
                    "error": f"Function '{function_name}' is not defined or not callable.",
                    "steps": [],
                    "truncated": False,
                    "final_stdout": "",
                    "return_value": None,
                    "execution_time_ms": int((time.perf_counter() - start) * 1000),
                })
            fn = user_ns[function_name]
            parsed_input = json.loads(input_data) if input_data.strip() else []
            with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
                sys.settrace(tracer)
                try:
                    if isinstance(parsed_input, dict) and parsed_input.get("__kw__") is True:
                        res = fn(*parsed_input.get("args", []), **parsed_input.get("kwargs", {}))
                    elif isinstance(parsed_input, list):
                        res = fn(*parsed_input)
                    else:
                        res = fn(parsed_input)
                    final_return = _safe_repr(res)
                finally:
                    sys.settrace(None)
        else:
            if mode == "stdout":
                sys.stdin = io.StringIO(input_data)
            with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
                sys.settrace(tracer)
                try:
                    exec(compile(source_code, "<solution>", "exec"), user_ns)
                    if mode == "oop_assert" and input_data.strip():
                        exec(compile(input_data, "<test_harness>", "exec"), user_ns)
                finally:
                    sys.settrace(None)
    except _TraceLimitExceeded:
        pass
    except Exception:
        tb = traceback.format_exc(limit=5)
        error_msg = tb.strip()
    finally:
        sys.settrace(old_trace)
        sys.stdin = old_stdin
        if old_main is not None:
            sys.modules["__main__"] = old_main

    elapsed = int((time.perf_counter() - start) * 1000)
    return json.dumps({
        "ok": error_msg == "",
        "error": _truncate_output(error_msg),
        "steps": steps,
        "truncated": truncated,
        "final_stdout": _truncate_output(stdout_buf.getvalue()),
        "return_value": final_return,
        "execution_time_ms": elapsed,
    })


_SNAKE_CASE_RE = re.compile(r"^_?[a-z][a-z0-9_]*$")
_PASCAL_CASE_RE = re.compile(r"^_?[A-Z][a-zA-Z0-9]*$")
_CONST_CASE_RE = re.compile(r"^_?[A-Z][A-Z0-9_]*$")


def _auto_format_python(source_code: str) -> str:
    lines = source_code.replace("\\r\\n", "\\n").split("\\n")
    cleaned: list[str] = []
    blank_run = 0
    for line in lines:
        expanded = line.expandtabs(4).rstrip()
        if expanded == "":
            blank_run += 1
            if blank_run <= 2:
                cleaned.append("")
        else:
            blank_run = 0
            cleaned.append(expanded)
    while cleaned and cleaned[-1] == "":
        cleaned.pop()
    formatted = "\\n".join(cleaned) + ("\\n" if cleaned else "")
    try:
        ast.parse(formatted)
        return formatted
    except SyntaxError:
        return source_code


def _collect_load_names(node: ast.AST) -> set[str]:
    names: set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Name) and isinstance(child.ctx, (ast.Load, ast.Del)):
            names.add(child.id)
        elif isinstance(child, ast.Attribute) and isinstance(child.value, ast.Name):
            names.add(child.value.id)
    return names


def _pymastery_analyze_quality(payload_json: str) -> str:
    payload = json.loads(payload_json)
    source_code = payload["source_code"]
    issues: list[dict] = []

    lines = source_code.replace("\\r\\n", "\\n").split("\\n")
    for idx, line in enumerate(lines, start=1):
        if len(line) > 100:
            issues.append({
                "line": idx,
                "column": 101,
                "severity": "suggestion",
                "category": "PEP 8",
                "code": "E501",
                "message": f"Line exceeds 100 characters ({len(line)} chars).",
            })
        if line != line.rstrip(" \\t") and line.strip() != "":
            issues.append({
                "line": idx,
                "column": len(line),
                "severity": "suggestion",
                "category": "PEP 8",
                "code": "W291",
                "message": "Trailing whitespace detected.",
            })
        if "\\t" in line[:len(line) - len(line.lstrip())]:
            issues.append({
                "line": idx,
                "column": 1,
                "severity": "warning",
                "category": "PEP 8",
                "code": "W191",
                "message": "Indentation contains tabs; PEP 8 recommends 4 spaces.",
            })

    try:
        tree = ast.parse(source_code, mode="exec")
    except SyntaxError as e:
        issues.append({
            "line": e.lineno or 1,
            "column": e.offset or 1,
            "severity": "warning",
            "category": "Syntax",
            "code": "E999",
            "message": f"SyntaxError: {e.msg}",
        })
        return json.dumps({
            "syntax_valid": False,
            "score": 0,
            "summary": {
                "errors": 1,
                "warnings": len(issues),
                "suggestions": 0,
            },
            "issues": issues,
            "formatted_code": source_code,
        })

    # Collect imported symbols at module/function scopes
    all_loaded = _collect_load_names(tree)
    # Also include string forward references in annotations
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                bound = alias.asname or alias.name.split(".")[0]
                if bound not in all_loaded:
                    issues.append({
                        "line": node.lineno,
                        "column": node.col_offset + 1,
                        "severity": "warning",
                        "category": "Unused Import",
                        "code": "F401",
                        "message": f"Imported module '{bound}' appears unused.",
                    })
        elif isinstance(node, ast.ImportFrom):
            if node.module == "__future__":
                continue
            for alias in node.names:
                if alias.name == "*":
                    continue
                bound = alias.asname or alias.name
                if bound not in all_loaded:
                    issues.append({
                        "line": node.lineno,
                        "column": node.col_offset + 1,
                        "severity": "warning",
                        "category": "Unused Import",
                        "code": "F401",
                        "message": f"Imported symbol '{bound}' appears unused.",
                    })

        elif isinstance(node, ast.ClassDef):
            if not _PASCAL_CASE_RE.match(node.name):
                issues.append({
                    "line": node.lineno,
                    "column": node.col_offset + 1,
                    "severity": "suggestion",
                    "category": "Naming",
                    "code": "N801",
                    "message": f"Class '{node.name}' should use PascalCase (CapWords).",
                })

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            is_dunder = node.name.startswith("__") and node.name.endswith("__")
            if not is_dunder and not _SNAKE_CASE_RE.match(node.name):
                issues.append({
                    "line": node.lineno,
                    "column": node.col_offset + 1,
                    "severity": "suggestion",
                    "category": "Naming",
                    "code": "N802",
                    "message": f"Function '{node.name}' should use snake_case naming.",
                })

            # Type hint checks
            if not is_dunder and not node.name.startswith("_"):
                missing_params = [
                    a.arg for a in (node.args.posonlyargs + node.args.args + node.args.kwonlyargs)
                    if a.arg not in ("self", "cls") and a.annotation is None
                ]
                if missing_params:
                    issues.append({
                        "line": node.lineno,
                        "column": node.col_offset + 1,
                        "severity": "suggestion",
                        "category": "Type Hints",
                        "code": "TYP002",
                        "message": f"Parameters {', '.join(missing_params)} in '{node.name}' lack type annotations.",
                    })
                if node.returns is None:
                    issues.append({
                        "line": node.lineno,
                        "column": node.col_offset + 1,
                        "severity": "suggestion",
                        "category": "Type Hints",
                        "code": "TYP001",
                        "message": f"Function '{node.name}' is missing a return type annotation (e.g., -> None).",
                    })

            # Mutable default argument check
            for default_expr in (node.args.defaults + [d for d in node.args.kw_defaults if d is not None]):
                if isinstance(default_expr, (ast.List, ast.Dict, ast.Set)):
                    issues.append({
                        "line": default_expr.lineno,
                        "column": default_expr.col_offset + 1,
                        "severity": "warning",
                        "category": "Safety",
                        "code": "B006",
                        "message": f"Mutable default literal in '{node.name}' is shared across calls; default to None instead.",
                    })

            # Unused local variables inside this function
            assigned_locals: dict[str, int] = {}
            loaded_in_fn = _collect_load_names(ast.Module(body=node.body, type_ignores=[]))
            for sub in ast.walk(ast.Module(body=node.body, type_ignores=[])):
                if isinstance(sub, ast.Assign):
                    for t in sub.targets:
                        if isinstance(t, ast.Name) and not t.id.startswith("_"):
                            assigned_locals.setdefault(t.id, sub.lineno)
                elif isinstance(sub, ast.AnnAssign) and isinstance(sub.target, ast.Name) and sub.value is not None:
                    if not sub.target.id.startswith("_"):
                        assigned_locals.setdefault(sub.target.id, sub.lineno)
            for var_name, vline in assigned_locals.items():
                if var_name not in loaded_in_fn:
                    issues.append({
                        "line": vline,
                        "column": 1,
                        "severity": "warning",
                        "category": "Unused Variable",
                        "code": "F841",
                        "message": f"Local variable '{var_name}' is assigned in '{node.name}' but never read.",
                    })

        elif isinstance(node, ast.ExceptHandler):
            if node.type is None:
                issues.append({
                    "line": node.lineno,
                    "column": node.col_offset + 1,
                    "severity": "warning",
                    "category": "Safety",
                    "code": "E722",
                    "message": "Avoid bare 'except:'; catch a specific exception type like 'except Exception:'.",
                })

        elif isinstance(node, ast.Compare):
            for op, comp in zip(node.ops, node.comparators):
                if isinstance(op, (ast.Eq, ast.NotEq)) and isinstance(comp, ast.Constant):
                    if comp.value is None:
                        issues.append({
                            "line": node.lineno,
                            "column": node.col_offset + 1,
                            "severity": "suggestion",
                            "category": "Pythonic Idiom",
                            "code": "E711",
                            "message": "Use 'is None' / 'is not None' instead of '==' / '!=' when comparing to None.",
                        })
                    elif isinstance(comp.value, bool):
                        issues.append({
                            "line": node.lineno,
                            "column": node.col_offset + 1,
                            "severity": "suggestion",
                            "category": "Pythonic Idiom",
                            "code": "E712",
                            "message": "Avoid '== True/False'; evaluate truthiness directly or use 'is True/False' if strict.",
                        })

        elif isinstance(node, ast.For):
            if (
                isinstance(node.iter, ast.Call)
                and isinstance(node.iter.func, ast.Name)
                and node.iter.func.id == "range"
                and len(node.iter.args) == 1
                and isinstance(node.iter.args[0], ast.Call)
                and isinstance(node.iter.args[0].func, ast.Name)
                and node.iter.args[0].func.id == "len"
            ):
                issues.append({
                    "line": node.lineno,
                    "column": node.col_offset + 1,
                    "severity": "suggestion",
                    "category": "Pythonic Idiom",
                    "code": "UP001",
                    "message": "Consider iterating directly or using 'enumerate(...)' instead of 'range(len(...))'.",
                })

    # Deduplicate and sort by line
    seen_keys = set()
    unique_issues = []
    for item in sorted(issues, key=lambda x: (x["line"], x["code"])):
        key = (item["line"], item["code"], item["message"])
        if key not in seen_keys:
            seen_keys.add(key)
            unique_issues.append(item)

    warnings_cnt = sum(1 for i in unique_issues if i["severity"] == "warning")
    suggestions_cnt = sum(1 for i in unique_issues if i["severity"] == "suggestion")
    penalty = warnings_cnt * 10 + suggestions_cnt * 4
    score = max(35, min(100, 100 - penalty))

    return json.dumps({
        "syntax_valid": True,
        "score": score,
        "summary": {
            "errors": 0,
            "warnings": warnings_cnt,
            "suggestions": suggestions_cnt,
        },
        "issues": unique_issues[:60],
        "formatted_code": _auto_format_python(source_code),
    })
`;
