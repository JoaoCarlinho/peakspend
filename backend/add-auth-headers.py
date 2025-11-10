#!/usr/bin/env python3
import re

# Read the file
with open('tests/e2e/expense-flow.test.ts', 'r') as f:
    content = f.read()

# Pattern to match multiline: request(app)\n        .METHOD(
# Replace with: request(app)\n        .set('x-user-id', testUserId)\n        .METHOD(
pattern = r'request\(app\)\n(\s+)\.(get|post|put|delete|patch)\('
replacement = r"request(app)\n\1.set('x-user-id', testUserId)\n\1.\2("

# Apply the replacement
new_content = re.sub(pattern, replacement, content, flags=re.MULTILINE)

# Write back
with open('tests/e2e/expense-flow.test.ts', 'w') as f:
    f.write(new_content)

print(f"Updated {content.count('request(app).') - new_content.count('request(app).')} occurrences")
