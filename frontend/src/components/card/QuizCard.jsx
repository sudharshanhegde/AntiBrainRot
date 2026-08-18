import { useState } from "react";
import { submitQuizAnswer } from "../../api/quizzes";
import { FallingPetals } from "./FallingPetals";

// quiz template: one question, four tappable options,
// one tap to answer, no typing, no multi-step interaction. The correct
// answer is evaluated against the card's correct_option_id.
//
// Correct: a one-shot falling-petals burst (static checkmark under
// prefers-reduced-motion) plus a short affirming line.
// Wrong: no negative animation, no red flash. The correct option is
// highlighted, a brief line points back at the card above, and the user
// can continue or swipe back up to reread. No forced retry loop.
export function QuizCard({ card, accent }) {
  const [selectedId, setSelectedId] = useState(null);
  const answered = selectedId != null;
  const isCorrect = selectedId != null && selectedId === card.correct_option_id;

  const accentVar = `var(--${accent})`;

  const handleSelect = (optionId) => {
    if (answered) return;
    setSelectedId(optionId);
    submitQuizAnswer({
      cardId: card.card_id,
      selectedOptionId: optionId,
      isCorrect: optionId === card.correct_option_id,
    });
  };

  return (
    <div className="relative flex flex-col gap-5">
      {answered && isCorrect && <FallingPetals />}

      <div>
        <p
          className="font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: accentVar }}
        >
          quiz
        </p>
        <h2 className="mt-1 font-sans text-2xl font-semibold leading-snug tracking-tight sm:text-[1.75rem]">
          {card.question}
        </h2>
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label="Quiz options">
        {(card.options || []).map((opt) => {
          const isSelected = selectedId === opt.id;
          const isCorrectOption = opt.id === card.correct_option_id;
          const showCorrect = answered && isCorrectOption;
          const showWrong = answered && isSelected && !isCorrectOption;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelect(opt.id)}
              disabled={answered}
              aria-pressed={isSelected}
              aria-label={showCorrect ? `${opt.text}, correct` : undefined}
              className={
                "quiz-option" +
                (answered && !isCorrectOption && !isSelected ? " quiz-option-dim" : "")
              }
              style={showCorrect ? { borderColor: accentVar } : undefined}
            >
              <span
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
                style={{ color: showCorrect ? accentVar : undefined }}
              >
                {showCorrect ? "✓" : opt.id}
              </span>
              <span className="flex-1">{opt.text}</span>
              {showWrong && (
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                  missed
                </span>
              )}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="flex items-center gap-3">
          {isCorrect ? (
            <span className="font-sans text-[16px] font-medium">That's right</span>
          ) : (
            <span className="font-sans text-[16px] leading-relaxed text-muted">
              Worth another look at the card above.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
