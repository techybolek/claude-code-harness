#!/bin/bash
input=$(cat)
CUR_IN=$(echo "$input" | jq -r '.context_window.current_usage.input_tokens // 0')
CUR_CACHE_READ=$(echo "$input" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0')
CUR_CACHE_CREATE=$(echo "$input" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0')
CUR_OUT=$(echo "$input" | jq -r '.context_window.current_usage.output_tokens // 0')
CTX_TOTAL=$(( CUR_IN + CUR_CACHE_READ + CUR_CACHE_CREATE + CUR_OUT ))
USED_PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0')
DIR=$(basename "$(pwd)")
echo "$DIR | ctx:${CTX_TOTAL} (${USED_PCT}%)"
