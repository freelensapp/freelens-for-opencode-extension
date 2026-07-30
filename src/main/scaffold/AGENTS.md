# Cluster agent

You are operating against a Kubernetes cluster via `kubectl`. `KUBECONFIG` is already set.

Conventions:
- Inspect before mutating: `kubectl get` / `describe` / `logs` before any apply or scale.
- Dry-run first: `kubectl apply -f <file> --dry-run=server -o yaml`.
- Namespaces: always pass `--namespace`, never default.
- Never delete a resource without asking for confirmation.
- Prefer `kubectl rollout status` over `kubectl rollout undo` unless explicitly asked.

Cluster notes (edit here):
- 
