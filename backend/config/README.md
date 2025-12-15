# Configuration Files

This directory contains YAML configuration files for the PeakSpend backend security features.

## Tool Permissions (`tool-permissions.yaml`)

Defines role-based access control (RBAC) for LLM tools. This configuration determines which tools each user role can access and what data scopes apply.

### Schema Overview

```yaml
version: "1.0"           # Config version for migration support
roleHierarchy:           # Role inheritance definition
  user: []               # Base role - no inheritance
  admin: [user]          # Admin inherits user permissions
  security: [admin, user] # Security inherits all
defaultDeny: true        # Deny unconfigured tools
tools:                   # Tool permission definitions
  - toolName: string     # Required: unique tool identifier
    description: string  # Required: what the tool does
    allowedRoles: []     # Required: roles that can use this tool
    dataScope: string    # Required: 'own' | 'team' | 'all'
    parameters: []       # Optional: parameter restrictions
    rateLimit: {}        # Optional: rate limiting config
```

### Role Hierarchy

The role hierarchy defines permission inheritance:

| Role | Inherits From | Description |
|------|---------------|-------------|
| `user` | - | Base role for authenticated users |
| `admin` | `user` | Administrative access, includes all user tools |
| `security` | `admin`, `user` | Full security access, includes all tools |

### Data Scopes

| Scope | Description | Use Case |
|-------|-------------|----------|
| `own` | User can only access their own data | Personal expense queries |
| `team` | User can access team member data | Team management features |
| `all` | User can access all data | Admin dashboards, security audits |

### Rate Limiting

Optional rate limiting can be configured per tool:

```yaml
rateLimit:
  maxPerMinute: 30   # Maximum invocations per minute
  maxPerHour: 500    # Maximum invocations per hour
```

### Parameter Restrictions

Optional parameter validation can restrict tool inputs:

```yaml
parameters:
  - parameterName: userId
    pattern: "^[0-9a-fA-F-]+$"  # Regex pattern
  - parameterName: category
    allowedValues: [food, transport, entertainment]  # Whitelist
  - parameterName: query
    maxLength: 500  # Maximum string length
```

### Example: Adding a New Tool

```yaml
- toolName: myNewTool
  description: Does something useful
  allowedRoles: [user, admin, security]  # Who can use it
  dataScope: own                          # Data access level
  rateLimit:
    maxPerMinute: 10
    maxPerHour: 100
  parameters:
    - parameterName: input
      maxLength: 1000
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TOOL_PERMISSIONS_CONFIG` | `./config/tool-permissions.yaml` | Custom config path |
| `TOOL_RBAC_ENABLED` | `true` (in secure mode) | Enable/disable RBAC |

### Validation

The configuration is validated at startup using Zod schemas. Invalid configuration prevents the application from starting (fail-fast principle).

Common validation errors:
- Missing required fields (toolName, description, allowedRoles, dataScope)
- Invalid role values (must be 'user', 'admin', or 'security')
- Invalid data scope values (must be 'own', 'team', or 'all')
- Empty allowedRoles array

---

## Input Inspection Patterns (`injection-patterns.yaml`)

Contains regex patterns for detecting prompt injection attacks.

## Allow/Block Lists (`allow-block-lists.yaml`)

Configurable allow and block lists for input validation.

## Anomaly Rules (`anomaly-rules.yaml`)

Rules for anomaly detection and scoring.

## PII Patterns (`pii-patterns.yaml`)

Patterns for PII detection and redaction.
