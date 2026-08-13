# Topic queue (SKILL_topic_queue.md)
#
# One slug per line, lowercase, hyphenated. To add a topic, append a
# line and push. The daily generation job reads this file, syncs it
# against the topics table, and works on the lowest incomplete entry
# (the last line that is not yet complete) one deck per day.
#
# Topics that have curated sources in /pipeline/sources/<slug>/ are
# grounded on them; topics without sources are generated from DeepSeek's
# own knowledge with a self-check validation pass.

data-structures
computer-networks
operating-systems
system-design
databases
