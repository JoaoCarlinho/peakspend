#!/usr/bin/env python3
"""
Fix supertest .set() method order in test files.
The .set() method must be called AFTER the HTTP method, not before.

WRONG:  request(app).set('header', 'value').get('/path')
RIGHT:  request(app).get('/path').set('header', 'value')
"""
import re
import sys

def fix_supertest_order(content):
    """
    Fix the order of .set() calls to come after HTTP methods.

    Matches patterns like:
      request(app)
        .set('x-user-id', testUserId)
        .get('/path')

    And transforms to:
      request(app)
        .get('/path')
        .set('x-user-id', testUserId)
    """
    # Pattern to match: request(app)\n + whitespace + .set(...) + \n + whitespace + .METHOD(...)
    # We need to swap the .set() and .METHOD() lines
    pattern = r'request\(app\)\n(\s+)(\.set\([^)]+\))\n(\s+)(\.(?:get|post|put|delete|patch)\([^)]*\))'

    # Replacement: swap the .set() and .METHOD() lines
    def swap_lines(match):
        indent1 = match.group(1)
        set_call = match.group(2)
        indent2 = match.group(3)
        http_call = match.group(4)

        # Return with swapped order
        return f'request(app)\n{indent1}{http_call}\n{indent2}{set_call}'

    fixed_content = re.sub(pattern, swap_lines, content, flags=re.MULTILINE)

    # Count how many replacements were made
    original_count = len(re.findall(pattern, content, flags=re.MULTILINE))

    return fixed_content, original_count

def process_file(filepath):
    """Process a single test file."""
    print(f"Processing: {filepath}")

    try:
        with open(filepath, 'r') as f:
            content = f.read()

        fixed_content, count = fix_supertest_order(content)

        if count > 0:
            with open(filepath, 'w') as f:
                f.write(fixed_content)
            print(f"  ✓ Fixed {count} supertest method order issues")
        else:
            print(f"  → No issues found (already correct)")

        return True
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

if __name__ == '__main__':
    files_to_fix = [
        'tests/e2e/expense-flow.test.ts',
        'tests/integration/api.test.ts',
    ]

    print("=" * 60)
    print("Fixing supertest .set() method order")
    print("=" * 60)

    success_count = 0
    for filepath in files_to_fix:
        if process_file(filepath):
            success_count += 1
        print()

    print("=" * 60)
    print(f"Processed {success_count}/{len(files_to_fix)} files successfully")
    print("=" * 60)
