# Syllabus: data-structures
#
# One "## <subject>" heading per subject, in teaching order. Each bullet
# under it is one concept, in the order it should be taught. The backend's
# daily generation job reads this file and syncs it into the syllabus table;
# the file wins once it exists. A deck is CARDS_PER_DECK (default 3)
# concepts plus their quizzes, so a subject becomes several decks, shown as
# "Array, part 1 of N".
#
# To control a topic's syllabus, paste its draft here and edit freely. To
# add a concept, append a bullet; to add a subject, append a heading and
# its bullets. Do not renumber existing concepts once decks have published.

## array
- what an array is: contiguous memory, fixed size
- indexing and why access is O(1)
- insert and delete, and why they shift elements
- searching: linear versus binary
- cost summary and common pitfalls

## linked-list
- nodes and pointers
- traversing a list from the head
- insert and delete by relinking
- singly versus doubly linked lists
- cost summary and where lists beat arrays
