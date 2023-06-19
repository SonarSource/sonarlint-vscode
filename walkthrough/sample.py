def my_function():
    i = 10
    return i + 1       # Noncompliant
    i += 1             # this is never executed
