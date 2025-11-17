# Performance Metrics Guide

## Overview
The extension now includes comprehensive performance instrumentation to track tokenization and processing speed.

## Viewing Performance Metrics

### In VS Code Debug Console

1. **Open Output Panel**: `View` → `Output` (or `Ctrl+Shift+U`)
2. **Select Channel**: Choose "Clarion Extensions" from the dropdown
3. **Filter for Performance**: Use the search box to filter logs

### Easy Search Patterns

Search for these patterns in the Output panel:

#### All Performance Metrics
```
📊 PERF:
```
This shows ALL performance-related logs with metrics in an easy-to-read format.

#### Specific Operations

**Tokenization metrics:**
```
PERF: Tokenization complete
```

**Full tokenization (file open, major changes):**
```
PERF: Full tokenization
```

**Incremental tokenization (small edits):**
```
PERF: Incremental tokenization
```

**Index building:**
```
PERF: Built indexes
```

#### By Component

**Tokenizer logs:**
```
[Tokenizer] 📊 PERF:
```

**Token Cache logs:**
```
[TokenCache] 📊 PERF:
```

**Document Structure logs:**
```
[DocumentStructure] 📊 PERF:
```

## Understanding the Metrics

### Tokenization Complete
```
[Tokenizer] 📊 PERF: Tokenization complete | total_ms=45.23, lines=1234, lines_per_ms=27.3, chars=45678, chars_per_ms=1009, tokens=5432, tokens_per_ms=120.1, split_ms=2.34, split_pct=5.2%, tokenize_ms=38.45, tokenize_pct=85.0%, structure_ms=4.44, structure_pct=9.8%
```

**Metrics:**
- `total_ms`: Total time for complete tokenization
- `lines`: Number of lines processed
- `lines_per_ms`: Processing speed (higher is better)
- `chars`: Total characters processed
- `chars_per_ms`: Character processing speed (higher is better)
- `tokens`: Number of tokens generated
- `tokens_per_ms`: Token generation speed (higher is better)
- `split_ms`: Time spent splitting into lines
- `split_pct`: Percentage of time splitting
- `tokenize_ms`: Time spent tokenizing lines
- `tokenize_pct`: Percentage of time tokenizing
- `structure_ms`: Time spent processing document structure
- `structure_pct`: Percentage of time on structure

### Incremental Tokenization
```
[TokenCache] 📊 PERF: Incremental tokenization | total_ms=8.52, changed_lines=3, retokenized_lines=5, tokens=5432, reused_pct=99.1%, detect_ms=0.45, expand_ms=0.23, build_ms=0.78, tokenize_ms=5.12, adjust_ms=0.34, merge_ms=1.23, cache_ms=0.37
```

**Metrics:**
- `total_ms`: Total incremental update time
- `changed_lines`: Lines that actually changed
- `retokenized_lines`: Lines re-tokenized (including dependencies)
- `tokens`: Final token count
- `reused_pct`: Percentage of tokens reused from cache (higher is better)
- `detect_ms`: Time detecting changes
- `expand_ms`: Time expanding to dependencies
- `build_ms`: Time building text for tokenization
- `tokenize_ms`: Time tokenizing changed lines
- `adjust_ms`: Time adjusting line numbers
- `merge_ms`: Time merging with cached tokens
- `cache_ms`: Time updating cache

### Full Tokenization
```
[TokenCache] 📊 PERF: Full tokenization | total_ms=52.34, tokenize_ms=48.23, cache_build_ms=2.89, tokens=5432
```

**Metrics:**
- `total_ms`: Total time including cache building
- `tokenize_ms`: Time spent in tokenizer
- `cache_build_ms`: Time building line-based cache
- `tokens`: Number of tokens generated

### Index Building
```
[DocumentStructure] 📊 PERF: Built indexes | time_ms=1.45, tokens=5432, labels=234, lines=1234, struct_types=12
```

**Metrics:**
- `time_ms`: Time to build all indexes
- `tokens`: Number of tokens indexed
- `labels`: Number of labels indexed
- `lines`: Number of lines indexed
- `struct_types`: Number of unique structure types

## Performance Targets

### Good Performance
- **Full tokenization**: < 50ms for 1000 lines
- **Incremental update**: < 10ms for typical edits (1-10 lines)
- **Token reuse**: > 95% for small edits
- **Throughput**: > 1000 chars/ms

### Excellent Performance
- **Full tokenization**: < 30ms for 1000 lines
- **Incremental update**: < 5ms for typical edits
- **Token reuse**: > 98% for small edits
- **Throughput**: > 1500 chars/ms

## Analyzing Performance Issues

### Slow Full Tokenization
If `total_ms` is high for full tokenization:
1. Check `tokenize_pct` - should be 80-90%
2. If `structure_pct` is high (>15%), document structure processing is slow
3. If `split_pct` is high (>10%), line splitting is slow

### Slow Incremental Updates
If incremental updates are slow:
1. Check `reused_pct` - should be >95% for small edits
2. If `retokenized_lines` is much larger than `changed_lines`, dependency expansion is too aggressive
3. Check `tokenize_ms` - should be proportional to `retokenized_lines`

### Unexpected Full Tokenization
If you see "Full tokenization" when you expected incremental:
- Check if >30% of lines changed (auto-fallback)
- Check if >20% of document length changed (auto-fallback)

## Disabling Performance Logging

To reduce log noise, set logger level to "warn" or "error":

In `server/src/ClarionTokenizer.ts`, `TokenCache.ts`, or `DocumentStructure.ts`:
```typescript
logger.setLevel("warn"); // or "error"
```

This will disable INFO-level logs including performance metrics while keeping warnings and errors.
