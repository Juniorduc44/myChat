# References

Add background documents here to be indexed for retrieval.

Files in this section are chunked, indexed with SQLite FTS5, and retrieved
with BM25 ranking. Every snippet cited in a response includes [file:Lstart-end]
provenance so you can verify the source.

## How to add references

1. Drop any `.txt`, `.md`, or plain-text file into the `corpora/` folder.
2. Run `npm run index` (or use the re-index button in settings) to rebuild the index.
3. The AI will automatically retrieve and cite relevant chunks in its responses.

## Retrieval settings

Configured in `workspace.json`:
- `retrieval.topK` — how many snippets to retrieve per message (default: 5)
- `retrieval.includeProvenance` — whether to include file:line citations (default: true)
- `tokenBudget.contextTarget` — max tokens for context + retrieved snippets
