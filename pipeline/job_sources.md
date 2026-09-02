# Jobs board source registry.

# One line per scrape source, appended the same way the topic queue grows.
# A line is `kind:identifier` where kind is the ATS/source type and
# identifier is that platform's public board key:
#   greenhouse:<board-token>   -> https://boards-api.greenhouse.io/v1/boards/{token}/jobs
#   lever:<company-slug>       -> https://api.lever.co/v0/postings/{slug}
#   ashby:<job-board-name>     -> https://api.ashbyhq.com/posting-api/job-board/{name}
#   custom:<careers-url>       -> HTML careers page (needs a page-specific scraper)
#
# The registry file is the source of truth: the daily sync enables every
# source listed here and disables any that are removed. ONLY sources that
# resolve against their live public API are listed (verified below); anything
# else is commented out so it does not 404 on every run. Current availability
# always comes from the live source on each run.
#
# Comment lines (#) and blank lines are ignored.

# --- Active sources (verified HTTP 200 against the live API) ---

# Greenhouse
greenhouse:razorpaysoftwareprivatelimited
greenhouse:postman
greenhouse:coinbase
greenhouse:anthropic
greenhouse:arcesiumllc
greenhouse:cloudsek
greenhouse:bluevineindia
greenhouse:togetherai
greenhouse:stripe
greenhouse:successkpiinc
greenhouse:groww
greenhouse:slice

# Lever
lever:zeta
lever:cred
lever:meesho
lever:paytm
lever:fampay
lever:mindtickle
lever:saviynt
lever:acceldata
lever:dnb
lever:unlimit
lever:smarsh
lever:peoplegrove
lever:smart-working-solutions

# --- Previously-tried sources that did NOT resolve (kept for reference) ---
# Fix/confirm the board token or slug, then move the line above to activate.
# greenhouse:phonepe             HTTP 404
# greenhouse:browserstack        HTTP 404 (on lever too)
# greenhouse:swiggy              HTTP 404 -> use lever? (lever:swiggy also 404)
# greenhouse:dream11             HTTP 404
# greenhouse:urbancompany        HTTP 404 (lever:urbancompany also 404)
# greenhouse:meesho              HTTP 404 -> active on lever instead
# greenhouse:cred                HTTP 404 -> active on lever instead
# greenhouse:unacademy           HTTP 404 (lever:unacademy also 404)
# greenhouse:upgrad              HTTP 404 (lever:upgrad also 404)
# greenhouse:zepto               HTTP 404
# greenhouse:chargebee           HTTP 404 (lever:chargebee also 404)
# greenhouse:clevertap           HTTP 404 (lever:clevertap also 404)
# greenhouse:moengage            HTTP 404 (lever:moengage also 404)
# greenhouse:mindtickle          HTTP 404 -> active on lever instead
# greenhouse:whatfix             HTTP 404
# greenhouse:uniphore            HTTP 404
# greenhouse:livspace            HTTP 404
# greenhouse:cars24              HTTP 404 (lever:cars24 also 404)
# greenhouse:ola                 HTTP 404 (lever:ola also 404)
# greenhouse:rapido              HTTP 404 (lever:rapido also 404)
# greenhouse:payu                HTTP 404
# greenhouse:policybazaar        HTTP 404 (lever:policybazaar also 404)
# greenhouse:upstox              HTTP 404 -> active on lever? (lever:upstox 404)
# greenhouse:zerodha             HTTP 404
# greenhouse:makemytrip          HTTP 404
# greenhouse:goibibo             HTTP 404
# greenhouse:acko                HTTP 404 (lever:acko also 404)
# greenhouse:fi                  HTTP 404
# greenhouse:jar                 HTTP 404
# lever:zeotap                   HTTP 404
# lever:browserstack             HTTP 404 (on greenhouse too)
# lever:groww                    HTTP 404 -> active on greenhouse instead
# lever:vedantu                  HTTP 404
# lever:sharechat                HTTP 404
# lever:dailyhunt                HTTP 404
# lever:inmobi                   HTTP 404
# lever:glance                   HTTP 404
# lever:carwale                  HTTP 404
# lever:spinny                   HTTP 404
# lever:digit                    HTTP 404
# lever:pine-labs                HTTP 404
# lever:mobikwik                 HTTP 404
# lever:moneyview                HTTP 404
# lever:niyo                     HTTP 404
# lever:rupeek                   HTTP 404
# lever:rebel-foods              HTTP 404
# lever:tredence                 HTTP 404
# lever:tiger-analytics          HTTP 404
# lever:fractal-analytics        HTTP 404
# lever:zoho                     HTTP 404
