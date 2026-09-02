# Jobs board source registry.

# One line per scrape source, appended the same way the topic queue grows.
# A line is `kind:identifier` where kind is the ATS/source type and
# identifier is that platform's public board key:
#   greenhouse:<board-token>   -> https://boards-api.greenhouse.io/v1/boards/{token}/jobs
#   lever:<company-slug>       -> https://api.lever.co/v0/postings/{slug}
#   ashby:<job-board-name>     -> https://api.ashbyhq.com/posting-api/job-board/{name}
#   custom:<careers-url>       -> HTML careers page (needs a page-specific scraper)
#
# The daily job syncs this file into the job_sources table; any new line
# becomes a source the scraper checks going forward. Only sources that
# resolve against their public API on onboarding are activated (enabled).
#
# Comment lines (#) and blank lines are ignored. This file is NOT a claim
# that a company is hiring or what ATS it uses; current availability always
# comes from the live source on each daily run.

# Phase 1 (MVP) sources, verified ATS candidates with India relevance.
greenhouse:phonepe
greenhouse:razorpaysoftwareprivatelimited
lever:zeta
