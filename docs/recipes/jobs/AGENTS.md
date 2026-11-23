# jobs implementation guidance

Read RECIPE.md in this directory before modifying jobs. Keep the pending-row →
startup dispatcher → worker pattern; do not enqueue from request handlers or add
`while true` pollers, self-HTTP triggers or sidecar schedulers.
