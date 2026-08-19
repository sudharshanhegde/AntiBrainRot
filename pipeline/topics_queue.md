# Topic queue
#
# One slug per line, lowercase, hyphenated. To add a topic, append a line
# and push. The backend's daily generation job reads this file, syncs it
# against the topics table, and generates one new deck per day for every
# topic that is not yet complete, until each topic reaches its deck target.
#
# This file is machine-read by the backend, so keep it to one slug per line
# with no blank lines between entries.

data-structures
computer-networks
operating-systems
system-design
databases
computer-organization-and-architecture
artificial-intelligence
network-security
network-protocols
quantitative-aptitude
