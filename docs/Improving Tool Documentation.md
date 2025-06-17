# Improving Tool Documentation and Metadata for the Local Git MCP Connector

To enhance how the tools and their behavior are explained to an LLM, we propose improvements across the codebase. Below, we organize recommendations by module/file, focusing on clearer function definitions, standardized metadata, and more explanatory documentation patterns.

## Module: **Local Git MCP Connector Implementation**

**Issues Identified:** In the main connector code (responsible for `search` and `fetch` actions), the function docstrings and action descriptions are terse or generic. For example, the current description for the search tool is simply **“Searches for resources using the provided query string and returns matching results.”** This wording is somewhat vague (“resources” could be clarified) and provides no context or usage example. Similarly, the fetch action description **“Retrieves detailed content for a specific resource identified by the given ID.”** omits details about what a “resource” is (likely a file or code snippet) or how the ID is obtained.

**Recommendations:**

* **Clarify Action Descriptions:** Revise the `search` action’s description to be more explicit about scope and results. For instance: *“Searches the connected code repository for files or content matching the given query string, and returns a list of matching file references.”* Likewise, update the `fetch` description to: *“Fetches the contents of a file or resource identified by an ID (such as one returned from the search results) and returns its detailed content.”*

* **Enhance Function Docstrings:** Add or expand the docstrings for the `search` and `fetch` methods in the connector class. Use a structured format that clearly explains purpose, parameters, return value, and usage examples.

* **Use Consistent Terminology:** Replace vague terms like “resource” with more precise alternatives like “file” or “code snippet” where applicable.

* **Inline Comments for Complex Logic:** Add brief inline comments explaining each logical step in implementations (e.g., filtering, parsing).

## Module: **Tool Action Schema and Metadata**

**Issues Identified:** Action schemas may omit descriptions for optional fields and use inconsistent terminology. Return types are complex and lack plain-language explanations.

**Recommendations:**

* **Standardize Parameter Definitions:** Include full descriptions for all parameters, e.g.:

  ```json
  "properties": {
    "query": {"type": "string", "description": "The search query string (keywords or code to find)"},
    "topn": {"type": "number", "description": "Maximum number of results to return (default 10)", "default": 10},
    "recency_days": {"type": "number", "description": "If provided, limit search to content updated in the last N days"}
  }
  ```

* **Expand Return Type Clarity:** Mention return structure in the action descriptions, e.g., *“Returns a list of matching resource identifiers with brief context.”*

* **Consistency Across Tools:** Match metadata style and tone across all defined tools, using imperative present tense, consistent casing, and uniform phrasing.

* **Metadata for LLM Guidance:** Add a `title` and `description` to parameter objects for added semantic clarity, even if not exposed directly to the LLM.

* **Centralize Common Definitions:** If `$defs` are reused, centralize them in a shared schema module and document thoroughly.

## Module: **Documentation and Usage Guides**

**Issues Identified:** README and dev docs may focus on setup, not on how an LLM should reason about the tools or use them.

**Recommendations:**

* **Add LLM-Facing Tool Descriptions:**

  * *Tool:* **search** — Use this to locate code snippets or files based on a keyword query.
  * *Tool:* **fetch** — Use this to retrieve the content of a specific file ID returned by a search.

* **Provide Example Scenarios:**

  ```markdown
  **Example:**  
  *User asks:* "How does the connector define its search parameters?"  
  *LLM action:* `browser.search` with query `"def search"` → receives file ID  
  *LLM action:* `browser.fetch` with that ID to retrieve content.
  ```

* **Disambiguate Known Edge Cases:** E.g., explain that binary files are not searchable or viewable.

## **General Style and Consistency Guidelines**

* **Adopt a Docstring Style Guide:** Use a consistent format (e.g., Google style) for all public method documentation.

* **Semantic Function Naming:** Prefer descriptive names (e.g., `_grep_repo()` vs. `_srch()`).

* **Avoid Ambiguity in Comments:** Replace vague pronouns with explicit references in inline comments.

* **Purpose Metadata:** If the tool framework allows, add a `category` or `purpose` tag to each tool for classification (e.g., “code-navigation”).

* **Match Other Connectors:** If multiple connectors exist, align the documentation and metadata style across all.

By implementing these changes, the connector will be significantly more interpretable to LLMs, with clearer semantics, consistent descriptions, and better structure across its schema and documentation.
