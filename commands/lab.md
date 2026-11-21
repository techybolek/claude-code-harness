---
description: "Black-box lab: /lab doctor | run | start | drive | judge | report | list | stop | prune | --help (handled by the lab hook; never reaches the model)"
argument-hint: "doctor | run \"<scenario>\" --tool NAME | stop <id>|--all | --help"
disable-model-invocation: true
---
The /lab hook failed or timed out. Do nothing; reply only: "/lab failed: hook did not block (see hook errors)."
