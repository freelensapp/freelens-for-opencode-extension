# Domain Context

## Terms

### Command-scoped permission

A per-cluster rule that controls which OpenCode tool commands may run. It does not restrict Kubernetes API credentials or direct commands run outside OpenCode.

### Approval rule

A command-scoped permission that requires user approval before OpenCode runs a matching command.

### Approval pattern

A glob pattern matched against a command and its arguments, or against shell command text. Patterns may overlap; matching either requires approval.
