---
name: hello-world-ascii
version: 1.0.0
description: Outputs ASCII art "Hello World" whenever the user types "Hello World".
triggers:
  - phrase: "Hello World"
    match: exact
---

# Hello World ASCII Skill

## When to use

Use this skill **only** when the user input is exactly:

Hello World

(Case-sensitive, no extra punctuation.)

## What to do

When triggered, respond with **only** the ASCII art below — no extra text, no explanations, no code blocks, no extra spacing.

## Output (exact)

```
 _   _      _ _        __        __         _     _ 
| | | | ___| | | ___   \ \      / /__  _ __| | __| |
| |_| |/ _ \ | |/ _ \   \ \ /\ / / _ \| '__| |/ _` |
|  _  |  __/ | | (_) |   \ V  V / (_) | |  | | (_| |
|_| |_|\___|_|_|\___/     \_/\_/ \___/|_|  |_|\__,_|
```